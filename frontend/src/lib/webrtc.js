import { supabase } from "./supabase";

// Direkte STUN- og TURN-servere for stabil nettverkstraversering på tvers av enheter
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turns:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

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
    this.facingMode = "user";
    this.lastOffer = null;
    this.pendingIceCandidates = [];
    this.pendingOutgoingIce = [];
    this.remotePeerReady = false;
    this.localTracksAdded = false;
    this._lastHandledOfferSdp = null;
  }

  async _createPeerConnection() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (this.isCaller && !this.remotePeerReady) {
          this.pendingOutgoingIce.push(event.candidate);
        } else {
          this._signal("ice-candidate", { candidate: event.candidate });
        }
      }
    };

    this.pc.ontrack = (event) => {
      const stream = event.streams[0];
      this.onRemoteStream?.(stream);
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      this.onStateChange?.(state);

      if (state === "failed") {
        try {
          this.pc.restartIce?.();
        } catch (e) {
          console.error("[WebRTC] restartIce feilet:", e);
        }
        setTimeout(() => {
          if (this.pc?.connectionState === "failed") {
            this.hangup("connection_failed_8s");
          }
        }, 8000);
      } else if (state === "closed") {
        this.hangup("connection_closed");
      }
    };

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: this.isVideo ? { facingMode: this.facingMode } : false,
    });

    if (!this.pc) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
      return null;
    }

    this.localStream.getTracks().forEach((track) => {
      this.pc.addTrack(track, this.localStream);
    });
    this.localTracksAdded = true;

    return this.localStream;
  }

  _signal(type, payload) {
    this.channel?.send({
      type: "broadcast",
      event: "signal",
      payload: { type, from: this.userId, ...payload },
    });
  }

  _subscribeSignaling() {
    this.channel = supabase.channel(`call:${this.conversationId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      if (payload.from === this.userId) return;

      switch (payload.type) {
        case "ready":
          this.remotePeerReady = true;
          if (this.isCaller && this.lastOffer && this.pc?.signalingState === "have-local-offer") {
            this._signal("offer", { offer: this.lastOffer });
          }
          this._flushOutgoingIce();
          break;
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
          this.hangup("remote_hangup");
          break;
      }
    });

    return new Promise((resolve) => {
      this.channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
    });
  }

  async startCall() {
    this.isCaller = true;
    await this._subscribeSignaling();
    const localStream = await this._createPeerConnection();
    if (!this.pc) return null;

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.lastOffer = offer;
    this._signal("offer", { offer });

    return localStream;
  }

  async answerCall() {
    this.isCaller = false;
    await this._subscribeSignaling();
    const localStream = await this._createPeerConnection();
    if (!this.pc) return null;

    this._signal("ready", {});
    return localStream;
  }

  async _ensureLocalTracks(timeoutMs = 5000) {
    const start = Date.now();
    while (!this.localTracksAdded && this.pc && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async _handleOffer(offer) {
    if (this._lastHandledOfferSdp === offer.sdp) return;
    if (!this.pc) await this._createPeerConnection();
    await this._ensureLocalTracks();
    if (!this.pc) return;
    this._lastHandledOfferSdp = offer.sdp;
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this._flushPendingIce();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this._signal("answer", { answer });
  }

  async _handleAnswer(answer) {
    if (!this.pc || this.pc.signalingState !== "have-local-offer") return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this._flushPendingIce();
  }

  _flushOutgoingIce() {
    if (this.pendingOutgoingIce.length === 0) return;
    for (const c of this.pendingOutgoingIce) {
      this._signal("ice-candidate", { candidate: c });
    }
    this.pendingOutgoingIce = [];
  }

  async _flushPendingIce() {
    if (!this.pc?.remoteDescription || this.pendingIceCandidates.length === 0) return;
    for (const c of this.pendingIceCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (err) {
        console.error("[WebRTC] feil ved ICE fra buffer:", err);
      }
    }
    this.pendingIceCandidates = [];
  }

  async _handleIceCandidate(candidate) {
    try {
      if (!this.pc || !this.pc.remoteDescription) {
        this.pendingIceCandidates.push(candidate);
        return;
      }
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
    }
  }

  toggleMute() {
    const audioTrack = this.localStream?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled;
    }
    return false;
  }

  toggleCamera() {
    const videoTrack = this.localStream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled;
    }
    return false;
  }

  async switchCamera() {
    if (!this.isVideo || !this.localStream) return null;

    const prev = this.facingMode;
    this.facingMode = prev === "user" ? "environment" : "user";

    let newStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode },
        audio: false,
      });
    } catch (err) {
      console.warn("[WebRTC] switchCamera feilet:", err.name);
      this.facingMode = prev;
      return null;
    }

    const newVideoTrack = newStream.getVideoTracks()[0];
    const oldVideoTrack = this.localStream.getVideoTracks()[0];

    if (oldVideoTrack) newVideoTrack.enabled = oldVideoTrack.enabled;

    const sender = this.pc?.getSenders().find((s) => s.track && s.track.kind === "video");
    if (sender) {
      try {
        await sender.replaceTrack(newVideoTrack);
      } catch (err) {
        console.error("[WebRTC] replaceTrack feilet:", err);
        newVideoTrack.stop();
        this.facingMode = prev;
        return null;
      }
    }

    if (oldVideoTrack) {
      this.localStream.removeTrack(oldVideoTrack);
      oldVideoTrack.stop();
    }
    this.localStream.addTrack(newVideoTrack);

    return this.localStream;
  }

  hangup(reason = "manual") {
    if (this._hungUp) return;
    this._hungUp = true;
    this._signal("hangup", { reason });
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.pc?.close();
    if (this.channel) supabase.removeChannel(this.channel);
    this.pc = null;
    this.localStream = null;
    this.channel = null;
    this.onStateChange?.("ended");
  }
}

export const listenForCalls = (userId, onIncomingCall) => {
  const channelName = `user-calls:${userId}`;
  const channel = supabase.channel(channelName, {
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: "incoming-call" }, ({ payload }) => {
    onIncomingCall(payload);
  });

  channel.subscribe();
  return channel;
};

export const inviteToCall = async ({ targetUserId, conversationId, callerId, callerName, isVideo }) => {
  const channelName = `user-calls:${targetUserId}`;
  console.log("[inviteToCall] Forsøker å sende anrop til kanal:", channelName);

  const channel = supabase.channel(channelName);

  await new Promise((resolve, reject) => {
    let resolved = false;
    channel.subscribe((status) => {
      console.log("[inviteToCall] Abonnement-status:", status);
      if (status === "SUBSCRIBED" && !resolved) {
        resolved = true;
        resolve();
      }
      if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !resolved) {
        resolved = true;
        reject(new Error(`Channel subscribe ${status}`));
      }
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Channel subscribe timeout (3s)"));
      }
    }, 3000);
  });

  const res = await channel.send({
    type: "broadcast",
    event: "call-invite",
    payload: { 
      conversationId, 
      callerId, 
      callerName, 
      isVideo 
    },
  });

  console.log("[inviteToCall] Sendt resultat:", res);

  setTimeout(() => supabase.removeChannel(channel), 1000);
};