// cards.jsx — friend card variants for the wall

function PlaceholderPhoto({ hue, label, glyph, avatarUrl }){
  if (avatarUrl) {
    return (
      <div className="photo" style={{ position:"relative", overflow:"hidden", background:"transparent" }}>
        <img src={avatarUrl} alt={label}
          style={{position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", display:"block"}} />
      </div>
    );
  }
  return (
    <div className="photo" style={{ "--photo-hue": hue, position:"relative", overflow:"hidden" }}>
      <div style={{
        position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
        fontSize: 56, opacity:.55, filter:"saturate(.8)"
      }}>{glyph}</div>
      <span style={{position:"relative", zIndex:1}}>photo · {label}</span>
    </div>
  );
}

// Cover media for a card: rotates through friend's photos/videos if there are any.
// Hover a video to play it.
function CoverMedia({ media, hue, label, glyph, avatarUrl, size = 184 }){
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    if (!media || media.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % media.length), 4500);
    return () => clearInterval(t);
  }, [media && media.length]);

  if (!media || media.length === 0) {
    return <PlaceholderPhoto hue={hue} label={label} glyph={glyph} avatarUrl={avatarUrl} />;
  }
  const cur = media[idx % media.length];
  return (
    <div style={{
      aspectRatio: "1/1",
      width: "100%",
      position: "relative",
      overflow: "hidden",
      borderRadius: 1,
      background: `oklch(85% 0.05 ${hue})`,
    }}>
      {cur.kind === "video" ? (
        <video src={cur.url} muted loop playsInline preload="metadata"
          onMouseEnter={(e) => e.currentTarget.play().catch(()=>{})}
          onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
          style={{width:"100%", height:"100%", objectFit:"cover", display:"block"}} />
      ) : (
        <img src={cur.url} alt={cur.caption || label}
          style={{width:"100%", height:"100%", objectFit:"cover", display:"block"}} />
      )}
      {media.length > 1 && (
        <div style={{
          position:"absolute", top:6, right:6,
          background:"rgba(0,0,0,.55)", color:"white",
          padding:"2px 6px", borderRadius: 99,
          fontFamily:"var(--mono)", fontSize: 9, letterSpacing:".06em",
        }}>{idx+1}/{media.length}</div>
      )}
      {cur.kind === "video" && (
        <div style={{
          position:"absolute", bottom:6, left:6,
          background:"rgba(0,0,0,.55)", color:"white",
          padding:"2px 6px", borderRadius: 3,
          fontFamily:"var(--mono)", fontSize: 9, letterSpacing:".06em",
        }}>▶</div>
      )}
    </div>
  );
}

function pinHueFromColor(c){
  // crude mapping from CSS var to a pin hue
  if (c.includes("tomato")) return 30;
  if (c.includes("mustard")) return 80;
  if (c.includes("mint")) return 160;
  if (c.includes("sky")) return 220;
  if (c.includes("lavender")) return 300;
  if (c.includes("pink")) return 0;
  return 60;
}

function FriendCard({ friend, days, onClick, rot, wobDur, wobDelay, variant, media }){
  const bracket = days === 0 ? "today" : days <= 3 ? "imminent" : days <= 7 ? "soon" : days <= 30 ? "near" : "later";
  const pinH = pinHueFromColor(friend.color);

  // Bigger / louder for closer birthdays
  const scale = bracket === "imminent" ? 1.05 : bracket === "soon" ? 1.02 : 1;
  const cardClass = `polaroid wobble lift ${bracket === "imminent" ? "glow" : ""}`;

  return (
    <div
      className={cardClass}
      onClick={onClick}
      style={{
        width: 200 * scale,
        cursor:"pointer",
        "--rot": rot + "deg",
        "--wob-dur": wobDur + "s",
        "--wob-delay": wobDelay + "s",
        transform: `rotate(${rot}deg)`,
        position:"relative",
      }}
    >
      <div className="pin-dot" style={{"--pin-h": pinH}} />
      <CoverMedia media={media} hue={friend.photoHue} label={friend.name.toLowerCase()} glyph={friend.glyph} avatarUrl={friend.avatarUrl} />
      {media && media.length > 0 && (
        <div style={{position:"absolute", top:8, left:8, zIndex:3, fontSize: 16}}>📌</div>
      )}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginTop:10, padding:"0 4px"}}>
        <div>
          <div className="h-hand" style={{fontSize: 30, lineHeight: .9, color:"var(--ink)"}}>{friend.name}</div>
          <div className="h-mono" style={{color:"var(--ink-soft)", marginTop:4}}>
            {MONTHS_SHORT[friend.month-1]} {friend.day}
          </div>
        </div>
        <CountdownBadge days={days} color={friend.color} />
      </div>
    </div>
  );
}

function CountdownBadge({ days, color }){
  let label, big;
  if (days === 0){ label = "TODAY"; big = "🎉"; }
  else if (days === 1){ label = "tomorrow"; big = "1"; }
  else if (days <= 30){ label = days === 1 ? "day" : "days"; big = days; }
  else if (days <= 60){ label = "weeks"; big = Math.round(days/7); }
  else { label = "months"; big = Math.round(days/30); }

  return (
    <div style={{
      background: color,
      borderRadius: 999,
      padding: "6px 10px",
      minWidth: 38,
      textAlign: "center",
      border: "1.5px solid var(--ink)",
      transform: "rotate(4deg)",
      boxShadow: "0 3px 0 var(--ink)",
    }}>
      <div className="h-display" style={{fontSize: typeof big === "number" && big > 99 ? 14 : 18, lineHeight: 1, color:"var(--ink)"}}>
        {big}
      </div>
      <div style={{fontFamily:"var(--mono)", fontSize: 8, letterSpacing:".05em", color:"var(--ink)"}}>{label}</div>
    </div>
  );
}

// A big "next up" hero card for the friend whose birthday is soonest
function NextUpHero({ friend, days, onClick, media }){
  const pinH = pinHueFromColor(friend.color);
  return (
    <div onClick={onClick} style={{
      position:"relative",
      display:"grid",
      gridTemplateColumns:"minmax(0, 320px) 1fr",
      gap: 28,
      padding: "30px 30px 34px",
      background: "#fbfaf3",
      borderRadius: 6,
      transform: "rotate(-1.2deg)",
      boxShadow: "0 24px 50px rgba(0,0,0,.12), 0 4px 8px rgba(0,0,0,.06)",
      cursor:"pointer",
      maxWidth: 880,
      margin: "0 auto",
    }}>
      {/* washi tapes */}
      <div className="tape t-tomato" style={{top:-10, left:60, transform:"rotate(-8deg)"}} />
      <div className="tape t-mustard" style={{top:-10, right:80, transform:"rotate(12deg)", width:110}} />
      <div className="pin-dot" style={{"--pin-h": pinH, top:-8}} />

      <div style={{position:"relative"}}>
        <CoverMedia media={media} hue={friend.photoHue} label={friend.name.toLowerCase()} glyph={friend.glyph} avatarUrl={friend.avatarUrl} />
        {(!media || media.length === 0) && (
          <div style={{position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize: 110, opacity:.55, pointerEvents:"none"}}>
            {friend.glyph}
          </div>
        )}
      </div>

      <div style={{display:"flex", flexDirection:"column", justifyContent:"space-between"}}>
        <div>
          <div className="h-mono" style={{color:"var(--ink-soft)"}}>up next on the wall</div>
          <div className="h-display" style={{fontSize: "clamp(56px, 9vw, 110px)", marginTop: 6, color:"var(--ink)"}}>
            {friend.name}
            <span className="h-hand" style={{fontSize: 50, color: "var(--ink-soft)", marginLeft: 16, fontWeight: 500}}>turns up</span>
          </div>
        </div>

        <div style={{display:"flex", alignItems:"flex-end", gap: 30, marginTop:24, flexWrap:"wrap"}}>
          <div>
            <div className="h-mono" style={{color:"var(--ink-soft)"}}>in</div>
            <div className="h-display" style={{fontSize: 96, lineHeight:.9, color: "var(--tomato)"}}>
              <span className="scribble">{days}</span>
            </div>
            <div className="h-hand" style={{fontSize: 26, color:"var(--ink-soft)", marginTop: 4}}>
              {days === 0 ? "TODAY!!" : days === 1 ? "sleep" : "sleeps"}
            </div>
          </div>
          <div style={{maxWidth: 280}}>
            <div className="h-mono" style={{color:"var(--ink-soft)"}}>on</div>
            <div className="h-display" style={{fontSize: 28, lineHeight:1.05, color:"var(--ink)"}}>
              {MONTHS[friend.month-1]} {ordinal(friend.day)}
            </div>
            <div className="h-hand" style={{fontSize: 24, color:"var(--ink-soft)", marginTop: 10, lineHeight:1.15}}>
              {friend.vibe} —<br/>start planning something good.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// "Memory" modal — a sticky-note overlay with details about the friend
function MemoryModal({ friend, days, onClose, media, addFiles, removeMedia, updateCaption, onOpenLightbox }){
  const pinH = pinHueFromColor(friend.color);
  return (
    <div className="modal-bd" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth: 640}}>
        <div className="pin" />
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: 20}}>
          <div>
            <div className="h-mono" style={{color:"var(--ink-soft)"}}>friend profile</div>
            <div className="h-display" style={{fontSize: 56, lineHeight:.95, marginTop:4}}>{friend.name}</div>
            <div className="h-hand" style={{fontSize: 26, color:"var(--ink-soft)", marginTop:4}}>{friend.vibe}</div>
          </div>
          <div style={{
            background: friend.color, borderRadius: 999,
            padding: "8px 14px", border: "2px solid var(--ink)",
            boxShadow: "0 4px 0 var(--ink)", transform:"rotate(3deg)"
          }}>
            <div className="h-display" style={{fontSize: 20}}>{MONTHS_SHORT[friend.month-1]} {friend.day}</div>
          </div>
        </div>

        <EditableMemory friend={friend} />


        {addFiles && (
          <FriendScrapbook
            friend={friend}
            media={media}
            addFiles={addFiles}
            remove={removeMedia}
            updateCaption={updateCaption}
            onOpenLightbox={onOpenLightbox}
          />
        )}

        <div style={{display:"flex", gap:10, marginTop: 22, alignItems:"center", flexWrap:"wrap"}}>
          <div className="h-hand" style={{fontSize: 22, color:"var(--ink-soft)", flex:1}}>
            {days === 0 ? "🎉 it's literally today. go." :
             days === 1 ? "tomorrow! you've got one sleep." :
             days <= 7 ? `${days} sleeps. get the card.` :
             days <= 30 ? `${days} days — pencil it in.` :
             `${days} days away — but here when you need it.`}
          </div>
          <button className="btn" onClick={onClose}>back to the wall</button>
        </div>
      </div>
    </div>
  );
}

// Memory line — anyone in the group can edit. Server enforces group
// membership via set_friend_memory RPC. If the friend has no claimed
// profile yet, editing is disabled (need somewhere to write to).
function EditableMemory({ friend }){
  const auth = useAuth();
  const profileId = friend.profile?.id || null;
  const fallback = friend.memory || "";
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(fallback);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  React.useEffect(() => { setDraft(fallback); }, [fallback, editing]);

  const canEdit = !!profileId;

  const save = async () => {
    if (!profileId) return;
    setBusy(true); setErr("");
    try {
      await auth.setFriendMemory(profileId, draft);
      setEditing(false);
    } catch(e){ setErr(e?.message || "couldn't save"); }
    finally { setBusy(false); }
  };

  return (
    <div style={{
      marginTop: 22, padding: "16px 18px", background: "color-mix(in oklch, var(--mustard) 60%, white 40%)",
      borderRadius: 4, transform: "rotate(.6deg)", boxShadow:"0 6px 12px rgba(0,0,0,.08)",
      position: "relative",
    }}>
      <div className="h-mono" style={{color:"var(--ink-soft)", display: "flex", justifyContent: "space-between", alignItems: "baseline"}}>
        <span>remember when…</span>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="btn ghost" style={{fontSize: 10, padding: "2px 8px"}}>
            edit
          </button>
        )}
      </div>
      {editing ? (
        <div style={{marginTop: 8}}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="what's the story everyone tells about them?"
            rows={3}
            maxLength={400}
            autoFocus
            className="h-hand"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "8px 12px", fontSize: 22, lineHeight: 1.25,
              background: "rgba(255,255,255,.6)", border: "2px solid var(--ink)",
              borderRadius: 4, outline: "none", resize: "vertical",
            }}
          />
          {err && <div className="h-hand" style={{fontSize: 16, color: "var(--tomato)", marginTop: 4}}>{err}</div>}
          <div style={{display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end"}}>
            <button type="button" className="btn ghost" onClick={() => { setEditing(false); setErr(""); }} disabled={busy}>
              cancel
            </button>
            <button type="button" className="btn" onClick={save} disabled={busy}>
              {busy ? "saving…" : "save"}
            </button>
          </div>
        </div>
      ) : friend.memory ? (
        <div className="h-hand" style={{fontSize: 26, marginTop:4, lineHeight:1.2}}>{friend.memory}</div>
      ) : (
        <div className="h-hand" style={{fontSize: 22, marginTop:4, color: "var(--ink-soft)", fontStyle: "italic"}}>
          {canEdit ? "no memory yet — be the first to write one." : "no memory yet."}
        </div>
      )}
    </div>
  );
}

// PARTY VIEW — full-screen eruption when it's actually someone's birthday
function PartyView({ friend, candles, setCandles, onClose, media, addFiles, removeMedia, onOpenLightbox }){
  const allBlown = candles.every(c => !c);
  const [slide, setSlide] = React.useState(0);
  const hasMedia = media && media.length > 0;

  React.useEffect(() => {
    if (!hasMedia || media.length <= 1) return;
    const t = setInterval(() => setSlide(i => (i + 1) % media.length), 3500);
    return () => clearInterval(t);
  }, [hasMedia, media && media.length]);

  const cur = hasMedia ? media[slide % media.length] : null;

  return (
    <main style={{maxWidth: 1100, margin: "0 auto", padding: "20px 32px 80px", position:"relative", zIndex:20}}>

      {/* Big wobble title */}
      <div style={{textAlign:"center", marginTop: 30}}>
        <div className="h-hand" style={{fontSize: 34, color:"#fde8c8"}}>everybody, get in here —</div>
        <div className="h-display partytext" style={{
          fontSize:"clamp(80px, 16vw, 220px)", lineHeight:.85,
          color:"white", letterSpacing:"-.04em",
          textShadow:"0 6px 0 rgba(0,0,0,.25), 0 14px 30px rgba(0,0,0,.3)",
          marginTop: 10,
        }}>
          HAPPY<br/>
          <span style={{color:"var(--mustard)"}}>BIRTHDAY,</span><br/>
          <span style={{color:"white"}}>{friend.name.toUpperCase()}</span>
          <span style={{color:"var(--mustard)"}}>!!</span>
        </div>
      </div>

      {/* Big slideshow of THEIR photos/videos if we have any */}
      {hasMedia && (
        <div style={{margin: "30px auto 10px", maxWidth: 720, position:"relative"}}>
          <div style={{
            background:"#fbfaf3", padding: 14, borderRadius: 4,
            boxShadow:"0 24px 50px rgba(0,0,0,.4)",
            transform:"rotate(-1.2deg)",
            cursor:"pointer",
          }}
            onClick={() => onOpenLightbox && onOpenLightbox(cur)}
          >
            <div className="tape t-mustard" style={{top:-10, left:80, transform:"rotate(-6deg)"}} />
            <div className="tape t-tomato" style={{top:-10, right:80, transform:"rotate(10deg)"}} />
            <div style={{aspectRatio:"4/3", overflow:"hidden", borderRadius: 2, background:"#000"}}>
              {cur.kind === "video" ? (
                <video src={cur.url} autoPlay muted loop playsInline
                  style={{width:"100%", height:"100%", objectFit:"cover", display:"block"}} />
              ) : (
                <img src={cur.url} alt={cur.caption || ""}
                  style={{width:"100%", height:"100%", objectFit:"cover", display:"block"}} />
              )}
            </div>
            {cur.caption && (
              <div className="h-hand" style={{textAlign:"center", fontSize: 24, marginTop: 10, color:"var(--ink)"}}>
                “{cur.caption}”
              </div>
            )}
          </div>
          {media.length > 1 && (
            <div style={{display:"flex", justifyContent:"center", gap: 6, marginTop: 12}}>
              {media.map((_, i) => (
                <div key={i} onClick={() => setSlide(i)} style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: i === slide ? "var(--mustard)" : "rgba(255,255,255,.4)",
                  cursor:"pointer",
                }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cake */}
      <div style={{marginTop: hasMedia ? 30 : 40, display:"flex", flexDirection:"column", alignItems:"center", gap:14}}>
        <Cake
          candles={5}
          lit={candles}
          onBlow={(i) => setCandles(c => c.map((v, j) => j === i ? false : v))}
        />
        <div className="h-hand" style={{fontSize: 26, color:"#fde8c8", marginTop:8}}>
          {allBlown ? "🎂  make a wish (you did it)" : "click the candles to blow them out →"}
        </div>
      </div>

      {/* Sticky note details */}
      <div style={{
        marginTop: 50, maxWidth: 580, margin: "50px auto 0",
        background:"#fbfaf3", padding:"28px 30px",
        borderRadius: 4, transform:"rotate(-1.5deg)",
        boxShadow:"0 24px 50px rgba(0,0,0,.28)",
        position:"relative",
      }}>
        <div className="tape t-mint" style={{top:-10, left:60, transform:"rotate(-6deg)"}} />
        <div className="tape t-lav" style={{top:-10, right:60, transform:"rotate(10deg)", width:110}} />

        <div className="h-mono" style={{color:"var(--ink-soft)"}}>about the birthday person</div>
        <div className="h-display" style={{fontSize:38, marginTop:4}}>
          {friend.name} <span className="h-hand" style={{fontSize:30, color:"var(--ink-soft)"}}>— {friend.vibe}</span>
        </div>
        <div className="h-hand" style={{fontSize: 28, marginTop:14, lineHeight:1.2}}>
          remember when {friend.memory}? <span style={{opacity:.7}}>still the best.</span>
        </div>

        <div style={{display:"flex", gap:12, marginTop: 22, flexWrap:"wrap"}}>
          <button className="btn" onClick={() => {
            // Pop a quick navigator share or copy-to-clipboard
            const msg = `🎉 happy birthday ${friend.name}!! sending love today — the whole wall is celebrating you.`;
            if (navigator.clipboard) navigator.clipboard.writeText(msg);
            alert("Message copied:\n\n" + msg);
          }}>copy a "happy bday" msg</button>
          <button className="btn ghost" onClick={onClose}>see their profile + scrapbook</button>
        </div>
      </div>

      {/* Mini scrapbook strip on the bottom of the party view */}
      {addFiles && (
        <div style={{maxWidth: 880, margin: "50px auto 0", padding: "20px", background:"rgba(0,0,0,.18)", borderRadius: 10}}>
          <div className="h-hand" style={{fontSize: 28, color:"#fde8c8", textAlign:"center", marginBottom: 12}}>
            add a memory for {friend.name} →
          </div>
          <FriendScrapbook
            friend={friend}
            media={media}
            addFiles={addFiles}
            remove={removeMedia}
            updateCaption={() => {}}
            onOpenLightbox={onOpenLightbox}
          />
        </div>
      )}

      {/* Footer encouragement */}
      <div style={{textAlign:"center", marginTop: 60}}>
        <div className="h-hand" style={{fontSize: 30, color:"#fde8c8"}}>
          ✦  call them. write the card. eat the cake.  ✦
        </div>
      </div>
    </main>
  );
}

Object.assign(window, { FriendCard, NextUpHero, MemoryModal, CountdownBadge, pinHueFromColor, PartyView });
