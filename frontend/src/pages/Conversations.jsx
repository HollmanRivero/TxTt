import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getConversations, searchUsers, startConversation } from "../lib/messages";
import { signOut } from "../lib/supabase";
import "./Conversations.css";

export default function Conversations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // ── Load conversations ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getConversations(user.id)
      .then(setConversations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  // ── Search users ────────────────────────────────────────────
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const results = await searchUsers(search).catch(() => []);
      setSearchResults(results.filter((r) => r.id !== user?.id));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search, user]);

  // ── Start conversation ──────────────────────────────────────
  const handleStartConversation = async (otherUser) => {
    try {
      const conv = await startConversation(user.id, otherUser.id);
      setShowSearch(false);
      setSearch("");
      navigate(`/chat/${conv.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  // ── Get last message preview ────────────────────────────────
  const getLastMessage = (conv) => {
    const msgs = conv.conversations?.messages;
    if (!msgs || msgs.length === 0) return "No messages yet";
    const last = msgs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    return last.content.length > 45 ? last.content.slice(0, 45) + "…" : last.content;
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const getInitial = (name) => (name || "?")[0].toUpperCase();

  // ───────────────────────────────────────────────────────────

  return (
    <div className="conv-root">

      {/* Header */}
      <header className="conv-header">
        <span className="conv-logo">Tx<span>Tt</span></span>
        <div className="conv-header-actions">
          <button className="icon-btn" onClick={() => setShowSearch(!showSearch)} title="New chat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/>
            </svg>
          </button>
          <button className="icon-btn" onClick={signOut} title="Sign out">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Search panel */}
      {showSearch && (
        <div className="search-panel">
          <input
            className="search-input"
            type="text"
            placeholder="Search by name, username or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {searching && <p className="search-hint">Searching…</p>}
          {!searching && search && searchResults.length === 0 && (
            <p className="search-hint">No users found</p>
          )}
          {searchResults.map((u) => (
            <button
              key={u.id}
              className="search-result"
              onClick={() => handleStartConversation(u)}
            >
              <div className="avatar">{getInitial(u.full_name || u.username)}</div>
              <div className="search-result-info">
                <span className="result-name">{u.full_name || u.username || "Unknown"}</span>
                <span className="result-sub">{u.phone || u.username || ""}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Conversation list */}
      <div className="conv-list">
        {loading && (
          <div className="conv-empty">
            <div className="spinner-lg" />
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="conv-empty">
            <p className="empty-icon">💬</p>
            <p className="empty-title">No conversations yet</p>
            <p className="empty-sub">Tap the search icon above to find someone</p>
          </div>
        )}

        {conversations.map((c) => {
          const other = c.profiles;
          const convId = c.conversation_id;
          const lastMsg = getLastMessage(c);
          const lastMsgTime = c.conversations?.messages?.sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
          )[0]?.created_at;

          return (
            <button
              key={convId}
              className="conv-item"
              onClick={() => navigate(`/chat/${convId}`)}
            >
              <div className="avatar">
                {other?.avatar_url
                  ? <img src={other.avatar_url} alt="" />
                  : getInitial(other?.full_name || other?.username)}
              </div>
              <div className="conv-item-body">
                <div className="conv-item-top">
                  <span className="conv-name">
                    {other?.full_name || other?.username || "Unknown"}
                  </span>
                  <span className="conv-time">{formatTime(lastMsgTime)}</span>
                </div>
                <p className="conv-preview">{lastMsg}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
