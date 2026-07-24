import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { CallSession } from "../lib/webrtc";
import { PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff, RefreshCw } from "lucide-react";
import "./CallRoom.css";

export default function CallRoom() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isVideo = location.state?.isVideo ?? true;
  const callerName = location.state?.callerName || "Contact";

  const [callState, setCallState] = useState("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    if (!user || !conversationId) return;

    const session = new CallSession({
      conversationId,
      userId: user.id,
      isVideo,
      onRemoteStream: (stream) => {
        console.log("[CallRoom] Mottok fjern-stream (remote stream)!");
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      },
      onStateChange: (state) => {
        console.log("[CallRoom] Tilstand endret:", state);
        setCallState(state);
        if (state === "ended") {
          setTimeout(() => navigate(-1), 1500);
        }
      }
    });

    sessionRef.current = session;

    async function initCall() {
      try {
        let stream;
        if (location.state?.isAnswering) {
          stream = await session.answerCall();
        } else {
          stream = await session.startCall();
        }

        if (localVideoRef.current && stream) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Feil ved oppstart av samtalen:", err);
      }
    }

    initCall();

    return () => {
      session.hangup("cleanup");
    };
  }, [conversationId, user, isVideo, location.state, navigate]);

  const handleHangup = () => {
    sessionRef.current?.hangup("manual");
    navigate(-1);
  };

  const toggleMute = () => {
    const muted = sessionRef.current?.toggleMute();
    if (muted !== undefined) setIsMuted(muted);
  };

  const toggleCamera = () => {
    const off = sessionRef.current?.toggleCamera();
    if (off !== undefined) setIsVideoOff(off);
  };

  const switchCamera = async () => {
    const newStream = await sessionRef.current?.switchCamera();
    if (newStream && localVideoRef.current) {
      localVideoRef.current.srcObject = newStream;
    }
  };

  return (
    <div className="call-room-container" style={{ position: "relative", width: "100vw", height: "100vh", backgroundColor: "#0b0b0f", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center" }}>
      
      {/* Fjern-video (stor skjerm) */}
      <video 
        ref={remoteVideoRef} 
        autoPlay 
        playsInline 
        style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", top: 0, left: 0, zIndex: 1 }} 
      />

      {/* Status / Ventertekst hvis ingen bilde enda */}
      <div style={{ position: "absolute", zIndex: 2, top: "24px", color: "#fff", background: "rgba(0,0,0,0.6)", padding: "8px 16px", borderRadius: "20px", fontSize: "0.9rem" }}>
        {callState === "connected" ? callerName : `Status: ${callState}`}
      </div>

      {/* Lokal video (liten rute nede i hjørnet) */}
      {isVideo && (
        <div style={{ position: "absolute", bottom: "100px", right: "24px", width: "120px", height: "160px", backgroundColor: "#1f1f2e", borderRadius: "12px", overflow: "hidden", zIndex: 3, border: "2px solid rgba(255,255,255,0.2)" }}>
          <video ref={localVideoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}

      {/* Kontrollknapper i bunnen */}
      <div style={{ position: "absolute", bottom: "24px", zIndex: 10, display: "flex", gap: "16px", alignItems: "center" }}>
        <button onClick={toggleMute} style={{ width: "50px", height: "50px", borderRadius: "50%", backgroundColor: isMuted ? "#ff3b30" : "#2a2a3c", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        {isVideo && (
          <>
            <button onClick={toggleCamera} style={{ width: "50px", height: "50px", borderRadius: "50%", backgroundColor: isVideoOff ? "#ff3b30" : "#2a2a3c", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isVideoOff ? <VideoOff size={20} /> : <VideoIcon size={20} />}
            </button>
            <button onClick={switchCamera} style={{ width: "50px", height: "50px", borderRadius: "50%", backgroundColor: "#2a2a3c", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RefreshCw size={20} />
            </button>
          </>
        )}

        <button onClick={handleHangup} style={{ width: "60px", height: "60px", borderRadius: "50%", backgroundColor: "#ff3b30", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(255,59,48,0.4)" }}>
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
}