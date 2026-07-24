import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const [incomingCall, setIncomingCall] = useState(null);
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      console.log("Hentet bruker fra auth.getUser():", data?.user?.id);
      if (data?.user) setUserId(data.user.id);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("Auth state endret, ny bruker-ID:", session?.user?.id);
      setUserId(session?.user?.id || null);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      console.log("CallProvider venter fremdeles på userId...");
      return;
    }

    console.log("OPPRETTER REALTIME-LYTTER for kanal: user-calls:", userId);

    const channel = supabase
      .channel(`user-calls:${userId}`)
      .on("broadcast", { event: "call-invite" }, (payload) => {
        console.log("MOTTAC KALL-INVITASJON PÅ MAC:", payload);
        setIncomingCall(payload.payload);
      })
      .subscribe((status) => {
        console.log("Kanal-status for user-calls:", status);
      });

    return () => {
      console.log("Fjerner lytter-kanal");
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const acceptCall = () => {
    if (!incomingCall) return;
    const activeCall = incomingCall;
    setIncomingCall(null);
    navigate(`/call/${activeCall.conversationId}`, {
      state: {
        isVideo: activeCall.isVideo,
        isAnswering: true,
        callerName: activeCall.callerName || "Contact"
      }
    });
  };

  const declineCall = async () => {
    if (!incomingCall) return;
    try {
      const callChannel = supabase.channel(`room_call:${incomingCall.conversationId}`);
      await callChannel.subscribe();
      await callChannel.send({
        type: "broadcast",
        event: "hangup",
        payload: { senderId: userId }
      });
    } catch (err) {
      console.error("Kunne ikke sende avvis-signal:", err);
    }
    setIncomingCall(null);
  };

  return (
    <CallContext.Provider value={{ incomingCall, acceptCall, declineCall }}>
      {children}

      {incomingCall && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          backgroundColor: "#0d0d12", zIndex: 999999, display: "flex",
          flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#ffffff"
        }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <h2>{incomingCall.callerName || "Unknown Contact"}</h2>
            <p>{incomingCall.isVideo ? "📹 Innkommende videosamtale..." : "📞 Innkommende anrop..."}</p>
          </div>
          <div style={{ display: "flex", gap: "32px" }}>
            <button onClick={declineCall} style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: "#ff3b30", border: "none", cursor: "pointer", color: "#fff" }}>✕</button>
            <button onClick={acceptCall} style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: "#34c759", border: "none", cursor: "pointer", color: "#fff" }}>✓</button>
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCall må brukes innenfor en CallProvider");
  return context;
}