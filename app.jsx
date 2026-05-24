// app.jsx — main App, layout, party mode, surprises

const { useState, useEffect, useMemo, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "demoMode": "real",
  "ambient": true,
  "balloonCount": 8,
  "showHidden": false
}/*EDITMODE-END*/;

// Map demo mode to an effective "today". Needs the wall friends so it can
// jump to the soonest birthday for the "today/tomorrow/this-week" modes.
function resolveToday(mode, wallFriends){
  const real = new Date(2026, 4, 20); // May 20, 2026 (the user's real current date)
  if (mode === "real") return real;
  const sorted = [...(wallFriends || [])]
    .filter(f => f.month && f.day)
    .map(f => ({f, d: daysUntilBirthday(f, real)}))
    .sort((a,b) => a.d - b.d);
  const nearest = sorted[0]?.f;
  if (!nearest) return real;
  if (mode === "today")    return new Date(real.getFullYear(), nearest.month - 1, nearest.day);
  if (mode === "tomorrow"){
    const d = new Date(real.getFullYear(), nearest.month - 1, nearest.day);
    d.setDate(d.getDate() - 1);
    return d;
  }
  if (mode === "this-week"){
    const d = new Date(real.getFullYear(), nearest.month - 1, nearest.day);
    d.setDate(d.getDate() - 4);
    return d;
  }
  return real;
}

function MonthLabel({ m, count }){
  return (
    <div style={{display:"flex", alignItems:"baseline", gap:14, marginBottom: 14, paddingLeft: 8}}>
      <div className="h-display" style={{fontSize: 38, color:"var(--ink)"}}>{MONTHS[m]}</div>
      <div className="h-hand" style={{fontSize: 22, color:"var(--ink-soft)"}}>·</div>
      <div className="h-mono" style={{color:"var(--ink-soft)"}}>{count} {count === 1 ? "friend" : "friends"}</div>
    </div>
  );
}

function App(){
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const auth = useAuth();

  // Photos + videos store
  const { byFriend, addFiles, remove: removeMedia, updateCaption, setLocked, uploadError, compressing } = useMediaStore();
  const [lightbox, setLightbox] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);

  // The wall reads directly from public.profiles. For seeded friend slots
  // (friend_key not null) the friend_key is the canonical id used for media
  // lookups; for self-created profiles, the profile.id is the canonical id.
  // A profile appears on the wall only if it has both birthday_month and
  // birthday_day set.
  const wallFriends = useMemo(() => {
    return (auth?.profiles || [])
      .filter(p => p.birthday_month && p.birthday_day)
      .map((p, i) => ({
        idx: i,
        friend_key: p.friend_key || p.id,
        name: p.display_name,
        color: p.color || "var(--ink)",
        glyph: p.emoji || "🎈",
        month: p.birthday_month,
        day: p.birthday_day,
        vibe: p.vibe || "",
        memory: p.memory || "",
        // Derive the placeholder hue from the live color so changing color
        // in the editor immediately repaints the card. Falls back to the
        // stored photo_hue (set during seeding) if color is something the
        // mapper doesn't recognise.
        photoHue: (typeof window.pinHueFromColor === "function"
          ? window.pinHueFromColor(p.color || "")
          : (p.photo_hue ?? 60)),
        avatarUrl: p.avatarUrl || null,
        profile: p,
      }));
  }, [auth?.profiles]);

  const today = useMemo(() => resolveToday(t.demoMode, wallFriends), [t.demoMode, wallFriends]);

  const friendsWithDays = useMemo(() =>
    wallFriends
      .map(f => ({...f, days: daysUntilBirthday(f, today)}))
      .sort((a,b) => a.days - b.days),
    [wallFriends, today]
  );

  const todayFriend = friendsWithDays.find(f => f.days === 0);
  const nextUp = friendsWithDays[0];

  const [selected, setSelected] = useState(null);
  const [easter, setEaster] = useState({ partyKey: 0, eatCake: 0, footerTaps: 0, message: null });
  const [candles, setCandles] = useState([true,true,true,true,true]);

  // Keyboard easter eggs: type "party" → confetti burst
  useEffect(() => {
    let buf = "";
    const handler = (e) => {
      if (e.key.length > 1) return;
      buf = (buf + e.key.toLowerCase()).slice(-10);
      if (buf.endsWith("party")) {
        setEaster(s => ({...s, partyKey: s.partyKey + 1}));
      }
      if (buf.endsWith("cake")) {
        setCandles([true,true,true,true,true]);
        setEaster(s => ({...s, message: "🎂 cake refilled"}));
        setTimeout(() => setEaster(s => ({...s, message: null})), 2200);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Group friends by calendar month for the lower wall
  const byMonth = useMemo(() => {
    const m = {};
    for (const f of friendsWithDays) {
      const k = f.month - 1;
      if (!m[k]) m[k] = [];
      m[k].push(f);
    }
    return m;
  }, [friendsWithDays]);

  const monthOrder = useMemo(() => {
    // start from current month and wrap
    const cur = today.getMonth();
    return Array.from({length:12}, (_, i) => (cur + i) % 12).filter(m => byMonth[m]);
  }, [byMonth, today]);

  // Pseudo-random but stable rotation per friend (works for FRIENDS and custom profiles alike).
  const rotFor = (key) => {
    const k = String(key || "");
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
    return ((Math.abs(h) % 11) - 5);
  };

  const isPartyMode = !!todayFriend;

  // Profiles haven't finished loading yet — render a placeholder so the
  // hero/marquee don't choke on an empty wall. All hooks above this guard
  // already ran, so the rules-of-hooks contract holds.
  if (!auth?.profilesReady || friendsWithDays.length === 0) {
    return (
      <div style={{minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center"}}>
        <div className="h-mono" style={{color: "var(--ink-soft)"}}>loading the wall…</div>
      </div>
    );
  }

  return (
    <div className={isPartyMode ? "party" : ""}>
      <div className="party-bg" />

      {/* ambient stuff */}
      {t.ambient && !isPartyMode && <AmbientDrift enabled />}
      {t.ambient && !isPartyMode && <Sparkles count={12} />}

      {/* manual party trigger (typing "party") */}
      {easter.partyKey > 0 && (
        <ConfettiBurst key={easter.partyKey} count={120} duration={5} seed={easter.partyKey} />
      )}

      {/* PARTY MODE — full eruption */}
      {isPartyMode && (
        <>
          <ConfettiBurst count={140} duration={6} continuous seed={todayFriend.idx + 11} />
          <Balloons count={t.balloonCount} />
        </>
      )}

      {/* secret hidden cake button top right */}
      <button className="secret" title="..." onClick={() => {
        setEaster(s => ({...s, eatCake: s.eatCake + 1, message: ["yum.","🎂","slice please","one more bite","ok last one","ok actually last one"][s.eatCake % 6]}));
        setTimeout(() => setEaster(s => ({...s, message: null})), 1800);
      }}>🎂</button>

      {/* MY PROFILE BADGE — top right, opens the editor */}
      <MeBadge onClick={() => setEditingProfile(true)} />


      {/* floating little messages */}
      {easter.message && (
        <div className="h-hand" style={{position:"fixed", top: 60, right: 20, zIndex: 200,
          background:"#fbfaf3", padding:"8px 14px", borderRadius:6, fontSize: 22,
          boxShadow:"0 8px 18px rgba(0,0,0,.18)", transform:"rotate(2deg)"}}>{easter.message}</div>
      )}

      {/* HEADER */}
      <header style={{maxWidth: 1100, margin: "0 auto", padding:"40px 32px 8px"}}>
        <div className="h-mono" style={{color:"var(--ink-soft)"}}>the wall · v0.9 · refresh for joy</div>
        <h1 className="h-display" style={{fontSize:"clamp(54px,8vw,108px)", margin:"6px 0 4px", color: isPartyMode ? "white" : "var(--ink)"}}>
          {isPartyMode ? (
            <span className="partytext" style={{display:"inline-block"}}>
              it's <span style={{color:"var(--mustard)"}}>{todayFriend.name}</span>'s day!!
            </span>
          ) : (
            <>The birthday wall<span style={{color:"var(--tomato)"}}>.</span></>
          )}
        </h1>
        <p className="h-hand" style={{fontSize: 30, color: isPartyMode ? "#fde8c8" : "var(--ink-soft)", margin:0}}>
          {isPartyMode ? "drop everything. send the text. light the candles." :
           `today is ${MONTHS[today.getMonth()]} ${ordinal(today.getDate())}. ${friendsWithDays.length} friends on the wall.`}
        </p>
      </header>

      {/* MAIN */}
      {isPartyMode ? (
        <PartyView
          friend={todayFriend}
          candles={candles}
          setCandles={setCandles}
          onClose={() => setSelected(todayFriend)}
          media={byFriend[todayFriend.friend_key]}
          addFiles={addFiles}
          removeMedia={removeMedia}
          onOpenLightbox={(it) => setLightbox(it)}
        />
      ) : (
        <main style={{maxWidth: 1100, margin: "0 auto", padding:"30px 32px 80px"}}>
          {/* HERO */}
          <section style={{margin:"24px 0 40px", position:"relative"}}>
            <NextUpHero friend={nextUp} days={nextUp.days} onClick={() => setSelected(nextUp)} media={byFriend[nextUp.friend_key]} />
            {nextUp.days <= 3 && (
              <ConfettiBurst count={30} duration={8} continuous seed={nextUp.idx + 1} intensity={0.6} />
            )}
          </section>

          {/* WHILE-WE-WAIT — year timeline, friend spotlight, memory shuffle, media reel */}
          <WhileWeWait
            friends={friendsWithDays}
            headlinerName={nextUp.name}
            media={byFriend}
            onOpenLightbox={(it) => setLightbox(it)}
            today={today}
          />

          {/* MARQUEE for soon — quick glance ticker */}
          <section style={{borderTop:"1.5px dashed var(--ink)", borderBottom:"1.5px dashed var(--ink)", padding:"10px 0", margin:"10px 0 40px", overflow:"hidden"}}>
            <div className="marquee">
              {[...friendsWithDays.slice(0, 6), ...friendsWithDays.slice(0, 6)].map((f, i) => (
                <span key={i} className="h-hand" style={{fontSize: 26, margin:"0 26px", color:"var(--ink)", display:"inline-flex", alignItems:"center", gap:10}}>
                  <span style={{display:"inline-block", width:10, height:10, borderRadius:"50%", background: f.color}} />
                  {f.name} · {f.days === 0 ? "TODAY 🎉" : f.days === 1 ? "tomorrow!" : `in ${f.days} days`}
                  <span style={{margin:"0 14px", opacity:.4}}>✦</span>
                </span>
              ))}
            </div>
          </section>

          {/* MONTH-BY-MONTH wall */}
          {monthOrder.map(m => {
            // For the current month: separate friends whose birthday already
            // passed this month from those still upcoming. Show upcoming first,
            // passed at the end (greyed) so they don't look like immediate plans.
            const isCurrentMonth = m === today.getMonth();
            const todayDate = today.getDate();
            let monthList;
            if (isCurrentMonth) {
              const upcoming = byMonth[m].filter(f => f.day >= todayDate).sort((a,b) => a.day - b.day);
              const passed = byMonth[m]
                .filter(f => f.day < todayDate)
                .sort((a,b) => a.day - b.day)
                .map(f => ({...f, _justMissed: true}));
              monthList = [...upcoming, ...passed];
            } else {
              monthList = byMonth[m];
            }
            return (
            <section key={m} style={{marginBottom: 56}}>
              <MonthLabel m={m} count={byMonth[m].length} />
              <div style={{
                display:"grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "32px 28px",
                paddingTop: 10,
              }}>
                {monthList.map((f) => (
                  <div key={f.friend_key} style={{
                    display:"flex",
                    justifyContent:"center",
                    position:"relative",
                    opacity: f._justMissed ? 0.55 : 1,
                    filter: f._justMissed ? "grayscale(.35)" : "none",
                    transition: "opacity .3s, filter .3s",
                  }}>
                    <FriendCard
                      friend={f}
                      days={f.days}
                      rot={rotFor(f.friend_key)}
                      wobDur={6 + ((f.idx * 0.7) % 4)}
                      wobDelay={(f.idx * 0.4) % 3}
                      onClick={() => setSelected(f)}
                      media={byFriend[f.friend_key]}
                    />
                    {f._justMissed && (() => {
                      const LINES = [
                        "they noticed 👀",
                        "rip you",
                        "oops",
                        "you blew it 🎂",
                        "should've texted",
                        "11 months to plan",
                        "they're keeping score",
                        "send a late one rn",
                        "next year, hero",
                        "in your defense: nothing",
                        "ouch.",
                      ];
                      const hash = (f.day * 31 + f.month * 17 + (f.friend_key || "").length) >>> 0;
                      const line = LINES[hash % LINES.length];
                      const tilt = ((hash % 9) - 4);
                      return (
                        <div style={{
                          position:"absolute",
                          top: -10,
                          left: "50%",
                          transform: `translateX(-50%) rotate(${tilt}deg)`,
                          background: "var(--tomato)",
                          color: "#fff",
                          fontFamily: "var(--hand)",
                          fontWeight: 700,
                          fontSize: 22,
                          lineHeight: 1,
                          padding: "6px 16px 7px",
                          borderRadius: 4,
                          border: "2px solid var(--ink)",
                          boxShadow: "0 5px 0 var(--ink)",
                          zIndex: 6,
                          pointerEvents: "none",
                          whiteSpace: "nowrap",
                          textShadow: "0 1px 0 rgba(0,0,0,.2)",
                        }}>{line}</div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </section>
          );
          })}

          {/* FOOTER */}
          <footer style={{textAlign:"center", marginTop: 60, padding: "24px 0", borderTop:"1.5px dashed var(--ink)"}}>
            <div className="h-hand" style={{fontSize: 24, color:"var(--ink-soft)"}}>
              made with cake and{" "}
              <span style={{color:"var(--tomato)"}}>♥</span>
              {" "}— and zero calendar apps were harmed.
            </div>
            <div className="h-mono" style={{marginTop:10, color:"var(--ink-soft)", cursor:"pointer", userSelect:"none"}}
              onClick={() => setEaster(s => {
                const next = s.footerTaps + 1;
                if (next >= 3) {
                  return {...s, footerTaps: 0, partyKey: s.partyKey + 1, message: "🎉 hello from the wall"};
                }
                return {...s, footerTaps: next, message: ["psst.", "almost there...", null][next - 1] || null};
              })}
            >© 2026 · tap me</div>
          </footer>
        </main>
      )}

      {/* CARD MODAL */}
      {selected && (() => {
        // Live-derive the friend object so realtime edits from other users
        // (memory rewrites, color/name changes, locked/unlocked uploads) show
        // up immediately instead of being frozen to whatever was on screen
        // when the modal first opened.
        const liveSelected = friendsWithDays.find(f => f.friend_key === selected.friend_key) || selected;
        return (
        <MemoryModal
          friend={liveSelected}
          days={liveSelected.days}
          onClose={() => setSelected(null)}
          media={byFriend[liveSelected.friend_key]}
          addFiles={addFiles}
          removeMedia={removeMedia}
          updateCaption={updateCaption}
          onOpenLightbox={(it) => setLightbox(it)}
        />
        );
      })()}

      {/* LIGHTBOX */}
      {lightbox && (
        <Lightbox
          item={lightbox}
          onClose={() => setLightbox(null)}
          onCaption={updateCaption}
          onToggleLock={(id, locked) => { setLocked(id, locked); setLightbox(it => it && it.id === id ? {...it, locked} : it); }}
        />
      )}

      {/* PAGE-WIDE DROP ZONE */}
      <PageDropZone
        friends={friendsWithDays.map(f => ({ key: f.friend_key, label: f.name }))}
        onDrop={(name, files) => addFiles(name, files)}
      />

      <UploadErrorToast message={uploadError} />
      <CompressionOverlay state={compressing} />
      <ProfileEditor open={editingProfile} onClose={() => setEditingProfile(false)} />

      {/* TWEAKS */}
      <TweaksPanel>
        <TweakSection label="You" />
        <SignedInChip onEdit={() => setEditingProfile(true)} />
        <TweakSection label="Mood" />
        <TweakRadio
          label="Demo today as"
          value={t.demoMode}
          options={["real","this-week","tomorrow","today"]}
          onChange={(v) => setTweak("demoMode", v)}
        />
        <TweakToggle label="Ambient drifters" value={t.ambient} onChange={(v) => setTweak("ambient", v)} />
        <TweakSlider label="Balloons (party mode)" value={t.balloonCount} min={0} max={20} onChange={(v) => setTweak("balloonCount", v)} />
        <TweakSection label="Tips" />
        <div style={{padding:"4px 12px 10px", fontSize: 11, color:"#5a4f44", lineHeight:1.4}}>
          <div>Click any card → add photos & videos.</div>
          <div>Or drag files anywhere on the page.</div>
          <div>Try typing <b>party</b>. Click the 🎂.</div>
        </div>
      </TweaksPanel>
    </div>
  );
}

function MeBadge({ onClick }){
  const auth = useAuth();
  if (!auth?.profile) return null;
  return (
    <button
      onClick={onClick}
      title="edit your profile"
      style={{
        position: "fixed", right: 58, top: 10, zIndex: 50,
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "4px 12px 4px 4px",
        borderRadius: 999,
        background: "#fbfaf3",
        border: "2px solid var(--ink)",
        cursor: "pointer",
        boxShadow: "0 6px 14px rgba(0,0,0,.18)",
        fontFamily: "var(--display)", fontWeight: 700, fontSize: 13,
        color: "var(--ink)",
        maxWidth: "min(40vw, 280px)",
      }}>
      <ProfileAvatar profile={auth.profile} size={30} />
      <span style={{whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>
        {auth.profile.display_name}
      </span>
    </button>
  );
}

function SignedInChip({ onEdit }){
  const auth = useAuth();
  if (!auth?.profile) return null;
  const email = auth.session?.user?.email;
  return (
    <div style={{padding: "6px 12px 10px", display: "flex", flexDirection: "column", gap: 8}}>
      <div style={{display: "flex", alignItems: "center", gap: 10}}>
        <ProfileAvatar profile={auth.profile} size={36} />
        <div style={{display: "flex", flexDirection: "column", minWidth: 0}}>
          <div style={{fontFamily: "var(--display)", fontWeight: 700, fontSize: 14, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
            {auth.profile.display_name}
          </div>
          {email && (
            <div className="h-mono" style={{color: "var(--ink-soft)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
              {email}
            </div>
          )}
        </div>
      </div>
      <div style={{display: "flex", gap: 6, flexWrap: "wrap"}}>
        <button onClick={onEdit} className="btn" style={{fontSize: 11, padding: "4px 10px"}}>
          edit profile
        </button>
        <button onClick={auth.signOut} className="btn ghost" style={{fontSize: 11, padding: "4px 10px"}}>
          sign out
        </button>
      </div>
      <div className="h-mono" style={{color: "var(--ink-soft)", fontSize: 9, lineHeight: 1.4}}>
        profile is locked to your gmail — same on any device, can't be re-picked.
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <>
      <DanceFloor />
      <AuthGate>
        <App />
      </AuthGate>
    </>
  </AuthProvider>
);
