import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getMessages, sendMessage, subscribeToMessages } from "../lib/messages";
import { supabase } from "../lib/supabase";
import "./ChatRoom.css";

export default function ChatRoom() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // ── Load messages ───────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;

    getMessages(conversationId)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));

    // Get the other person in the conversation
    supabase
      .from("conversation_members")
      .select("profiles!conversation_members_user_id_fkey(id, full_name, username, avatar_url)")
      .eq("conversation_id", conversationId)
      .neq("user_id", user?.id)
      .single()
      .then(({ data }) => setOtherUser(data?.profiles))
      .catch(console.error);
  }, [conversationId, user]);

  // ── Real-time subscription ──────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;

    const channel = subscribeToMessages(conversationId, (newMsg) => {
      setMessages((prev) => {
        // Avoid duplicates (optimistic update already added it)
        if (prev.find((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    });

    return () => supabase.removeChannel(channel);
  }, [conversationId]);

  // ── Scroll to bottom on new messages ───────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send message ────────────────────────────────────────────
  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setInput("");
    setSending(true);

    // Optimistic update — show message immediately
    const tempMsg = {
      id: `temp-${Date.now()}`,
      content,
      sender_id: user.id,
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const saved = await sendMessage(conversationId, user.id, content);
      // Replace temp message with real one
      setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? saved : m));
    } catch (err) {
      console.error(err);
      // Remove temp message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setInput(content); // Restore input
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Time formatting ─────────────────────────────────────────
  const formatTime = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const isOwn = (msg) => msg.sender_id === user?.id;

  const getInitial = (name) => (name || "?")[0].toUpperCase();

  // ── Group messages by sender (no repeated avatars) ──────────
  const grouped = messages.map((msg, i) => ({
    ...msg,
    showAvatar: !isOwn(msg) && (i === 0 || messages[i - 1].sender_id !== msg.sender_id),
    showTime:   i === messages.length - 1 || messages[i + 1].sender_id !== msg.sender_id,
  }));

  // ───────────────────────────────────────────────────────────

  return (
    <div className="chat-root">

      {/* Header */}
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={() => navigate("/")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>

        <div className="chat-header-user">
          <div className="avatar sm">
            {otherUser?.avatar_url
              ? <img src={otherUser.avatar_url} alt="" />
              : getInitial(otherUser?.full_name || otherUser?.username)}
          </div>
          <div>
            <p className="chat-header-name">
              {otherUser?.full_name || otherUser?.username || "…"}
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="chat-messages">
        {loading && (
          <div className="chat-loading"><div className="spinner-lg" /></div>
        )}

        {!loading && messages.length === 0 && (
          <div className="chat-empty">
            <p>Say hello 👋</p>
          </div>
        )}

        {grouped.map((msg) => (
          <div
            key={msg.id}
            className={`msg-row ${isOwn(msg) ? "own" : "other"}`}
          >
            {/* Avatar placeholder to keep alignment */}
            {!isOwn(msg) && (
              <div className={`avatar xs ${msg.showAvatar ? "" : "invisible"}`}>
                {otherUser?.avatar_url
                  ? <img src={otherUser.avatar_url} alt="" />
                  : getInitial(otherUser?.full_name || otherUser?.username)}
              </div>
            )}

            <div className="msg-col">
              <div className={`bubble ${isOwn(msg) ? "bubble-own" : "bubble-other"} ${msg._optimistic ? "optimistic" : ""}`}>
                {msg.content}
              </div>
              {msg.showTime && (
                <span className="msg-time">{formatTime(msg.created_at)}</span>
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-bar">
        <textarea
          ref={inputRef}
          className="chat-textarea"
          placeholder="Message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={sending}
        />
        <button
          className={`send-btn ${input.trim() ? "active" : ""}`}
          onClick={handleSend}
          disabled={!input.trim() || sending}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/>
          </svg>
        </button>
      </div>

    </div>
  );
}
