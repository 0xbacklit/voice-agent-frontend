"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Summary, ToolCallEvent } from "@/lib/types";
import { connectLiveKit } from "@/lib/livekit";
import { connectSession, fetchToolCalls, startSession } from "@/lib/session";
import type { LocalAudioTrack, Room } from "livekit-client";

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>("idle");
  const [toolCalls, setToolCalls] = useState<ToolCallEvent[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [localAudioTrack, setLocalAudioTrack] =
    useState<LocalAudioTrack | null>(null);
  const [showToolDrawer, setShowToolDrawer] = useState(false);
  const [showSummaryDrawer, setShowSummaryDrawer] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [booting, setBooting] = useState(true);
  const [toastTool, setToastTool] = useState<ToolCallEvent | null>(null);
  const [toastSummary, setToastSummary] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const autoStartRef = useRef(false);
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const pendingEndRef = useRef(false);

  const toolLabel = (name: string) => {
    const labels: Record<string, string> = {
      identify_user: "Identifed User",
      fetch_slots: "Viewed Available Slots",
      book_appointment: "Booked Appointment",
      retrieve_appointments: "Retrieved Appointments",
      cancel_appointment: "Cancelled Appointment",
      modify_appointment: "Modified Appointment",
      end_conversation: "Ended Conversation",
    };
    return (
      labels[name] ??
      name.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
    );
  };

  const formatSummaryDate = (value: string) => {
    if (!value) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
    return value;
  };

  const canConnect = useMemo(() => {
    return (
      !!process.env.NEXT_PUBLIC_BACKEND_HTTP_URL &&
      !!process.env.NEXT_PUBLIC_BACKEND_WS_URL
    );
  }, []);
  const audioOnlyMode = useMemo(
    () => process.env.NEXT_PUBLIC_BEY_ENABLED !== "true",
    [],
  );

  useEffect(() => {
    if (!sessionId) return;

    const socket = connectSession(sessionId, (event) => {
      if (event.type === "status") {
        setConnectionState(event.payload.state);
      }
      if (event.type === "tool_call") {
        setToolCalls((prev) => [event.payload, ...prev]);
        setToastTool(event.payload);
        if (event.payload.name === "end_conversation") {
          pendingEndRef.current = true;
          setTimeout(() => {
            if (pendingEndRef.current) {
              handleEndCall();
            }
          }, 1500);
        }
      }
      if (event.type === "session_closed") {
        pendingEndRef.current = true;
        setTimeout(() => {
          if (pendingEndRef.current) {
            handleEndCall();
          }
        }, 1500);
      }
      if (event.type === "summary") {
        setSummary(event.payload);
        setToastSummary(true);
        if (pendingEndRef.current) {
          setTimeout(() => {
            if (pendingEndRef.current) {
              handleEndCall();
            }
          }, 1200);
        }
      }
    });

    socket.addEventListener("close", () => {
      setConnectionState("disconnected");
    });

    sessionSocketRef.current = socket;
    return () => {
      socket.close();
      if (sessionSocketRef.current === socket) {
        sessionSocketRef.current = null;
      }
    };
  }, [sessionId]);
  useEffect(() => {
    if (!toastTool) return;
    const timeout = setTimeout(() => setToastTool(null), 4500);
    return () => clearTimeout(timeout);
  }, [toastTool]);

  useEffect(() => {
    if (toolCalls.length === 0) return;
    setToastTool((prev) => prev ?? toolCalls[0]);
  }, [toolCalls]);

  useEffect(() => {
    if (!toastSummary) return;
    const timeout = setTimeout(() => setToastSummary(false), 5000);
    return () => clearTimeout(timeout);
  }, [toastSummary]);

  useEffect(() => {
    if (!canConnect || autoStartRef.current) return;
    autoStartRef.current = true;
    void handleStart();
  }, [canConnect]);

  const handleStart = async () => {
    setError(null);
    setHasEnded(false);
    setBooting(true);
    try {
      const response = await startSession();
      setSessionId(response.session_id);
      setConnectionState("connecting");
      setToolCalls([]);
      setSummary(null);
      try {
        const existing = await fetchToolCalls(response.session_id);
        setToolCalls(existing);
      } catch {
        // ignore if session has no tool calls yet
      }
      const { room: livekitRoom, audioTrack } = await connectLiveKit(
        response.session_id,
        {
          videoContainer: videoContainerRef.current,
          onVideoChange: setHasVideo,
        },
      );
      setRoom(livekitRoom);
      setLocalAudioTrack(audioTrack);
    } catch (err) {
      setError("Unable to start session. Check backend config.");
      setBooting(false);
    }
  };

  const isConnected = connectionState === "connected";

  const handleEndCall = () => {
    sessionSocketRef.current?.close();
    sessionSocketRef.current = null;
    if (room && localAudioTrack) {
      try {
        room.localParticipant.unpublishTrack(localAudioTrack);
      } catch {
        // ignore if already unpublished
      }
      localAudioTrack.stop();
    }
    room?.removeAllListeners();
    room?.disconnect();
    document
      .querySelectorAll('[data-livekit-remote-audio="true"]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('[data-livekit-remote-video="true"]')
      .forEach((el) => el.remove());
    if (videoContainerRef.current) {
      videoContainerRef.current.replaceChildren();
    }
    setRoom(null);
    setLocalAudioTrack(null);
    setConnectionState("disconnected");
    setHasVideo(false);
    setSessionId(null);
    setHasEnded(true);
    setBooting(false);
  };

  return (
    <div className="flex h-screen flex-col px-6 py-8 text-white md:px-12">
      <header className="mx-auto flex w-full max-w-6xl flex-none items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            AI Voice Agent
          </p>
          <h1 className="display-font text-3xl font-semibold md:text-4xl">
            Always-on appointment concierge
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-[color:var(--stroke)] bg-[color:var(--panel)] px-4 py-2 text-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                connectionState === "connected"
                  ? "bg-[color:var(--success)]"
                  : "bg-[color:var(--accent)]"
              }`}
            ></span>
            {sessionId ? `Session ${connectionState}` : "No session"}
          </div>
        </div>
      </header>

      <main className="mx-auto mt-6 h-full w-full max-w-6xl">
        <section className="glass-panel relative flex h-full flex-col rounded-3xl">
          <div className="relative flex-1 overflow-hidden rounded-2xl border border-[color:var(--stroke)] bg-gradient-to-br from-[#1b2735] via-[#0d141e] to-[#0b0c10] soft-glow">
            <div ref={videoContainerRef} className="absolute inset-0" />
            {audioOnlyMode ? (
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">
                    Voice Only
                  </p>
                  <p className="mt-2 text-lg">
                    {isConnected
                      ? "Listening…"
                      : booting || connectionState === "connecting"
                        ? "Starting voice session..."
                        : hasEnded
                          ? "Session ended. Tap Connect to start again."
                          : "Ready to talk. Tap Connect to start."}
                  </p>
                </div>
              </div>
            ) : (
              !hasVideo && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">
                      Avatar Stream
                    </p>
                    <p className="mt-2 text-lg">
                      {booting || connectionState === "connecting" || sessionId
                        ? "Loading avatar..."
                        : hasEnded
                          ? "Session ended. Tap Connect to start again."
                          : "Loading avatar..."}
                    </p>
                  </div>
                </div>
              )
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            <div className="absolute inset-x-6 bottom-6 flex items-center gap-4">
              {!isConnected && !booting ? (
                <button
                  onClick={handleStart}
                  className="pointer-events-auto rounded-full border border-transparent bg-[color:var(--accent)] px-6 py-3 text-sm font-semibold text-[#0b0c10] transition hover:opacity-90"
                >
                  Connect Voice Agent
                </button>
              ) : (
                <button
                  onClick={handleEndCall}
                  className="pointer-events-auto rounded-full border border-[color:var(--stroke)] bg-black/60 px-6 py-3 text-sm font-semibold text-[color:var(--foreground)] transition hover:bg-black/80"
                >
                  End Call
                </button>
              )}
              <div className="ml-auto flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowToolDrawer(true);
                    setShowSummaryDrawer(false);
                  }}
                  className="pointer-events-auto rounded-full border border-[color:var(--stroke)] bg-black/60 px-4 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)] transition hover:text-[color:var(--foreground)]"
                >
                  Tool Calls {"(" + toolCalls.length + ")"}
                </button>
                <button
                  onClick={() => {
                    setShowSummaryDrawer(true);
                    setShowToolDrawer(false);
                  }}
                  className="pointer-events-auto rounded-full border border-[color:var(--stroke)] bg-black/60 px-4 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)] transition hover:text-[color:var(--foreground)]"
                >
                  Summary
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="text-xs text-[color:var(--danger)]">{error}</div>
          )}
        </section>
        {toastTool && (
          <div className="toast-card fixed right-6 top-24 z-40 w-[280px] rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--panel-strong)] p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">
              Tool Call
            </p>
            <p className="mt-2 text-sm font-semibold">
              {toolLabel(toastTool.name)}
            </p>
            <p className="mt-1 text-xs text-[color:var(--muted)]">
              {toastTool.detail}
            </p>
            <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--muted)]">
              <span>
                {toastTool.status === "completed" ? "" : toastTool.status}
              </span>
              <button
                onClick={() => {
                  setShowToolDrawer(true);
                  setShowSummaryDrawer(false);
                }}
                className="rounded-full border border-[color:var(--stroke)] bg-black/40 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[color:var(--foreground)]"
              >
                Details
              </button>
            </div>
          </div>
        )}
        {toastSummary && (
          <div className="toast-card fixed right-6 top-[120px] z-40 w-[280px] rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--panel-strong)] p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">
              Summary Ready
            </p>
            <p className="mt-2 text-sm text-[color:var(--foreground)]">
              Conversation summary has been generated.
            </p>
            <div className="mt-3 text-right">
              <button
                onClick={() => {
                  setShowSummaryDrawer(true);
                  setShowToolDrawer(false);
                }}
                className="rounded-full border border-[color:var(--stroke)] bg-black/40 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[color:var(--foreground)]"
              >
                Details
              </button>
            </div>
          </div>
        )}
        <div
          className={`fixed inset-0 z-30 transition ${
            showToolDrawer ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity ${
              showToolDrawer ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => setShowToolDrawer(false)}
          />
          <aside
            className={`glass-panel absolute right-0 top-0 h-full w-full max-w-md transform rounded-none p-6 transition-transform sm:rounded-l-3xl ${
              showToolDrawer ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="display-font text-xl">Tool Calls</h3>
              <button
                onClick={() => setShowToolDrawer(false)}
                className="rounded-full border border-[color:var(--stroke)] bg-[color:var(--panel)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)] transition hover:text-[color:var(--foreground)]"
              >
                Close
              </button>
            </div>
            <div className="mt-4 h-[calc(100%-60px)] overflow-y-auto pr-2">
              {toolCalls.length === 0 && (
                <p className="text-sm text-[color:var(--muted)]">
                  No tool calls yet. Start a session to stream events here.
                </p>
              )}
              {toolCalls.map((tool) => (
                <div
                  key={tool.id}
                  className="rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--panel)] px-4 py-3"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">
                      {toolLabel(tool.name)}
                    </span>
                    {tool.status !== "completed" && (
                      <span
                        className={`text-xs uppercase tracking-[0.2em] ${
                          tool.status === "active"
                            ? "text-[color:var(--accent)]"
                            : "text-[color:var(--muted)]"
                        }`}
                      >
                        {tool.status}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    {tool.detail}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </div>
        <div
          className={`fixed inset-0 z-30 transition ${
            showSummaryDrawer ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity ${
              showSummaryDrawer ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => setShowSummaryDrawer(false)}
          />
          <aside
            className={`glass-panel absolute right-0 top-0 h-full w-full max-w-md transform rounded-none p-6 transition-transform sm:rounded-l-3xl ${
              showSummaryDrawer ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="display-font text-xl">Conversation Summary</h3>
              <button
                onClick={() => setShowSummaryDrawer(false)}
                className="rounded-full border border-[color:var(--stroke)] bg-[color:var(--panel)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)] transition hover:text-[color:var(--foreground)]"
              >
                Close
              </button>
            </div>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Generated at call end • 10s SLA
            </p>
            <div className="mt-4 h-[calc(100%-120px)] overflow-y-auto pr-2">
              <div className="rounded-2xl border border-dashed border-[color:var(--stroke)] bg-[color:var(--panel)] p-4 text-sm text-[color:var(--muted)]">
                {summary
                  ? summary.summary
                  : "Summary will appear here once the session ends."}
              </div>
              {summary?.booked_appointments?.length ? (
                <div className="mt-4 space-y-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">
                    Booked Appointments
                  </p>
                  {summary.booked_appointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--panel-strong)] px-4 py-3 text-sm"
                    >
                      <div className="font-semibold text-[color:var(--foreground)]">
                        {appt.name}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--muted)]">
                        {formatSummaryDate(`${appt.date}T${appt.time}:00`)} •{" "}
                        {appt.contact_number}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {summary && (
                <button
                  onClick={() => navigator.clipboard.writeText(summary.summary)}
                  className="mt-4 rounded-full border border-[color:var(--stroke)] bg-[color:var(--panel-strong)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--foreground)] transition hover:bg-black/40"
                >
                  Copy Summary
                </button>
              )}
              {summary && (
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                  {summary.preferences.map((pref) => (
                    <span
                      key={pref}
                      className="rounded-full border border-[color:var(--stroke)] bg-[color:var(--panel-strong)] px-3 py-1"
                    >
                      Preference: {pref}
                    </span>
                  ))}
                  {summary.booked_appointments.map((appt) => (
                    <span
                      key={appt.id}
                      className="rounded-full border border-[color:var(--stroke)] bg-[color:var(--panel-strong)] px-3 py-1"
                    >
                      Booking: {appt.date} {appt.time}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
