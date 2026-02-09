import type { SessionStartResponse, Summary, ToolCallEvent } from "./types";

type SessionEvent =
  | { type: "status"; payload: { session_id: string; state: string } }
  | { type: "tool_call"; payload: ToolCallEvent }
  | { type: "summary"; payload: Summary }
  | { type: "session_closed"; payload: { session_id: string } };

const httpBase = process.env.NEXT_PUBLIC_BACKEND_HTTP_URL ?? "";
const wsBase = process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "";

export async function startSession(): Promise<SessionStartResponse> {
  const response = await fetch(`${httpBase}/session/start`, { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to start session");
  }
  return response.json();
}

export function connectSession(
  sessionId: string,
  onEvent: (event: SessionEvent) => void,
): WebSocket {
  const wsUrl = `${wsBase}/session/${sessionId}/events`;
  const socket = new WebSocket(wsUrl);

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data) as SessionEvent;
    onEvent(payload);
  });

  return socket;
}

export async function pushToolCall(
  sessionId: string,
  event: ToolCallEvent,
): Promise<void> {
  await fetch(`${httpBase}/session/${sessionId}/tools`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
}

export async function fetchToolCalls(
  sessionId: string,
): Promise<ToolCallEvent[]> {
  const response = await fetch(`${httpBase}/session/${sessionId}/tools`);
  if (!response.ok) {
    throw new Error("Failed to fetch tool calls");
  }
  return response.json();
}
