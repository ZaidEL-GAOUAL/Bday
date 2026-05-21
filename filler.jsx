// filler.jsx — "while we wait" section that lives under the headliner.
// Contents: YearTimeline, FriendSpotlight, MemoryShuffle, RecentUploadsReel.

// ── YearTimeline ────────────────────────────────────────────────────────────
function YearTimeline({ friends, today }){
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearEnd = new Date(today.getFullYear() + 1, 0, 1);
  const yearMs = yearEnd - yearStart;
  const todayPct = ((today - yearStart) / yearMs) * 100;

  const marks = friends.map(f => {
    const d = new Date(today.getFullYear(), f.month - 1, f.day);
    const pct = ((d - yearStart) / yearMs) * 100;
    return { friend: f, pct };
  }).sort((a, b) => a.pct - b.pct);

  return (
    <div style={{
      padding: "22px 28px 28px",
      background: "#fbfaf3",
      borderRadius: 6,
      boxShadow: "0 10px 22px rgba(0,0,0,.10)",
      transform: "rotate(.4deg)",
      position: "relative",
      margin: "10px auto 30px",
      maxWidth: 880,
    }}>
      <div className="tape t-sky" style={{top:-10, left:80, transform:"rotate(-7deg)"}} />
      <div className="tape t-mint" style={{top:-10, right:80, transform:"rotate(9deg)", width:90}} />
      <div className="h-mono" style={{color:"var(--ink-soft)"}}>the year at a glance</div>

      <div style={{position:"relative", marginTop: 36, marginBottom: 10, height: 56}}>
        <div className="rail" style={{position:"absolute", top: 22, left: 0, right: 0}} />

        {/* Month labels below the rail */}
        <div style={{position:"absolute", top: 30, left: 0, right: 0, display:"flex", justifyContent:"space-between"}}>
          {MONTHS_SHORT.map((m, i) => (
            <span key={i} className="h-mono" style={{color:"var(--ink-soft)", flex:1, textAlign:"left", fontSize: 10}}>
              {m}
            </span>
          ))}
        </div>

        {/* Today marker — above rail */}
        <div style={{position:"absolute", left: todayPct + "%", top: -2, transform:"translateX(-50%)", textAlign:"center"}}>
          <div className="h-hand" style={{
            fontSize: 16, color:"var(--ink)", whiteSpace:"nowrap",
            transform:"rotate(-3deg)", display:"inline-block",
          }}>today</div>
          <div style={{width: 2, height: 10, background:"var(--ink)", margin: "2px auto 0"}} />
        </div>

        {/* Friend dots — initial inside dot, full name on hover */}
        {marks.map(({friend, pct}, i) => (
          <div key={friend.name} style={{
            position:"absolute", left: pct + "%", top: 16,
            transform:"translateX(-50%)",
            cursor:"pointer",
          }} title={`${friend.name} · ${MONTHS_SHORT[friend.month-1]} ${friend.day}`}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              background: friend.color, border: "2px solid var(--ink)",
              boxShadow: "0 2px 0 var(--ink)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize: 9, fontWeight: 800, color: "var(--ink)",
              fontFamily: "var(--mono)", lineHeight: 1,
              transition: "transform .2s ease",
            }} onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.5)"}
               onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            >{friend.name.charAt(0).toUpperCase()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FriendSpotlight ──────────────────────────────────────────────────────────
// Picks a random friend (excluding the headliner) and rotates every 12s.
// Click the card to skip to a new one. Click the button to copy a "thinking of you".
function FriendSpotlight({ friends, headlinerName, media, onOpenLightbox }){
  const pool = React.useMemo(
    () => friends.filter(f => f.name !== headlinerName),
    [friends, headlinerName]
  );
  const [idx, setIdx] = React.useState(() => Math.floor(Math.random() * Math.max(pool.length, 1)));
  const [mediaIdx, setMediaIdx] = React.useState(0);
  const [fadeKey, setFadeKey] = React.useState(0);

  const next = React.useCallback(() => {
    setIdx(i => {
      if (pool.length <= 1) return i;
      let n = i;
      while (n === i) n = Math.floor(Math.random() * pool.length);
      return n;
    });
    setMediaIdx(0);
    setFadeKey(k => k + 1);
  }, [pool.length]);

  React.useEffect(() => {
    if (pool.length < 2) return;
    const t = setInterval(next, 12000);
    return () => clearInterval(t);
  }, [next, pool.length]);

  if (pool.length === 0) return null;
  const friend = pool[idx % pool.length];
  const items = (media && media[friend.friend_key]) || [];
  // Cycle the media tile every 3s without changing the spotlighted friend.
  React.useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setMediaIdx(i => (i + 1) % items.length), 3000);
    return () => clearInterval(t);
  }, [items.length]);
  const cur = items[mediaIdx % Math.max(items.length, 1)];

  return (
    <div onClick={next} style={{
      flex: "1 1 320px",
      background: "#fbfaf3",
      padding: "22px 24px 24px",
      borderRadius: 6,
      boxShadow: "0 12px 24px rgba(0,0,0,.10)",
      transform: "rotate(-.9deg)",
      position: "relative",
      cursor: "pointer",
    }}>
      <div className="tape t-mustard" style={{top:-10, right:40, transform:"rotate(7deg)", width:80}} />
      <div className="h-mono" style={{color:"var(--ink-soft)"}}>today's spotlight</div>

      <div key={fadeKey} className="ww-fade" style={{display:"flex", alignItems:"center", gap: 14, marginTop: 12}}>
        {cur ? (
          <div
            onClick={(e) => { e.stopPropagation(); onOpenLightbox && onOpenLightbox(cur); }}
            title="tap to open"
            style={{
              width: 110, height: 110, borderRadius: 6, overflow: "hidden",
              border: "2px solid var(--ink)",
              boxShadow: "0 4px 0 var(--ink), 0 10px 18px rgba(0,0,0,.18)",
              transform: "rotate(-2deg)",
              flexShrink: 0, position: "relative",
              cursor: "zoom-in",
              background: "#000",
            }}>
            {cur.kind === "video" ? (
              <video src={cur.url} muted loop playsInline preload="metadata" autoPlay
                style={{width: "100%", height: "100%", objectFit: "cover", display: "block"}} />
            ) : (
              <img src={cur.url} alt={cur.caption || friend.name}
                style={{width: "100%", height: "100%", objectFit: "cover", display: "block"}} />
            )}
            {cur.kind === "video" && (
              <div style={{
                position: "absolute", bottom: 4, right: 4,
                background: "rgba(0,0,0,.6)", color: "white",
                padding: "1px 5px", borderRadius: 3,
                fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".06em",
              }}>▶</div>
            )}
            {items.length > 1 && (
              <div style={{
                position: "absolute", top: 4, left: 4,
                background: "rgba(0,0,0,.55)", color: "white",
                padding: "1px 6px", borderRadius: 99,
                fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".06em",
              }}>{(mediaIdx % items.length) + 1}/{items.length}</div>
            )}
          </div>
        ) : friend.avatarUrl ? (
          <img src={friend.avatarUrl} alt={friend.name}
            style={{
              width: 88, height: 88, borderRadius: "50%", objectFit: "cover",
              border: "2px solid var(--ink)", boxShadow: "0 3px 0 var(--ink)",
              flexShrink: 0,
            }} />
        ) : (
          <div style={{
            width: 88, height: 88, borderRadius: "50%",
            background: friend.color, border: "2px solid var(--ink)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize: 40, boxShadow: "0 3px 0 var(--ink)",
            flexShrink: 0,
          }}>{friend.glyph}</div>
        )}
        <div style={{flex: 1, minWidth: 0}}>
          <div className="h-display" style={{fontSize: 32, lineHeight: 1, color:"var(--ink)"}}>{friend.name}</div>
          <div className="h-hand" style={{fontSize: 22, color:"var(--ink-soft)", marginTop: 4, lineHeight: 1.1}}>
            {friend.vibe}
          </div>
          {items.length > 0 && (
            <div className="h-mono" style={{color:"var(--ink-soft)", marginTop: 6, fontSize: 10}}>
              {items.length} {items.length === 1 ? "memory" : "memories"} on the wall
            </div>
          )}
        </div>
      </div>

      <div style={{display:"flex", gap: 10, marginTop: 18, alignItems:"center", flexWrap:"wrap"}}>
        <button className="btn" onClick={(e) => {
          e.stopPropagation();
          const msg = `hey ${friend.name} — thinking of you today. no reason. ♥`;
          if (navigator.clipboard) navigator.clipboard.writeText(msg);
          const el = e.currentTarget;
          const orig = el.textContent;
          el.textContent = "copied ✓";
          setTimeout(() => { el.textContent = orig; }, 1500);
        }}>copy a "thinking of you"</button>
        <div className="h-hand" style={{fontSize: 18, color:"var(--ink-soft)"}}>tap card → next</div>
      </div>
    </div>
  );
}

// ── MemoryShuffle ────────────────────────────────────────────────────────────
function MemoryShuffle({ friends }){
  const [idx, setIdx] = React.useState(() => Math.floor(Math.random() * Math.max(friends.length, 1)));
  const [fadeKey, setFadeKey] = React.useState(0);

  const next = React.useCallback(() => {
    setIdx(i => {
      if (friends.length <= 1) return i;
      let n = i;
      while (n === i) n = Math.floor(Math.random() * friends.length);
      return n;
    });
    setFadeKey(k => k + 1);
  }, [friends.length]);

  React.useEffect(() => {
    if (friends.length < 2) return;
    const t = setInterval(next, 10000);
    return () => clearInterval(t);
  }, [next, friends.length]);

  if (!friends.length) return null;
  const friend = friends[idx % friends.length];

  return (
    <div onClick={next} style={{
      flex: "1 1 320px",
      background: "color-mix(in oklch, var(--mustard) 55%, white 45%)",
      padding: "22px 24px 24px",
      borderRadius: 4,
      boxShadow: "0 10px 22px rgba(0,0,0,.10), 0 2px 4px rgba(0,0,0,.06)",
      transform: "rotate(1.1deg)",
      position: "relative",
      cursor: "pointer",
    }}>
      <div className="tape t-tomato" style={{top:-10, left:40, transform:"rotate(-9deg)", width:90}} />
      <div className="h-mono" style={{color:"var(--ink-soft)"}}>remember when…</div>
      <div key={fadeKey} className="ww-fade">
        <div className="h-hand" style={{fontSize: 28, lineHeight: 1.2, marginTop: 10, color:"var(--ink)"}}>
          {friend.memory}?
        </div>
        <div className="h-hand" style={{fontSize: 20, color:"var(--ink-soft)", marginTop: 14, textAlign:"right"}}>
          — with {friend.name}
        </div>
      </div>
    </div>
  );
}

// ── RecentUploadsReel ───────────────────────────────────────────────────────
function RecentUploadsReel({ media, friends, onOpenLightbox }){
  const items = React.useMemo(() => {
    if (!media) return [];
    const all = [];
    for (const friend of friends) {
      const list = media[friend.friend_key || friend.name];
      if (!list || !list.length) continue;
      list.forEach(m => all.push({ ...m, friendName: friend.name, friend }));
    }
    all.sort((a, b) => (b.uploaded_at || 0) - (a.uploaded_at || 0));
    return all.slice(0, 12);
  }, [media, friends]);

  if (items.length === 0) return null;

  return (
    <div style={{margin: "10px auto 0", maxWidth: 880, padding: "8px 0"}}>
      <div className="h-mono" style={{color:"var(--ink-soft)", marginBottom: 12, paddingLeft: 4}}>recent on the wall</div>
      <div style={{
        display: "flex",
        gap: 16,
        overflowX: "auto",
        padding: "14px 4px 18px",
        scrollSnapType: "x mandatory",
      }}>
        {items.map((m, i) => (
          <div key={i} onClick={() => onOpenLightbox && onOpenLightbox(m)} style={{
            flexShrink: 0,
            width: 158,
            background: "#fbfaf3",
            padding: 8,
            paddingBottom: 28,
            boxShadow: "0 10px 22px rgba(0,0,0,.12)",
            transform: `rotate(${((i * 17) % 7) - 3}deg)`,
            cursor: "pointer",
            scrollSnapAlign: "start",
            position: "relative",
          }}>
            <div className="pin-dot" style={{"--pin-h": pinHueFromColor(m.friend.color)}} />
            <div style={{aspectRatio: "1/1", overflow: "hidden", borderRadius: 1, background: "#000", position: "relative"}}>
              {m.kind === "video" ? (
                <video src={m.url} muted preload="metadata"
                  style={{width: "100%", height: "100%", objectFit: "cover", display: "block"}} />
              ) : (
                <img src={m.url} alt={m.caption || m.friendName}
                  style={{width: "100%", height: "100%", objectFit: "cover", display: "block"}} />
              )}
              {m.kind === "video" && (
                <div style={{position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,.6)", color: "white", padding: "1px 5px", borderRadius: 2, fontSize: 9, fontFamily: "var(--mono)"}}>▶</div>
              )}
            </div>
            <div className="h-hand" style={{fontSize: 18, textAlign: "center", marginTop: 6, color: "var(--ink)"}}>{m.friendName}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── WhileWeWait wrapper ─────────────────────────────────────────────────────
function WhileWeWait({ friends, headlinerName, media, onOpenLightbox, today }){
  return (
    <section style={{margin: "0 auto 20px", maxWidth: 1100, padding: "0 32px"}}>
      <YearTimeline friends={friends} today={today} />
      <div style={{
        display: "flex",
        gap: 22,
        flexWrap: "wrap",
        margin: "20px auto",
        maxWidth: 880,
      }}>
        <FriendSpotlight friends={friends} headlinerName={headlinerName} media={media} onOpenLightbox={onOpenLightbox} />
        <MemoryShuffle friends={friends} />
      </div>
      <RecentUploadsReel media={media} friends={friends} onOpenLightbox={onOpenLightbox} />
    </section>
  );
}

Object.assign(window, { WhileWeWait, YearTimeline, FriendSpotlight, MemoryShuffle, RecentUploadsReel });
