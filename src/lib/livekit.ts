import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  Track,
} from "livekit-client";

const httpBase = process.env.NEXT_PUBLIC_BACKEND_HTTP_URL ?? "";

type TokenResponse = {
  token: string;
  url: string;
  room: string;
  identity: string;
  error?: string;
};

export async function connectLiveKit(
  sessionId: string,
  options?: {
    videoContainer?: HTMLElement | null;
    onVideoChange?: (hasVideo: boolean) => void;
    enableVideo?: boolean;
  },
): Promise<{
  room: Room;
  audioTrack: LocalAudioTrack;
}> {
  const response = await fetch(`${httpBase}/livekit/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, identity: `caller-${sessionId.slice(0, 6)}` }),
  });
  const payload = (await response.json()) as TokenResponse;
  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? "Unable to fetch LiveKit token");
  }

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  await room.connect(payload.url, payload.token);
  const audioTrack = await createLocalAudioTrack();
  await room.localParticipant.publishTrack(audioTrack);

  room.on(
    RoomEvent.TrackSubscribed,
    (track: RemoteTrack, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        const element = track.attach();
        element.setAttribute("data-livekit-remote-audio", "true");
        element.style.display = "none";
        document.body.appendChild(element);
        void element.play().catch(() => {
          // If autoplay is blocked, the user interaction (Start Conversation) will unlock it.
        });
      }
      if (
        track.kind === Track.Kind.Video &&
        options?.videoContainer &&
        options.enableVideo !== false
      ) {
        options.videoContainer.replaceChildren();
        const element = track.attach();
        element.setAttribute("data-livekit-remote-video", "true");
        element.style.width = "100%";
        element.style.height = "100%";
        element.style.objectFit = "cover";
        options.videoContainer.appendChild(element);
        options.onVideoChange?.(true);
      }
    },
  );

  room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Audio) {
      track.detach().forEach((el) => el.remove());
    }
    if (track.kind === Track.Kind.Video && options?.videoContainer) {
      track.detach().forEach((el) => el.remove());
      options.videoContainer.replaceChildren();
      options.onVideoChange?.(false);
    }
  });

  room.on(RoomEvent.Disconnected, () => {
    audioTrack.stop();
    document
      .querySelectorAll('[data-livekit-remote-audio="true"]')
      .forEach((el) => el.remove());
    if (options?.videoContainer) {
      options.videoContainer.replaceChildren();
      options.onVideoChange?.(false);
    }
  });

  return { room, audioTrack };
}
