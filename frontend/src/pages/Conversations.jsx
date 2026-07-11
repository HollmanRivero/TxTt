import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import "./Conversations.css";

export default function Conversations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [conversations, setConversations] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const getInitial = (name) => (name ? name[0].toUpperCase() : "？");

  const generateUUID = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  useEffect(() => {
    if (!user) return;

    async function loadConversationsSecurely() {
      try {
        // FIKSEN: Vi henter KUN 'content' siden 'text' ikke eksisterer i databasen din!
        const { data: messagesData, error: msgErr } = await supabase
          .from("messages")
          .select("conversation_id, content, created_at")
          .order("created_at", { ascending: false });

        if (msgErr) throw msgErr;

        const seenRooms = new Set();
        const uniqueRooms = [];

        if (messagesData) {
          for (const msg of messagesData) {
            if (!seenRooms.has(msg.conversation_id)) {
              seenRooms.add(msg.conversation_id);
              
              // Sjekker om den siste meldingen er et bilde eller tekst
              let previewText = msg.content || "Ingen meldinger ennå";
              if (previewText.startsWith("data:image/")) {
                previewText = "📸 Bilde";
              }

              uniqueRooms.push({
                conversation_id: msg.conversation_id,
                last_message: previewText,
                created_at: msg.created_at
              });
            }
          }
        }

        setConversations(uniqueRooms);
      } catch (err) {
        console.error("Feil ved lasting av samtaler:", err);
      } finally {
        setLoading(false);
      }
    }

    loadConversationsSecurely();
  }, [user]);

  useEffect(() => {
    if (!search.trim()) return;
    let active = true;

    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, full_name")
          .ilike("username", `%${search}%`)
          .limit(10);

        if (error) throw error;
        if (active && data) {
          setSearchResults(data.filter((r) => r.id !== user?.id));
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setSearching(false);
      }
    }, 300);

    return () => { active = false; clearTimeout(t); };
  }, [search, user]);

  const handleStartConversation = (targetUser) => {
    if (!user) return;
    const secureUUID = generateUUID();
    setShowSearch(false);
    setSearch("");
    setSearchResults([]);
    navigate(`/chat/${secureUUID}`);
  };

  return (
    <div className="conv-root">
      <header className="conv-header">
        <span className="conv-logo">Tx<span>Tt</span></span>
        <div className="conv-header-actions">
          <button className="icon-btn" onClick={() => setShowSearch(!showSearch)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/>
            </svg>
          </button>
        </div>
      </header>

      {showSearch && (
        <div className="search-panel">
          <input
            className="search-input"
            type="text"
            placeholder="Søk etter brukere..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {searching && <div style={{color: '#a78bfa', padding: '10px'}}>Søker...</div>}
          {searchResults.map((u) => (
            <button key={u.id} className="search-result" onClick={() => handleStartConversation(u)}>
              <div className="avatar">{getInitial(u.full_name || u.username)}</div>
              <div className="search-result-info">
                <span>{u.full_name || u.username}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="conv-list">
        {loading && <div className="conv-empty"><div className="spinner-lg" /></div>}
        
        {!loading && conversations.length === 0 && (
          <div className="conv-empty" style={{color: '#a78bfa', padding: '20px'}}>Trykk på + for å starte en samtale</div>
        )}

        {conversations.map((c) => (
          <button key={c.conversation_id} className="conv-item" onClick={() => navigate(`/chat/${c.conversation_id}`)}>
            <div className="avatar">💬</div>
            <div className="conv-item-body">
              <div className="conv-item-top">
                <span className="conv-name">Samtalerom</span>
                <span className="conv-time">
                  {c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                </span>
              </div>
              <p className="conv-preview">{c.last_message}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}