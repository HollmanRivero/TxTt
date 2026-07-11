import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import "./ChatRoom.css";

export default function ChatRoom() {
  const params = useParams();
  const conversationId = params.id || params.conversationId || Object.values(params)[0];
  
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const localVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!conversationId || !user) {
      setLoading(false);
      return;
    }

    let active = true;

    async function loadMessagesOnly() {
      try {
        const { data: msgs, error: msgsErr } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });
        
        if (msgsErr) throw msgsErr;
        if (active) setMessages(msgs || []);
      } catch (err) {
        console.error("Klarte ikke hente meldinger:", err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadMessagesOnly();

    const channel = supabase
      .channel(`room:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (active) setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [conversationId, user]);

  const handleLogAction = (val) => {
    if (val === "0") return;
    
    if (val === "now") {
      setMessages([]);
      return;
    }

    const minutes = parseFloat(val);
    const ms = minutes * 60 * 1000;
    setTimeout(() => { 
      setMessages([]); 
    }, ms);
  };

  const handleSendMessage = async () => {
    const cleanMessage = newMessage.trim();
    if (!cleanMessage || !user || !conversationId || conversationId.includes("00000000")) return;

    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        text: cleanMessage, 
      });

      if (error) {
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: cleanMessage, 
        });
      }
      setNewMessage("");
    } catch (err) {
      console.error(err);
    }
  };

  const capturePhoto = async () => {
    if (!localVideoRef.current || !canvasRef.current || !user || !conversationId) return;
    const video = localVideoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const photoDataUrl = canvas.toDataURL("image/jpeg", 0.8);

    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        text: photoDataUrl,
      });
      if (error) {
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: photoDataUrl,
        });
      }
      toggleCamera();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleCamera = async () => {
    if (cameraActive) {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
      }
      setCameraActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        cameraStreamRef.current = stream;
        setCameraActive(true);
        setTimeout(() => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.play().catch(e => console.error(e));
          }
        }, 100);
      } catch (err) {
        alert("Kunne ikke starte kamera.");
      }
    }
  };

  const handleMicClick = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        mediaRecorder.onstop = () => { stream.getTracks().forEach(track => track.stop()); setIsRecording(false); };
        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        alert("Kunne ikke åpne mikrofon.");
      }
    }
  };

  if (loading) return <div className="chat-loading">Åpner samtalerom...</div>;

  return (
    <div className="chat-root">
      <header className="chat-header">
        <div className="chat-header-left">
          <button className="back-btn" onClick={() => navigate("/conversations")}>←</button>
          <div className="chat-partner-info">Samtale</div>
        </div>
        <select className="chat-timer-select" onChange={(e) => handleLogAction(e.target.value)} defaultValue="0">
          <option value="0">Logginnstillinger ⚙️</option>
          <option value="now">Tøm logg nå</option>
          <option value="15">Slett om 15 min</option>
          <option value="30">Slett om 30 min</option>
          <option value="60">Slett om 1 time</option>
          <option value="180">Slett om 3 timer</option>
          <option value="720">Slett om 12 timer</option>
          <option value="1440">Slett om 24 timer</option>
        </select>
      </header>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      {cameraActive && (
        <div className="camera-preview-container">
          <video ref={localVideoRef} autoPlay playsInline muted />
          <div className="camera-actions">
            <button className="cam-capture-btn" onClick={capturePhoto}>Ta bilde 📸</button>
            <button className="cam-cancel-btn" onClick={toggleCamera}>Avbryt</button>
          </div>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((msg) => {
          const isMe = msg.sender_id === user?.id;
          const msgContent = msg.text || msg.content;
          const isImage = msgContent && msgContent.startsWith("data:image/");
          return (
            <div key={msg.id} className={`message-wrapper ${isMe ? "me" : "other"}`}>
              <div className="message-bubble" style={isImage ? { padding: "4px", overflow: "hidden" } : {}}>
                {isImage ? <img src={msgContent} alt="Sendt bilde" /> : <p className="message-text">{msgContent}</p>}
                <span className="message-time">{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <footer className="chat-footer">
        <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={(e) => alert(`Valgt fil: ${e.target.files?.[0]?.name}`)} />
        <div className="chat-input-form">
          <button type="button" className="action-btn" onClick={() => fileInputRef.current?.click()} title="Vedlegg"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg></button>
          <button type="button" className="action-btn" onClick={toggleCamera} title="Kamera"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg></button>
          <button type="button" className={`action-btn ${isRecording ? "recording" : ""}`} onClick={handleMicClick} title="Lydopptak">{isRecording ? <svg width="22" height="22" viewBox="0 0 24 24" fill="#ef4444"><rect x="4" y="4" width="16" height="16" rx="2" /></svg> : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>}</button>
          <input type="text" className="chat-input" placeholder="Skriv en melding..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSendMessage()} />
          <button type="button" className="send-btn" onClick={handleSendMessage} disabled={!newMessage.trim()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></button>
        </div>
      </footer>
    </div>
  );
}