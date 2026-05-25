import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { listenForCalls } from "../lib/webrtc";
import { supabase } from "../lib/supabase";
import "./IncomingCall.css";

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState(null);

  // ── Listen for incoming calls globally ──────────────────────
  useEffect(() => {
    if (!user) return;
    const channel = listenForCalls(user.id, (payload) => {
      setIncomingCall(payload);
      // Auto-dismiss after 30s if not answered
      setTimeout(() => setIncomingCall((c) => (c === payload ? null : c)), 30000);
    });
    return () => supabase.removeChannel(channel);
  }, [user]);

  // ── Accept ──────────────────────────────────────────────────
  const acceptCall = () => {
    if (!incomingCall) return;
    const { conversationId, callerName, isVideo } = incomingCall;
    setIncomingCall(null);
    navigate(`/call/${conversationId}`, {
      state: { isVideo, isAnswering: true, callerName },
    });
  };

  // ── Decline ─────────────────────────────────────────────────
  const declineCall = () => setIncomingCall(null);

  return (
    <CallContext.Provider value={{ incomingCall }}>
      {children}
      {incomingCall && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-card">
            <div className="incoming-avatar">
              {incomingCall.callerName?.[0]?.toUpperCase() || "?"}
            </div>
            <p className="incoming-name">{incomingCall.callerName}</p>
            <p className="incoming-type">
              {incomingCall.isVideo ? "📹 Incoming video call" : "📞 Incoming call"}
            </p>

            <div className="incoming-actions">
              <button className="incoming-btn decline" onClick={declineCall}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
                  <line x1="23" y1="1" x2="1" y2="23"/>
                </svg>
              </button>
              <button className="incoming-btn accept" onClick={acceptCall}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}

export const useCall = () => useContext(CallContext);
