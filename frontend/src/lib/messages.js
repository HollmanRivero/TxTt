import { supabase } from "./supabase";

// ── Conversations ─────────────────────────────────────────────────────────────

/** Get all conversations for the current user, with last message */
export const getConversations = async (userId) => {
  const { data, error } = await supabase
    .from("conversation_members")
    .select(`
      conversation_id,
      conversations (
        id,
        created_at,
        messages (
          content,
          created_at,
          sender_id
        )
      ),
      profiles!conversation_members_user_id_fkey (
        id, full_name, username, avatar_url
      )
    `)
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  if (error) throw error;
  return data;
};

/** Start a new conversation with another user */
export const startConversation = async (currentUserId, otherUserId) => {
  // Create conversation
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .insert({})
    .select()
    .single();

  if (convErr) throw convErr;

  // Add both members
  const { error: membErr } = await supabase
    .from("conversation_members")
    .insert([
      { conversation_id: conv.id, user_id: currentUserId },
      { conversation_id: conv.id, user_id: otherUserId },
    ]);

  if (membErr) throw membErr;
  return conv;
};

// ── Messages ──────────────────────────────────────────────────────────────────

/** Load messages for a conversation (newest last) */
export const getMessages = async (conversationId, limit = 50) => {
  const { data, error } = await supabase
    .from("messages")
    .select(`
      id, content, created_at, sender_id,
      profiles!messages_sender_id_fkey (full_name, username, avatar_url)
    `)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data;
};

/** Send a message */
export const sendMessage = async (conversationId, senderId, content) => {
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, content })
    .select()
    .single();

  if (error) throw error;
  return data;
};

/** Subscribe to new messages in a conversation (realtime) */
export const subscribeToMessages = (conversationId, callback) => {
  return supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => callback(payload.new)
    )
    .subscribe();
};

// ── Profiles ──────────────────────────────────────────────────────────────────

/** Search users by username or phone to start a conversation */
export const searchUsers = async (query) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url, phone")
    .or(`username.ilike.%${query}%,full_name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(10);

  if (error) throw error;
  return data;
};

/** Get a single profile */
export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data;
};

/** Update current user's profile */
export const updateProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ── Media uploads ─────────────────────────────────────────────────────────────

/** Upload an image file to Supabase Storage, returns public URL */
export const uploadImage = async (userId, file) => {
  const ext = file.name.split(".").pop();
  const path = `${userId}/images/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("media")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
};

/** Upload an audio blob to Supabase Storage, returns public URL */
export const uploadAudio = async (userId, blob) => {
  const path = `${userId}/audio/${Date.now()}.webm`;

  const { error } = await supabase.storage
    .from("media")
    .upload(path, blob, { contentType: "audio/webm", upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
};

/** Send an image message */
export const sendImageMessage = async (conversationId, senderId, file) => {
  const fileUrl = await uploadImage(senderId, file);

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      message_type: "image",
      file_url: fileUrl,
      content: null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

/** Send an audio message */
export const sendAudioMessage = async (conversationId, senderId, blob) => {
  const fileUrl = await uploadAudio(senderId, blob);

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      message_type: "audio",
      file_url: fileUrl,
      content: null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};
