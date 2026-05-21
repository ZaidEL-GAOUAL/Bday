// identity.jsx — passcode gate, Google sign-in step, profile picker,
// profile editor, and the AuthGate wrapper.

function GoogleButton({ onClick, disabled, label = "continue with Google" }){
  return (
    <button onClick={onClick} disabled={disabled} className="lift"
      style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        padding: "12px 18px", borderRadius: 6,
        background: "#fff", border: "2px solid var(--ink)",
        cursor: disabled ? "default" : "pointer",
        fontFamily: "var(--display)", fontWeight: 700, fontSize: 16,
        color: "var(--ink)",
      }}>
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.2 5.2C41.3 35.9 44 30.4 44 24c0-1.2-.1-2.4-.4-3.5z"/>
      </svg>
      <span>{label}</span>
    </button>
  );
}

function PasscodeGate(){
  const auth = useAuth();
  const { unlock, signInWithGoogle, pendingUnlock, linkingError, isSignedIn, signOut } = auth;
  const [input, setInput] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (!pendingUnlock && !isSignedIn) inputRef.current?.focus();
  }, [pendingUnlock, isSignedIn]);

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!input || submitting) return;
    setSubmitting(true); setError("");
    try { await unlock(input); }
    catch(err){
      setError(err?.detail || err?.message || "something went wrong");
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 0);
    } finally { setSubmitting(false); }
  };

  const onGoogle = async () => {
    setError("");
    try { await signInWithGoogle(); }
    catch(e){ setError(e?.message || "couldn't start Google sign-in"); }
  };

  // Decide what to render based on auth state. Three cases:
  //  - Not signed in, no unlock token  → side-by-side: passcode (new) vs Google (returning).
  //  - Not signed in, has unlock token → "passcode accepted, now sign in with Google" card.
  //  - Signed in, no group claim       → red banner: you need a passcode for this group.
  const orphanSignedIn = isSignedIn && !pendingUnlock;
  const passcodeAccepted = !isSignedIn && !!pendingUnlock;

  if (passcodeAccepted) {
    return (
      <div style={{minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32}}>
        <div className="modal" style={{maxWidth: 480, transform: "rotate(-1.2deg)"}}>
          <div className="pin" />
          <div className="h-mono" style={{color: "var(--ink-soft)"}}>passcode accepted</div>
          <div className="h-display" style={{fontSize: 38, lineHeight: 1, marginTop: 8}}>now sign in</div>
          <div className="h-hand" style={{fontSize: 22, color: "var(--ink-soft)", marginTop: 10}}>
            we tag each memory with who left it, so use the gmail that's yours.
          </div>
          {pendingUnlock?.group?.name && (
            <div className="h-mono" style={{color: "var(--ink-soft)", marginTop: 10}}>
              joining <b>{pendingUnlock.group.name}</b>
            </div>
          )}
          <div style={{marginTop: 22, display: "flex", justifyContent: "center"}}>
            <GoogleButton onClick={onGoogle} />
          </div>
          {(error || linkingError) && (
            <div className="h-hand" style={{fontSize: 18, color: "var(--tomato)", marginTop: 14, textAlign: "center"}}>
              {error || linkingError}
            </div>
          )}
          <div style={{marginTop: 22, display: "flex", justifyContent: "center"}}>
            <button onClick={signOut} className="btn ghost" style={{fontSize: 12}}>
              wrong passcode? start over
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Initial gate (split layout) OR signed-in-no-group (banner + passcode panel only).
  return (
    <div style={{minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, gap: 24, flexDirection: "column"}}>
      {orphanSignedIn && (
        <div style={{
          maxWidth: 760,
          background: "color-mix(in oklch, var(--tomato) 18%, white 82%)",
          border: "2px solid var(--tomato)",
          borderRadius: 6,
          padding: "12px 18px",
          color: "var(--tomato)",
          fontFamily: "var(--display)", fontWeight: 700, fontSize: 16,
          textAlign: "center",
          boxShadow: "0 6px 14px rgba(0,0,0,.10)",
          transform: "rotate(-.4deg)",
        }}>
          your account isn't in this group yet — enter the passcode to link in,
          or sign out to try a different gmail.
        </div>
      )}

      <div style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "stretch",
        gap: 28,
        maxWidth: 880,
        width: "100%",
      }}>
        {/* LEFT — new visitor: passcode */}
        <div className="modal" style={{flex: "1 1 320px", maxWidth: 380, transform: "rotate(-1.2deg)", minHeight: 360}}>
          <div className="pin" />
          <div className="h-mono" style={{color: "var(--ink-soft)"}}>new here</div>
          <div className="h-display" style={{fontSize: 34, lineHeight: 1, marginTop: 8}}>
            got a passcode?
          </div>
          <div className="h-hand" style={{fontSize: 20, color: "var(--ink-soft)", marginTop: 8}}>
            this wall is for friends only. enter the passcode the host gave you.
          </div>
          <form onSubmit={submit} style={{marginTop: 18}}>
            <input
              ref={inputRef}
              type="password"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="passcode"
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "12px 14px", fontSize: 18, fontFamily: "var(--mono)",
                border: `2px solid ${error ? "var(--tomato)" : "var(--ink)"}`,
                borderRadius: 4, background: "#fff", outline: "none", color: "var(--ink)",
                animation: error ? "wiggle .25s ease 2" : "none",
              }}
            />
            {error && (
              <div className="h-hand" style={{fontSize: 18, color: "var(--tomato)", marginTop: 8}}>
                {error === "invalid passcode" ? "nope. try again, or ask the host." : error}
              </div>
            )}
            <div style={{display: "flex", gap: 10, marginTop: 16, alignItems: "center", justifyContent: "space-between"}}>
              <span className="h-mono" style={{color: "var(--ink-soft)"}}>
                {submitting ? "checking…" : orphanSignedIn ? "then link this account" : "then sign in with google"}
              </span>
              <button type="submit" className="btn" disabled={!input || submitting}>
                {submitting ? "checking…" : "unlock"}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT — returning member: sign in with Google directly (only when not signed in) */}
        {!orphanSignedIn && (
          <div className="modal" style={{flex: "1 1 320px", maxWidth: 380, transform: "rotate(1.4deg)", minHeight: 360}}>
            <div className="pin" />
            <div className="h-mono" style={{color: "var(--ink-soft)"}}>already in?</div>
            <div className="h-display" style={{fontSize: 34, lineHeight: 1, marginTop: 8}}>
              welcome back.
            </div>
            <div className="h-hand" style={{fontSize: 20, color: "var(--ink-soft)", marginTop: 8}}>
              if you've joined this wall before, use the same gmail. we'll find you.
            </div>
            <div style={{marginTop: 28, display: "flex", justifyContent: "center"}}>
              <GoogleButton onClick={onGoogle} />
            </div>
            <div className="h-mono" style={{color: "var(--ink-soft)", marginTop: 18, fontSize: 10, textAlign: "center"}}>
              no passcode needed if your account already has a group.
            </div>
          </div>
        )}
      </div>

      {orphanSignedIn && (
        <button onClick={signOut} className="btn ghost" style={{fontSize: 12, marginTop: 6}}>
          sign out and start over
        </button>
      )}
    </div>
  );
}

function ProfileAvatar({ profile, size = 48 }){
  if (!profile) return null;
  const initials = profile.initials || (profile.display_name || "?").slice(0, 1).toUpperCase();
  if (profile.avatarUrl){
    return (
      <img src={profile.avatarUrl} alt={profile.display_name}
        style={{
          width: size, height: size, borderRadius: "50%", objectFit: "cover",
          boxShadow: "inset 0 -4px 6px rgba(0,0,0,.12)",
        }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: profile.color || "var(--ink)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 800, fontSize: Math.round(size * 0.42),
      fontFamily: "var(--display)",
      boxShadow: "inset 0 -4px 6px rgba(0,0,0,.15)",
    }}>{initials}</div>
  );
}

function ProfileButton({ profile, mine, claimedByOther, onClick, disabled }){
  const dim = claimedByOther;
  return (
    <button
      onClick={onClick}
      disabled={disabled || dim}
      className="lift"
      style={{
        background: "#fbfaf3",
        border: mine ? "3px solid var(--tomato)" : "1px solid rgba(0,0,0,.12)",
        borderRadius: 8,
        cursor: disabled || dim ? "default" : "pointer",
        padding: 14,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        aspectRatio: "1/1",
        boxShadow: "0 8px 16px rgba(0,0,0,.08)",
        position: "relative",
        opacity: dim ? .45 : 1,
        filter: dim ? "grayscale(.6)" : "none",
      }}>
      <ProfileAvatar profile={profile} size={52} />
      <div className="h-display" style={{fontSize: 17, textAlign: "center", lineHeight: 1.1}}>
        {profile.display_name}
      </div>
      {profile.emoji && <div style={{fontSize: 18}}>{profile.emoji}</div>}
      {mine && (
        <div className="h-mono" style={{position: "absolute", bottom: 4, color: "var(--tomato)", fontSize: 9}}>
          that's you
        </div>
      )}
      {dim && !mine && (
        <div className="h-mono" style={{
          position: "absolute", bottom: 4, color: "var(--ink-soft)", fontSize: 9,
          maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {profile.email ? profile.email.split("@")[0] : "taken"}
        </div>
      )}
    </button>
  );
}

function ProfilePicker(){
  const { profiles, profilesReady, pickProfile, signOut, groupSlug, session } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [emoji, setEmoji] = React.useState("🎈");
  const [color, setColor] = React.useState("var(--tomato)");

  const myUserId = session?.user?.id || null;

  // Default custom-name seed: the Google given_name if available.
  React.useEffect(() => {
    const meta = session?.user?.user_metadata || {};
    const seed = meta.given_name || meta.full_name || meta.name || "";
    if (seed && !name) setName(String(seed).slice(0, 60));
  }, [session]);

  const claim = async (p) => {
    if (busy || p.claimed_by) return;
    setBusy(true); setError("");
    try { await pickProfile({ profile_id: p.id }); }
    catch(e){ setError(e?.detail || e?.message || "couldn't claim that profile"); }
    finally { setBusy(false); }
  };

  const createCustom = async (e) => {
    if (e) e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true); setError("");
    try { await pickProfile({ new: { display_name: name.trim(), color, emoji } }); }
    catch(e){ setError(e?.detail || e?.message || "couldn't create profile"); }
    finally { setBusy(false); }
  };

  const COLOR_OPTIONS = ["var(--tomato)","var(--mustard)","var(--mint)","var(--sky)","var(--lavender)","var(--pink)"];
  const EMOJI_OPTIONS = ["🎈","🎂","🥳","🎉","✨","🎁","🌟","💫","🌙","🎊","🍰","🎀","🦄","🌈","🎵","💝"];

  return (
    <div style={{minHeight: "100vh", padding: 32, display: "flex", alignItems: "center", justifyContent: "center"}}>
      <div className="modal" style={{maxWidth: 760, transform: "rotate(-.5deg)"}}>
        <div className="pin" />
        <div className="h-mono" style={{color: "var(--ink-soft)"}}>welcome in</div>
        <div className="h-display" style={{fontSize: 42, lineHeight: 1, marginTop: 8}}>
          which one are you?
        </div>
        <div className="h-hand" style={{fontSize: 22, color: "var(--ink-soft)", marginTop: 8}}>
          pick yourself once and you're locked in. claimed faces are greyed out.
        </div>

        {!profilesReady && <div className="h-mono" style={{marginTop: 20}}>loading…</div>}

        {profilesReady && (
          <>
            <div style={{
              marginTop: 22,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
              gap: 14,
            }}>
              {profiles.map(p => (
                <ProfileButton
                  key={p.id}
                  profile={p}
                  mine={p.claimed_by === myUserId}
                  claimedByOther={!!p.claimed_by && p.claimed_by !== myUserId}
                  onClick={() => claim(p)}
                  disabled={busy}
                />
              ))}
              <button
                onClick={() => setCreating(true)}
                className="lift"
                disabled={busy}
                style={{
                  background: "transparent",
                  border: "2px dashed var(--ink)",
                  borderRadius: 8,
                  padding: 14, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 6, color: "var(--ink-soft)",
                  aspectRatio: "1/1",
                  transform: "rotate(-1.5deg)",
                }}>
                <div style={{fontSize: 36, lineHeight: 1}}>＋</div>
                <div className="h-hand" style={{fontSize: 18, color: "var(--ink)", textAlign: "center"}}>I'm new here</div>
                <div className="h-mono" style={{fontSize: 9}}>create a profile</div>
              </button>
            </div>

            {creating && (
              <div className="modal-bd" onClick={() => setCreating(false)} style={{zIndex: 350}}>
                <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth: 480}}>
                  <div className="pin" />
                  <div className="h-display" style={{fontSize: 32}}>say hi.</div>
                  <form onSubmit={createCustom} style={{marginTop: 18, display: "flex", flexDirection: "column", gap: 14}}>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="your name"
                      autoFocus
                      maxLength={60}
                      style={{
                        padding: "10px 14px", fontSize: 18, fontFamily: "var(--display)",
                        border: "2px solid var(--ink)", borderRadius: 4, background: "#fff",
                        outline: "none",
                      }}
                    />
                    <div>
                      <div className="h-mono" style={{color: "var(--ink-soft)", marginBottom: 6}}>color</div>
                      <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                        {COLOR_OPTIONS.map(c => (
                          <button
                            key={c} type="button" onClick={() => setColor(c)}
                            style={{
                              width: 32, height: 32, borderRadius: "50%", background: c,
                              border: color === c ? "3px solid var(--ink)" : "1px solid rgba(0,0,0,.2)",
                              cursor: "pointer", padding: 0,
                            }} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="h-mono" style={{color: "var(--ink-soft)", marginBottom: 6}}>emoji</div>
                      <div style={{display: "flex", gap: 4, flexWrap: "wrap"}}>
                        {EMOJI_OPTIONS.map(em => (
                          <button
                            key={em} type="button" onClick={() => setEmoji(em)}
                            style={{
                              width: 36, height: 36, fontSize: 22, padding: 0,
                              border: emoji === em ? "2px solid var(--ink)" : "1px solid rgba(0,0,0,.15)",
                              background: emoji === em ? "var(--paper-2)" : "#fff",
                              borderRadius: 4, cursor: "pointer",
                            }}>{em}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{display: "flex", gap: 8, justifyContent: "flex-end"}}>
                      <button type="button" className="btn ghost" onClick={() => setCreating(false)} disabled={busy}>cancel</button>
                      <button type="submit" className="btn" disabled={!name.trim() || busy}>
                        {busy ? "creating…" : "let me in"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {error && (
              <div className="h-hand" style={{fontSize: 18, color: "var(--tomato)", marginTop: 16}}>
                {error}
              </div>
            )}

            <div style={{
              marginTop: 24,
              display: "flex", justifyContent: "space-between", alignItems: "center",
              borderTop: "1px dashed rgba(0,0,0,.15)", paddingTop: 14,
            }}>
              <button onClick={signOut} className="btn ghost">sign out</button>
              <div className="h-mono" style={{color: "var(--ink-soft)"}}>
                {groupSlug ? `group: ${groupSlug}` : ""}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProfileChip({ profileId, profiles, size = "sm" }){
  const p = profiles?.find(x => x.id === profileId);
  if (!p) return null;
  const big = size === "lg";
  const initials = p.initials || (p.display_name || "?").slice(0, 1).toUpperCase();
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: big ? 8 : 6,
      padding: big ? "5px 12px 5px 5px" : "3px 9px 3px 4px",
      borderRadius: 999,
      background: p.color || "var(--ink)",
      color: "#fff",
      fontSize: big ? 14 : 11,
      fontFamily: "var(--mono)",
      letterSpacing: ".04em",
      boxShadow: "0 2px 4px rgba(0,0,0,.18)",
      maxWidth: big ? 240 : 160, overflow: "hidden",
    }}>
      {p.avatarUrl ? (
        <img src={p.avatarUrl} alt="" style={{
          width: big ? 24 : 18, height: big ? 24 : 18,
          borderRadius: "50%", objectFit: "cover", flex: "0 0 auto",
        }} />
      ) : (
        <span style={{
          width: big ? 24 : 18, height: big ? 24 : 18,
          borderRadius: "50%", background: "rgba(255,255,255,.28)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: big ? 12 : 10, flex: "0 0 auto",
        }}>{initials}</span>
      )}
      <span style={{whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{p.display_name}</span>
    </div>
  );
}

// One-tap install paths for the phone widgets. iOS opens Scriptable with
// the script pre-loaded; Android (or anything else) opens widget.html
// which prompts for the passcode once and remembers it.
function WidgetInstall(){
  const scriptUrl = "https://raw.githubusercontent.com/ZaidEL-GAOUAL/Bday/main/widgets/bday-wall.scriptable.js";
  const scriptableUrl = `scriptable:///add?scriptName=${encodeURIComponent("Birthday Wall")}&scriptURL=${encodeURIComponent(scriptUrl)}`;
  const webWidgetUrl = `${location.origin}${location.pathname.replace(/\/[^/]*$/, "")}/widget.html`;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || "");
  const isAndroid = /Android/.test(navigator.userAgent || "");
  const showIOSFirst = isIOS || !isAndroid;

  const buttons = [
    showIOSFirst && (
      <a key="ios" className="btn" href={scriptableUrl} style={{textDecoration: "none", background: "#fff8e6"}}>
        📱 Add to iPhone (Scriptable)
      </a>
    ),
    <a key="web" className="btn" href={webWidgetUrl} target="_blank" rel="noreferrer" style={{textDecoration: "none"}}>
      🌐 Open widget page
    </a>,
    !showIOSFirst && (
      <a key="ios" className="btn ghost" href={scriptableUrl} style={{textDecoration: "none"}}>
        iPhone instead
      </a>
    ),
  ].filter(Boolean);

  return (
    <div style={{
      marginTop: 22, paddingTop: 16,
      borderTop: "1px dashed rgba(0,0,0,.18)",
    }}>
      <div className="h-mono" style={{color: "var(--ink-soft)"}}>phone widget</div>
      <div className="h-display" style={{fontSize: 22, marginTop: 4, lineHeight: 1.05}}>
        put the wall on your home screen
      </div>
      <div className="h-hand" style={{fontSize: 18, color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.2}}>
        a small live tile showing the next birthday + a random photo. refreshes every ~15 minutes. asks for the passcode once on first run.
      </div>
      <div style={{display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12}}>
        {buttons}
      </div>
      <div className="h-mono" style={{color: "var(--ink-soft)", marginTop: 10, fontSize: 9, lineHeight: 1.4}}>
        iPhone → needs the free <b>Scriptable</b> app (true home-screen widget tile).<br/>
        android → opens the widget page; chrome will offer <b>install app</b> (one-tap, opens fullscreen on tap, not a live tile). for a real live tile on android you'd need a native APK or a 3rd-party HTML-widget app from the play store.
      </div>
    </div>
  );
}

function ProfileEditor({ open, onClose }){
  const { profile, updateProfile, setFriendMemory, uploadAvatar, signOut, session, limits } = useAuth();
  const [name, setName] = React.useState(profile?.display_name || "");
  const [color, setColor] = React.useState(profile?.color || "var(--ink)");
  const [emoji, setEmoji] = React.useState(profile?.emoji || "🎈");
  const [vibe, setVibe] = React.useState(profile?.vibe || "");
  const [memory, setMemory] = React.useState(profile?.memory || "");
  const [bdayMonth, setBdayMonth] = React.useState(profile?.birthday_month || "");
  const [bdayDay, setBdayDay] = React.useState(profile?.birthday_day || "");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    setName(profile?.display_name || "");
    setColor(profile?.color || "var(--ink)");
    setEmoji(profile?.emoji || "🎈");
    setVibe(profile?.vibe || "");
    setMemory(profile?.memory || "");
    setBdayMonth(profile?.birthday_month || "");
    setBdayDay(profile?.birthday_day || "");
    setError("");
  }, [open, profile?.id, profile?.display_name, profile?.color, profile?.emoji, profile?.vibe, profile?.memory, profile?.birthday_month, profile?.birthday_day]);

  if (!open || !profile) return null;

  const COLOR_OPTIONS = ["var(--tomato)","var(--mustard)","var(--mint)","var(--sky)","var(--lavender)","var(--pink)","var(--ink)"];
  const EMOJI_OPTIONS = ["🎈","🎂","🥳","🎉","✨","🎁","🌟","💫","🌙","🎊","🍰","🎀","🦄","🌈","🎵","💝"];
  const MONTH_LABELS = ["—","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const save = async (e) => {
    if (e) e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const m = bdayMonth === "" ? null : Number(bdayMonth);
      const d = bdayDay === "" ? null : Number(bdayDay);
      if ((m && !d) || (d && !m)) throw new Error("set both month and day, or leave both blank");
      await updateProfile({
        display_name: name, color, emoji,
        vibe: vibe.trim() || null,
        birthday_month: m, birthday_day: d,
      });
      // memory uses the SECURITY DEFINER path so the API is consistent with
      // the friend-modal edit (anyone in group can edit anyone's memory).
      if ((memory || "").trim() !== (profile.memory || "").trim()) {
        await setFriendMemory(profile.id, memory);
      }
      onClose();
    } catch(err){ setError(err?.message || "couldn't save"); }
    finally { setBusy(false); }
  };

  const onAvatarPick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true); setError("");
    try { await uploadAvatar(f); }
    catch(err){ setError(err?.message || "upload failed"); }
    finally { setBusy(false); }
  };

  const onAvatarClear = async () => {
    setBusy(true); setError("");
    try {
      if (profile.avatar_path) {
        try { await window.sb.storage.from(window.SUPABASE_BUCKET).remove([profile.avatar_path]); } catch(_){}
      }
      await updateProfile({ avatar_path: null });
    } catch(err){ setError(err?.message || "couldn't clear"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-bd" onClick={onClose} style={{zIndex: 350}}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth: 520}}>
        <div className="pin" />
        <div className="h-mono" style={{color: "var(--ink-soft)"}}>edit profile</div>
        <div className="h-display" style={{fontSize: 32, marginTop: 6}}>make it yours.</div>

        <div style={{display: "flex", alignItems: "center", gap: 16, marginTop: 18}}>
          <ProfileAvatar profile={{...profile, display_name: name, color, emoji}} size={72} />
          <div style={{display: "flex", flexDirection: "column", gap: 6}}>
            <input
              type="file" accept="image/*" ref={fileRef}
              style={{display: "none"}}
              onChange={onAvatarPick}
            />
            <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
              {profile.avatar_path ? "change picture" : "upload picture"}
            </button>
            {profile.avatar_path && (
              <button type="button" className="btn ghost" onClick={onAvatarClear} disabled={busy} style={{fontSize: 12}}>
                remove picture
              </button>
            )}
            <div className="h-mono" style={{color: "var(--ink-soft)", fontSize: 9}}>
              max {Math.round(limits.MAX_AVATAR_BYTES / 1024 / 1024)} MB · image only
            </div>
          </div>
        </div>

        <form onSubmit={save} style={{marginTop: 18, display: "flex", flexDirection: "column", gap: 14}}>
          <label className="h-mono" style={{color: "var(--ink-soft)"}}>
            display name
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="your name"
              maxLength={60}
              style={{
                display: "block", marginTop: 4, width: "100%", boxSizing: "border-box",
                padding: "10px 14px", fontSize: 18, fontFamily: "var(--display)",
                border: "2px solid var(--ink)", borderRadius: 4, background: "#fff", outline: "none",
                textTransform: "none", letterSpacing: 0,
              }}
            />
          </label>
          <div>
            <div className="h-mono" style={{color: "var(--ink-soft)", marginBottom: 6}}>color</div>
            <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
              {COLOR_OPTIONS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  style={{
                    width: 32, height: 32, borderRadius: "50%", background: c,
                    border: color === c ? "3px solid var(--ink)" : "1px solid rgba(0,0,0,.2)",
                    cursor: "pointer", padding: 0,
                  }} />
              ))}
            </div>
          </div>
          <div>
            <div className="h-mono" style={{color: "var(--ink-soft)", marginBottom: 6}}>emoji</div>
            <div style={{display: "flex", gap: 4, flexWrap: "wrap"}}>
              {EMOJI_OPTIONS.map(em => (
                <button key={em} type="button" onClick={() => setEmoji(em)}
                  style={{
                    width: 36, height: 36, fontSize: 22, padding: 0,
                    border: emoji === em ? "2px solid var(--ink)" : "1px solid rgba(0,0,0,.15)",
                    background: emoji === em ? "var(--paper-2)" : "#fff",
                    borderRadius: 4, cursor: "pointer",
                  }}>{em}</button>
              ))}
            </div>
          </div>

          <label className="h-mono" style={{color: "var(--ink-soft)"}}>
            vibe <span style={{textTransform: "none", letterSpacing: 0, opacity: .8}}>(your one-line personality tagline)</span>
            <input
              value={vibe}
              onChange={e => setVibe(e.target.value)}
              placeholder="e.g. always says yes to the plan"
              maxLength={120}
              style={{
                display: "block", marginTop: 4, width: "100%", boxSizing: "border-box",
                padding: "8px 14px", fontSize: 18, fontFamily: "var(--hand)",
                border: "2px solid var(--ink)", borderRadius: 4, background: "#fff", outline: "none",
                textTransform: "none", letterSpacing: 0,
              }}
            />
          </label>

          <label className="h-mono" style={{color: "var(--ink-soft)"}}>
            memory <span style={{textTransform: "none", letterSpacing: 0, opacity: .8}}>(the story everyone tells — others can edit too)</span>
            <textarea
              value={memory}
              onChange={e => setMemory(e.target.value)}
              placeholder="e.g. we got lost on purpose and stayed lost"
              maxLength={400}
              rows={2}
              style={{
                display: "block", marginTop: 4, width: "100%", boxSizing: "border-box",
                padding: "8px 14px", fontSize: 18, fontFamily: "var(--hand)", lineHeight: 1.2,
                border: "2px solid var(--ink)", borderRadius: 4, background: "#fff", outline: "none",
                resize: "vertical", textTransform: "none", letterSpacing: 0,
              }}
            />
          </label>

          <div>
            <div className="h-mono" style={{color: "var(--ink-soft)", marginBottom: 6}}>
              birthday <span style={{textTransform: "none", letterSpacing: 0, opacity: .8}}>(set both to show on the wall)</span>
            </div>
            <div style={{display: "flex", gap: 8, alignItems: "center"}}>
              <select value={bdayMonth} onChange={e => setBdayMonth(e.target.value)}
                style={{
                  padding: "8px 12px", fontSize: 16, fontFamily: "var(--display)",
                  border: "2px solid var(--ink)", borderRadius: 4, background: "#fff", outline: "none",
                  cursor: "pointer",
                }}>
                {MONTH_LABELS.map((m, i) => (
                  <option key={i} value={i === 0 ? "" : i}>{i === 0 ? "month" : m}</option>
                ))}
              </select>
              <input type="number" min={1} max={31}
                value={bdayDay}
                onChange={e => setBdayDay(e.target.value)}
                placeholder="day"
                style={{
                  width: 70,
                  padding: "8px 12px", fontSize: 16, fontFamily: "var(--display)",
                  border: "2px solid var(--ink)", borderRadius: 4, background: "#fff", outline: "none",
                }}
              />
              {bdayMonth && bdayDay && (
                <button type="button" className="btn ghost" onClick={() => { setBdayMonth(""); setBdayDay(""); }}
                  style={{fontSize: 11, padding: "4px 10px"}}>
                  clear
                </button>
              )}
            </div>
          </div>

          {error && <div className="h-hand" style={{fontSize: 16, color: "var(--tomato)"}}>{error}</div>}
          <div style={{display: "flex", gap: 8, justifyContent: "flex-end"}}>
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>cancel</button>
            <button type="submit" className="btn" disabled={!name.trim() || busy}>
              {busy ? "saving…" : "save"}
            </button>
          </div>
        </form>

        <WidgetInstall />

        <div style={{
          marginTop: 22, paddingTop: 16,
          borderTop: "1px dashed rgba(0,0,0,.18)",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <div className="h-mono" style={{color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
            signed in as {session?.user?.email || "—"}
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (confirm("Sign out? You'll need to enter the passcode again to come back.")) {
                onClose();
                signOut();
              }
            }}
            style={{fontSize: 12, color: "var(--tomato)", borderColor: "var(--tomato)"}}
            disabled={busy}>
            sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthGate({ children }){
  const { bootstrapping, isUnlocked, hasProfile } = useAuth();
  if (bootstrapping){
    return (
      <div style={{minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center"}}>
        <div className="h-mono" style={{color: "var(--ink-soft)"}}>loading the wall…</div>
      </div>
    );
  }
  if (!isUnlocked) return <PasscodeGate />;
  if (!hasProfile) return <ProfilePicker />;
  return children;
}

Object.assign(window, {
  GoogleButton, PasscodeGate, ProfilePicker, ProfileButton, ProfileChip,
  ProfileAvatar, ProfileEditor, AuthGate,
});
