// auth.jsx — authentication state for the birthday wall, on Convex + Clerk.
//
// Flow: sign in with Google (Clerk) → submit the group passcode → groups.join
// writes a membership → pick a profile → profiles.claim. If someone enters the
// passcode before signing in we stash it and replay it automatically once the
// session lands, which keeps the original two-card login screen working.
//
// Gone compared to the Supabase version:
//   * unlock_tokens and the one-shot token dance — join is a single
//     authenticated transaction now
//   * refreshSession() after joining or claiming — group and profile live in
//     the database, not in JWT claims, so nothing has to be reminted
//   * the profiles realtime channel — profiles.list is a live subscription
//
// The context value keeps its old shape (including snake_case profile fields)
// so app.jsx / cards.jsx / identity.jsx didn't need touching.

const PENDING_PASSCODE_KEY = "bw-pending-passcode"; // sessionStorage
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_MEDIA_BYTES = 19 * 1024 * 1024; // Convex HTTP actions cap at 20 MB

const AuthCtx = React.createContext(null);
function useAuth() { return React.useContext(AuthCtx); }

function readPendingPasscode() {
  try {
    return sessionStorage.getItem(PENDING_PASSCODE_KEY) || null;
  } catch (_) {
    return null;
  }
}
function writePendingPasscode(v) {
  try {
    if (v) sessionStorage.setItem(PENDING_PASSCODE_KEY, v);
    else sessionStorage.removeItem(PENDING_PASSCODE_KEY);
  } catch (_) {}
}

/**
 * Convex returns camelCase; the wall was written against the Postgres
 * snake_case column names. Emit both so neither side has to care.
 *
 * claimed_by is synthesised rather than passed through: the UI only ever
 * compares it to the current user, so there's no reason to broadcast every
 * member's Clerk id to every other member.
 */
function adaptProfile(p, myUserId) {
  return {
    ...p,
    friend_key: p.friendKey || null,
    display_name: p.displayName,
    birthday_month: p.birthdayMonth,
    birthday_day: p.birthdayDay,
    claimed_by: p.isMine ? myUserId : p.claimed ? "another-member" : null,
    claimed_email: p.claimedEmail || null,
    avatar_path: p.avatarUrl ? "convex" : null,
    avatarUrl: p.avatarUrl ? window.fileUrl(p.avatarUrl) : null,
  };
}

function AuthProvider({ children }) {
  const clerk = useClerkSession();
  const [pendingPasscode, setPendingPasscode] = React.useState(readPendingPasscode);
  const [linkingError, setLinkingError] = React.useState("");
  const urlWindow = useUrlWindow();

  // Bootstrap query — safe to run unauthenticated, returns signedIn:false.
  const meQ = useConvexQuery("groups:me", clerk.loading ? "skip" : {});
  const me = meQ.data;

  const groupId = me?.group?.id ?? null;
  const groupSlug = me?.group?.slug ?? null;
  const profileId = me?.profile?.id ?? null;
  const myUserId = clerk.user?.id ?? null;

  const profilesQ = useConvexQuery(
    "profiles:list",
    groupId ? { urlWindow } : "skip",
  );

  const profiles = React.useMemo(
    () => (profilesQ.data || []).map((p) => adaptProfile(p, myUserId)),
    [profilesQ.data, myUserId],
  );

  const profile = React.useMemo(
    () => (profileId ? profiles.find((p) => p.id === profileId) || null : null),
    [profiles, profileId],
  );

  const joinMut = useConvexMutation("groups:join");
  const autoJoinMut = useConvexMutation("groups:autoJoinByEmail");
  const claimMut = useConvexMutation("profiles:claim");
  const updateMut = useConvexMutation("profiles:update");
  const memoryMut = useConvexMutation("profiles:setMemory");
  const avatarUrlMut = useConvexMutation("profiles:generateAvatarUploadUrl");
  const setAvatarMut = useConvexMutation("profiles:setAvatar");
  const clearAvatarMut = useConvexMutation("profiles:clearAvatar");

  // Returning member? Match on the verified Google address and put them
  // straight back on their profile — no passcode, no picker. Runs once as
  // soon as we know they're signed in without a group.
  const autoJoinTried = React.useRef(false);
  React.useEffect(() => {
    if (!me?.signedIn || groupId || autoJoinTried.current) return;
    autoJoinTried.current = true;
    autoJoinMut({}).catch((e) => console.warn("auto-join skipped", cleanError(e)));
  }, [me?.signedIn, groupId, autoJoinMut]);

  // Replay a passcode entered before sign-in, once the session exists.
  React.useEffect(() => {
    if (!pendingPasscode || !me?.signedIn || groupId) return;
    let cancelled = false;
    (async () => {
      try {
        await joinMut({ passcode: pendingPasscode });
        if (cancelled) return;
        writePendingPasscode(null);
        setPendingPasscode(null);
        setLinkingError("");
      } catch (e) {
        if (cancelled) return;
        writePendingPasscode(null);
        setPendingPasscode(null);
        setLinkingError(cleanError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingPasscode, me?.signedIn, groupId, joinMut]);

  // ---- operations --------------------------------------------------------

  const unlock = React.useCallback(
    async (passcode) => {
      const code = String(passcode || "").trim();
      if (!code) throw new Error("enter the passcode");
      setLinkingError("");

      // Not signed in yet: hold it and let Clerk take over. The effect above
      // finishes the job when we come back.
      if (!me?.signedIn) {
        writePendingPasscode(code);
        setPendingPasscode(code);
        return { pending: true };
      }
      try {
        return await joinMut({ passcode: code });
      } catch (e) {
        throw new Error(cleanError(e));
      }
    },
    [me?.signedIn, joinMut],
  );

  const signInWithGoogle = React.useCallback(async () => {
    const clerkJs = await loadClerk();
    const here = window.location.origin + window.location.pathname;
    // openSignIn rather than signIn.authenticateWithRedirect: the latter only
    // works for an account that already exists on the Clerk instance, and
    // throws for a first-time visitor instead of transferring to sign-up.
    // Everyone here is a first-time visitor, so that path was always going to
    // fail. openSignIn handles sign-in, sign-up and the transfer between them.
    // Google is the only social provider enabled, so it renders as one button.
    clerkJs.openSignIn({
      afterSignInUrl: here,
      afterSignUpUrl: here,
      redirectUrl: here,
    });
  }, []);

  const pickProfile = React.useCallback(
    async (body = {}) => {
      const args = {};
      const id = body.profileId || body.profile_id;
      if (id) args.profileId = id;
      const name = body.displayName || body.display_name;
      if (name) args.displayName = name;
      const month = body.birthdayMonth ?? body.birthday_month;
      if (month != null) args.birthdayMonth = Number(month);
      const day = body.birthdayDay ?? body.birthday_day;
      if (day != null) args.birthdayDay = Number(day);
      try {
        return await claimMut(args);
      } catch (e) {
        throw new Error(cleanError(e));
      }
    },
    [claimMut],
  );

  const updateProfile = React.useCallback(
    async (patch = {}) => {
      // Clearing the picture is its own mutation — it has to delete the blob,
      // not just null a column.
      if (patch.avatar_path === null || patch.avatarPath === null) {
        try {
          return await clearAvatarMut({});
        } catch (e) {
          throw new Error(cleanError(e));
        }
      }
      const args = {};
      if (typeof patch.display_name === "string") args.displayName = patch.display_name;
      if (typeof patch.displayName === "string") args.displayName = patch.displayName;
      if (typeof patch.color === "string") args.color = patch.color;
      if (typeof patch.emoji === "string") args.emoji = patch.emoji;
      if (patch.vibe !== undefined) args.vibe = patch.vibe;
      const month = patch.birthday_month ?? patch.birthdayMonth;
      if (month !== undefined) args.birthdayMonth = month === null ? null : Number(month);
      const day = patch.birthday_day ?? patch.birthdayDay;
      if (day !== undefined) args.birthdayDay = day === null ? null : Number(day);
      try {
        return await updateMut(args);
      } catch (e) {
        throw new Error(cleanError(e));
      }
    },
    [updateMut, clearAvatarMut],
  );

  const setFriendMemory = React.useCallback(
    async (targetProfileId, memory) => {
      try {
        return await memoryMut({ profileId: targetProfileId, memory: memory ?? "" });
      } catch (e) {
        throw new Error(cleanError(e));
      }
    },
    [memoryMut],
  );

  const uploadAvatar = React.useCallback(
    async (rawFile) => {
      if (!rawFile) throw new Error("no file");
      if (!rawFile.type?.startsWith("image/")) throw new Error("avatar must be an image");
      if (rawFile.size > MAX_AVATAR_BYTES) {
        throw new Error(`avatar must be under ${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} MB`);
      }
      // Avatars never render above ~120px, so 512px q0.8 is plenty.
      let file = rawFile;
      if (typeof window.downscaleImage === "function") {
        try {
          file = await window.downscaleImage(rawFile, { maxDim: 512, quality: 0.8 });
        } catch (_) {
          file = rawFile;
        }
      }
      const uploadUrl = await avatarUrlMut({});
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("upload failed");
      const { storageId } = await res.json();
      await setAvatarMut({ storageId });
      return storageId;
    },
    [avatarUrlMut, setAvatarMut],
  );

  const signOut = React.useCallback(async () => {
    writePendingPasscode(null);
    setPendingPasscode(null);
    setLinkingError("");
    try {
      const clerkJs = await loadClerk();
      await clerkJs.signOut();
    } catch (_) {}
  }, []);

  // profiles.list is a live subscription, so there's nothing to refetch. Kept
  // as a no-op because a few call sites still await it.
  const loadProfiles = React.useCallback(async () => {}, []);

  const value = {
    // Shaped like the old Supabase session so identity.jsx keeps working.
    session: clerk.user
      ? {
          user: {
            id: clerk.user.id,
            email: clerk.user.primaryEmailAddress?.emailAddress || me?.email || null,
            user_metadata: {
              full_name: clerk.user.fullName || "",
              avatar_url: clerk.user.imageUrl || "",
            },
          },
        }
      : null,
    bootstrapping: clerk.loading || (!clerk.loading && me === undefined),
    isSignedIn: !!me?.signedIn,
    isUnlocked: !!groupId,
    hasProfile: !!profileId,
    groupId,
    groupSlug,
    profileId,
    profile,
    profiles,
    profilesReady: !groupId || profilesQ.data !== undefined,
    // No group name until the passcode is verified server-side; the login
    // screen renders this block conditionally, so it just stays hidden.
    pendingUnlock: pendingPasscode ? { passcode: pendingPasscode } : null,
    linkingError,
    limits: { MAX_AVATAR_BYTES, MAX_MEDIA_BYTES },
    unlock,
    signInWithGoogle,
    pickProfile,
    updateProfile,
    setFriendMemory,
    uploadAvatar,
    signOut,
    loadProfiles,
  };

  return React.createElement(AuthCtx.Provider, { value }, children);
}

Object.assign(window, { AuthProvider, useAuth, AuthCtx });
