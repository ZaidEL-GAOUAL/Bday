// auth.jsx — authentication state for the birthday wall.
// Flow: enter passcode → unlock Edge Function issues a one-shot unlock_token
// bound to the matching group. User then signs in with Google (or is already
// signed in). link-group Edge Function consumes the token + the user's
// session to set app_metadata.group_id. pick-profile sets profile_id. After
// either, the client calls refreshSession() to pick up the new claims.

const FUNCTIONS_BASE = `${window.SUPABASE_URL}/functions/v1`;
const PENDING_TOKEN_KEY = "bw-pending-unlock";   // sessionStorage
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;        // 5 MB pre-downscale cap for avatars
const MAX_MEDIA_BYTES  = 15 * 1024 * 1024;       // 15 MB cap for photos/videos

async function callFunction(name, body, token){
  const headers = {
    "Content-Type": "application/json",
    "apikey": window.SUPABASE_ANON_KEY,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST", headers, body: JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await res.json(); } catch(_){}
  if (!res.ok){
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.detail = data && data.detail;
    err.data = data;
    throw err;
  }
  return data;
}

function readPendingUnlock(){
  try {
    const raw = sessionStorage.getItem(PENDING_TOKEN_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.unlock_token || !obj?.expires_at) return null;
    if (new Date(obj.expires_at).getTime() < Date.now()) {
      sessionStorage.removeItem(PENDING_TOKEN_KEY);
      return null;
    }
    return obj;
  } catch(_){ return null; }
}
function writePendingUnlock(obj){
  try { sessionStorage.setItem(PENDING_TOKEN_KEY, JSON.stringify(obj)); } catch(_){}
}
function clearPendingUnlock(){
  try { sessionStorage.removeItem(PENDING_TOKEN_KEY); } catch(_){}
}

async function signedUrl(path, ttl = 60 * 60){
  if (!path) return "";
  try {
    const { data, error } = await window.sb.storage.from(window.SUPABASE_BUCKET).createSignedUrl(path, ttl);
    if (error) return "";
    return data?.signedUrl || "";
  } catch(_){ return ""; }
}

const AuthCtx = React.createContext(null);
function useAuth(){ return React.useContext(AuthCtx); }

function AuthProvider({ children }){
  const [session, setSession] = React.useState(null);
  const [profiles, setProfiles] = React.useState([]);
  const [profilesReady, setProfilesReady] = React.useState(false);
  const [bootstrapping, setBootstrapping] = React.useState(true);
  const [pendingUnlock, setPendingUnlock] = React.useState(() => readPendingUnlock());
  const [linkingError, setLinkingError] = React.useState("");

  // Restore session + subscribe to changes.
  React.useEffect(() => {
    let mounted = true;
    window.sb.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      setBootstrapping(false);
    }).catch(() => { if (mounted) setBootstrapping(false); });
    const { data: { subscription }} = window.sb.auth.onAuthStateChange((_event, s) => {
      setSession(s || null);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const meta = session?.user?.app_metadata || {};
  const groupId = meta.group_id || null;
  const groupSlug = meta.group_slug || null;
  const profileId = meta.profile_id || null;

  // Auto-link the group as soon as a passcode-validated session exists.
  React.useEffect(() => {
    if (!session || !pendingUnlock || groupId === pendingUnlock.group?.id) return;
    let cancelled = false;
    (async () => {
      try {
        await callFunction("link-group", { unlock_token: pendingUnlock.unlock_token }, session.access_token);
        const { data, error } = await window.sb.auth.refreshSession();
        if (cancelled) return;
        if (error) throw error;
        if (data?.session) setSession(data.session);
        clearPendingUnlock();
        setPendingUnlock(null);
        setLinkingError("");
      } catch(e){
        if (!cancelled) setLinkingError(e?.detail || e?.message || "couldn't link group");
      }
    })();
    return () => { cancelled = true; };
  }, [session, pendingUnlock, groupId]);

  // Load profiles whenever the group changes; resolve avatar signed URLs too.
  const loadProfiles = React.useCallback(async () => {
    if (!groupId){ setProfiles([]); setProfilesReady(false); return; }
    try {
      const { data, error } = await window.sb
        .from("profiles")
        .select("*")
        .eq("group_id", groupId)
        .order("custom", { ascending: true })
        .order("display_name", { ascending: true });
      if (error) throw error;
      const rows = data || [];
      await Promise.all(rows.map(async p => {
        if (p.avatar_path) p.avatarUrl = await signedUrl(p.avatar_path);
      }));
      setProfiles(rows);
    } catch(e){
      console.warn("profiles load failed", e);
      setProfiles([]);
    } finally {
      setProfilesReady(true);
    }
  }, [groupId]);

  React.useEffect(() => { loadProfiles(); }, [loadProfiles]);

  // Realtime profile changes (someone else claims, edits, etc.)
  React.useEffect(() => {
    if (!groupId) return;
    const ch = window.sb
      .channel(`profiles-stream-${groupId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `group_id=eq.${groupId}` },
        () => loadProfiles())
      .subscribe();
    return () => { try { window.sb.removeChannel(ch); } catch(_){} };
  }, [groupId, loadProfiles]);

  const profile = React.useMemo(
    () => profileId ? profiles.find(p => p.id === profileId) || null : null,
    [profiles, profileId]
  );

  // ---- Auth operations ----
  const unlock = React.useCallback(async (passcode) => {
    const r = await callFunction("unlock", { passcode });
    const obj = {
      unlock_token: r.unlock_token,
      expires_at: r.expires_at,
      group: r.group,
    };
    writePendingUnlock(obj);
    setPendingUnlock(obj);
    return r;
  }, []);

  const signInWithGoogle = React.useCallback(async () => {
    const { error } = await window.sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw error;
  }, []);

  const pickProfile = React.useCallback(async (body) => {
    if (!session?.access_token) throw new Error("not signed in");
    const r = await callFunction("pick-profile", body, session.access_token);
    const { data, error } = await window.sb.auth.refreshSession();
    if (error) throw error;
    if (data?.session) setSession(data.session);
    await loadProfiles();
    return r;
  }, [session, loadProfiles]);

  const updateProfile = React.useCallback(async (patch) => {
    if (!profile) throw new Error("no profile");
    const allowed = {};
    if (typeof patch.display_name === "string") {
      const n = patch.display_name.trim().slice(0, 60);
      if (!n) throw new Error("name can't be empty");
      allowed.display_name = n;
      allowed.initials = n.split(/\s+/).map(w => w[0] || "").slice(0, 2).join("").toUpperCase() || n.slice(0, 2).toUpperCase();
    }
    if (typeof patch.color === "string") allowed.color = patch.color.slice(0, 60);
    if (typeof patch.emoji === "string") allowed.emoji = patch.emoji.slice(0, 8);
    if (typeof patch.avatar_path === "string" || patch.avatar_path === null) {
      allowed.avatar_path = patch.avatar_path;
    }
    if (typeof patch.vibe === "string" || patch.vibe === null) {
      allowed.vibe = patch.vibe ? String(patch.vibe).trim().slice(0, 200) || null : null;
    }
    if (patch.birthday_month === null || (Number.isInteger(patch.birthday_month) && patch.birthday_month >= 1 && patch.birthday_month <= 12)) {
      allowed.birthday_month = patch.birthday_month;
    }
    if (patch.birthday_day === null || (Number.isInteger(patch.birthday_day) && patch.birthday_day >= 1 && patch.birthday_day <= 31)) {
      allowed.birthday_day = patch.birthday_day;
    }
    if (!Object.keys(allowed).length) return profile;
    const { data, error } = await window.sb.from("profiles").update(allowed).eq("id", profile.id).select().single();
    if (error) throw error;
    await loadProfiles();
    return data;
  }, [profile, loadProfiles]);

  // memory line — editable by anyone in the group. Server-side function
  // bypasses the strict owner-only RLS on profiles but enforces group membership.
  const setFriendMemory = React.useCallback(async (profileId, memory) => {
    if (!groupId) throw new Error("not in a group");
    const { data, error } = await window.sb.rpc("set_friend_memory", {
      p_profile_id: profileId,
      p_memory: memory ?? "",
    });
    if (error) throw error;
    await loadProfiles();
    return data;
  }, [groupId, loadProfiles]);

  const uploadAvatar = React.useCallback(async (rawFile) => {
    if (!profile) throw new Error("no profile");
    if (!rawFile) throw new Error("no file");
    if (!rawFile.type?.startsWith("image/")) throw new Error("avatar must be an image");
    if (rawFile.size > MAX_AVATAR_BYTES) throw new Error(`avatar must be under ${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} MB`);
    // Aggressively downscale — avatars never display larger than ~120px on the
    // wall, so 512px max edge at q=0.8 is plenty (typically 20–60 KB).
    let file = rawFile;
    if (typeof window.downscaleImage === "function") {
      try { file = await window.downscaleImage(rawFile, { maxDim: 512, quality: 0.8 }); }
      catch (_) { file = rawFile; }
    }
    const ext = file.type === "image/jpeg" ? "jpg"
      : (file.name?.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${groupId}/_avatars/${profile.id}-${Date.now()}.${ext}`;
    if (profile.avatar_path && profile.avatar_path !== path) {
      try { await window.sb.storage.from(window.SUPABASE_BUCKET).remove([profile.avatar_path]); } catch(_){}
    }
    const up = await window.sb.storage.from(window.SUPABASE_BUCKET).upload(path, file, {
      contentType: file.type, upsert: true,
    });
    if (up.error) throw up.error;
    await updateProfile({ avatar_path: path });
    return path;
  }, [profile, groupId, updateProfile]);

  const signOut = React.useCallback(async () => {
    try { await window.sb.auth.signOut(); } catch(_){}
    setSession(null);
    setProfiles([]);
    setProfilesReady(false);
    clearPendingUnlock();
    setPendingUnlock(null);
  }, []);

  const value = {
    session, bootstrapping,
    isUnlocked: !!groupId,
    hasProfile: !!profileId,
    isSignedIn: !!session,
    groupId, groupSlug, profileId,
    profile, profiles, profilesReady,
    pendingUnlock,
    linkingError,
    limits: { MAX_AVATAR_BYTES, MAX_MEDIA_BYTES },
    unlock, signInWithGoogle, pickProfile, updateProfile, setFriendMemory, uploadAvatar, signOut, loadProfiles,
  };
  return React.createElement(AuthCtx.Provider, { value }, children);
}

Object.assign(window, { AuthProvider, useAuth, AuthCtx, signedUrl });
