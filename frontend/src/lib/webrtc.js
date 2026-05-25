import { supabase } from "./supabase";

// ── ICE servers ───────────────────────────────────────────────────────────────
// STUN is free (Google public). TURN goes here once your Coturn server is up.
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // ── Add your Coturn TURN server later: ──
    // {
    //   urls: "turn:turn.yourdomain.com:3478",
    //   username: "txtt",
    //   credential: "your_turn_password",
    // },
  ],
};

/**
 * CallSession manages one WebRTC call.
 * Signaling (offer/answer/ICE) is exchanged over a Supabase Realtime channel
 * keyed by conversationId.
 */
export class CallSession {
  constructor({ conversationId, userId, isVideo, onRemoteStream, onStateChange }) {
    this.conversationId = conversationId;
    this.userId = userId;
    this.isVideo = isVideo;
    this.onRemoteStream = onRemoteStream;
    this.onStateChange = onStateChange;

    this.pc = null;
    this.localStream = null;
    this.channel = null;
    this.isCaller = false;
  }

  // ── Set up the peer connection ──────────────────────────────
  async _createPeerConnection() {
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    // Send our ICE candidates to the other peer
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._signal("ice-candidate", { candidate: event.candidate });
      }
    };

    // Receive the remote stream
    this.pc.ontrack = (event) => {
      this.onRemoteStream?.(event.streams[0]);
    };

    // Track connection state
    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      this.onStateChange?.(state);
      if (state === "disconnected" || state === "failed" || state === "closed") {
        this.hangup();
      }
    };

    // Get local audio/video
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: this.isVideo,
    });
    this.localStream.getTracks().forEach((track) => {
      this.pc.addTrack(track, this.localStream);
    });

    return this.localStream;
  }

  // ── Signaling helper ────────────────────────────────────────
  _signal(type, payload) {
    this.channel?.send({
      type: "broadcast",
      event: "signal",
      payload: { type, from: this.userId, ...payload },
    });
  }

  // ── Subscribe to signaling channel ──────────────────────────
  _subscribeSignaling() {
    this.channel = supabase.channel(`call:${this.conversationId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      // Ignore our own messages
      if (payload.from === this.userId) return;

      switch (payload.type) {
        case "offer":
          await this._handleOffer(payload.offer);
          break;
        case "answer":
          await this._handleAnswer(payload.answer);
          break;
        case "ice-candidate":
          await this._handleIceCandidate(payload.candidate);
          break;
        case "hangup":
          this.hangup();
          break;
      }
    });

    return new Promise((resolve) => {
      this.channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
    });
  }

  // ── Caller: start the call ──────────────────────────────────
  async startCall() {
    this.isCaller = true;
    await this._subscribeSignaling();
    const localStream = await this._createPeerConnection();

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this._signal("offer", { offer });

    return localStream;
  }

  // ── Callee: answer the call ─────────────────────────────────
  async answerCall() {
    this.isCaller = false;
    await this._subscribeSignaling();
    return await this._createPeerConnection();
  }

  // ── Handle incoming offer (callee side) ─────────────────────
  async _handleOffer(offer) {
    if (!this.pc) await this._createPeerConnection();
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this._signal("answer", { answer });
  }

  // ── Handle incoming answer (caller side) ────────────────────
  async _handleAnswer(answer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  // ── Handle ICE candidate ────────────────────────────────────
  async _handleIceCandidate(candidate) {
    try {
      await this.pc?.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
    }
  }

  // ── Toggle mute ─────────────────────────────────────────────
  toggleMute() {
    const audioTrack = this.localStream?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // returns true if now muted
    }
    return false;
  }

  // ── Toggle camera ───────────────────────────────────────────
  toggleCamera() {
    const videoTrack = this.localStream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled; // returns true if camera now off
    }
    return false;
  }

  // ── Hang up ─────────────────────────────────────────────────
  hangup() {
    this._signal("hangup", {});
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.pc?.close();
    if (this.channel) supabase.removeChannel(this.channel);
    this.pc = null;
    this.localStream = null;
    this.channel = null;
    this.onStateChange?.("ended");
  }
}

// ── Incoming call listener ──────────────────────────────────────────────────────
// Each user listens on a personal channel for incoming call invites.
export const listenForCalls = (userId, onIncomingCall) => {
  const channel = supabase.channel(`user-calls:${userId}`, {
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: "incoming-call" }, ({ payload }) => {
    onIncomingCall(payload); // { conversationId, callerId, callerName, isVideo }
  });

  channel.subscribe();
  return channel;
};

// ── Send a call invite to another user ─────────────────────────────────────────
export const inviteToCall = async ({ targetUserId, conversationId, callerId, callerName, isVideo }) => {
  const channel = supabase.channel(`user-calls:${targetUserId}`);
  await new Promise((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });

  await channel.send({
    type: "broadcast",
    event: "incoming-call",
    payload: { conversationId, callerId, callerName, isVideo },
  });

  // Clean up after sending
  setTimeout(() => supabase.removeChannel(channel), 1000);
};
