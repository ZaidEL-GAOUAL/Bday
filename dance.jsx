// dance.jsx — disco ball + pixelated MJ doing the moonwalk.
// Pure decoration. Lives outside the auth gate so it's visible on the login screen too.

// ── Disco Ball ─────────────────────────────────────────────────────────────
function DiscoBall(){
  const [boosted, setBoosted] = React.useState(false);

  const boost = () => {
    window.dispatchEvent(new CustomEvent("dance:trigger"));
    setBoosted(true);
    setTimeout(() => setBoosted(false), 1000);
  };

  return (
    <div style={{
      position: "fixed",
      top: 18,
      left: 18,
      width: 58,
      pointerEvents: "auto",
      zIndex: 30,
      cursor: "pointer",
    }} onClick={boost} title="give it a spin">
      {/* chain */}
      <div style={{
        position: "absolute",
        top: 0,
        left: "50%",
        width: 2,
        height: 20,
        background: "rgba(0,0,0,.45)",
        transform: "translateX(-50%)",
      }} />
      {/* ball */}
      <div style={{
        marginTop: 20,
        width: 58,
        height: 58,
        borderRadius: "50%",
        position: "relative",
        overflow: "hidden",
        boxShadow: boosted
          ? "0 0 30px rgba(255,210,63,.9), 0 6px 14px rgba(0,0,0,.25), inset -6px -6px 14px rgba(0,0,0,.4), inset 4px 4px 8px rgba(255,255,255,.45)"
          : "0 6px 14px rgba(0,0,0,.25), inset -6px -6px 14px rgba(0,0,0,.4), inset 4px 4px 8px rgba(255,255,255,.45)",
        animation: `disco-spin ${boosted ? "1.4s" : "5s"} linear infinite`,
        transition: "box-shadow .3s",
      }}>
        <div style={{
          position: "absolute",
          inset: 0,
          background: `
            repeating-conic-gradient(from 0deg, #d8d8e0 0deg 18deg, #f0f0f5 18deg 36deg),
            radial-gradient(circle at 30% 30%, rgba(255,255,255,.9), transparent 50%)
          `,
          backgroundBlendMode: "screen",
        }} />
        <div style={{
          position: "absolute",
          top: "18%", left: "20%",
          width: "32%", height: "32%",
          background: "rgba(255,255,255,.75)",
          borderRadius: "50%",
          filter: "blur(8px)",
        }} />
      </div>
    </div>
  );
}

// ── Pixel MJ ───────────────────────────────────────────────────────────────
// Rendered as SVG rects on a 12×18 grid. Always faces forward; "moonwalks"
// by translating right-to-left across the viewport while bobbing slightly.
function PixelDancer({ runId, onDone }){
  const P = "#1A1A2E"; // suit / hat
  const W = "#FFFFFF"; // shirt / socks
  const S = "#E8B58E"; // skin
  const E = "#000";    // eyes / tie / shoes
  return (
    <div
      key={runId}
      style={{
        position: "fixed",
        bottom: 10,
        right: -120,
        width: 64,
        height: 96,
        pointerEvents: "none",
        zIndex: 25,
        animation: "moonwalk 18s linear forwards",
        filter: "drop-shadow(0 6px 4px rgba(0,0,0,.25))",
      }}
      onAnimationEnd={onDone}
    >
      <div style={{ animation: "mj-bob 0.45s ease-in-out infinite", transformOrigin: "center bottom" }}>
        <svg viewBox="0 0 12 18" shapeRendering="crispEdges" width="100%" height="100%">
          {/* hat */}
          <rect x="3" y="0" width="6" height="1" fill={P}/>
          <rect x="2" y="1" width="8" height="1" fill={P}/>
          <rect x="3" y="2" width="6" height="1" fill={P}/>
          {/* face */}
          <rect x="4" y="3" width="4" height="2" fill={S}/>
          <rect x="4" y="4" width="1" height="1" fill={E}/>
          <rect x="7" y="4" width="1" height="1" fill={E}/>
          {/* shoulders */}
          <rect x="2" y="5" width="8" height="1" fill={W}/>
          {/* shirt + tie */}
          <rect x="3" y="6" width="6" height="1" fill={W}/>
          <rect x="3" y="7" width="6" height="1" fill={W}/>
          <rect x="3" y="8" width="6" height="1" fill={W}/>
          <rect x="3" y="9" width="6" height="1" fill={W}/>
          <rect x="3" y="10" width="6" height="1" fill={W}/>
          <rect x="5" y="6" width="2" height="4" fill={E}/>
          {/* belt */}
          <rect x="3" y="11" width="6" height="1" fill={E}/>
          {/* pants */}
          <rect x="3" y="12" width="2" height="4" fill={P}/>
          <rect x="7" y="12" width="2" height="4" fill={P}/>
          {/* white socks (the iconic bit) */}
          <rect x="3" y="16" width="2" height="1" fill={W}/>
          <rect x="7" y="16" width="2" height="1" fill={W}/>
          {/* shoes */}
          <rect x="2" y="17" width="3" height="1" fill={E}/>
          <rect x="7" y="17" width="3" height="1" fill={E}/>
        </svg>
      </div>
    </div>
  );
}

// ── Music notes floating up behind the dancer ────────────────────────────
function MusicNotes({ runId }){
  const notes = React.useMemo(() => {
    return Array.from({length: 8}, (_, i) => ({
      i, ch: ["♪","♫","♬","♩"][i % 4],
      delay: i * 0.7 + Math.random() * 0.4,
      sway: (Math.random() * 60 - 30),
      from: 60 + Math.random() * 40, // % across bottom-right
      color: ["#FF3D7F","#3B5BFF","#FFD23F","#1A1A2E"][i % 4],
      size: 22 + Math.random() * 10,
    }));
  }, [runId]);
  return (
    <div style={{position:"fixed", inset:0, pointerEvents:"none", zIndex: 24, overflow:"hidden"}}>
      {notes.map(n => (
        <div key={n.i} style={{
          position: "absolute",
          bottom: -40,
          right: n.from + "%",
          fontSize: n.size,
          color: n.color,
          fontFamily: "serif",
          textShadow: "0 2px 0 rgba(0,0,0,.2)",
          animation: `note-float 4.5s ease-out ${n.delay}s forwards`,
          ["--sway"]: n.sway + "px",
        }}>{n.ch}</div>
      ))}
    </div>
  );
}

// ── DanceFloor — orchestrates everything ──────────────────────────────────
function DanceFloor(){
  const [run, setRun] = React.useState({ id: 0, active: false });

  const trigger = React.useCallback(() => {
    setRun(r => ({ id: r.id + 1, active: true }));
  }, []);

  React.useEffect(() => {
    const handler = () => trigger();
    window.addEventListener("dance:trigger", handler);
    // First spontaneous appearance after a moment of calm
    const initial = setTimeout(trigger, 12000);
    // Then recur every ~50s
    const recur = setInterval(trigger, 50000);
    return () => {
      window.removeEventListener("dance:trigger", handler);
      clearTimeout(initial);
      clearInterval(recur);
    };
  }, [trigger]);

  return (
    <>
      <DiscoBall />
      {run.active && (
        <>
          <PixelDancer runId={run.id} onDone={() => setRun(r => ({...r, active: false}))} />
          <MusicNotes runId={run.id} />
        </>
      )}
    </>
  );
}

Object.assign(window, { DiscoBall, PixelDancer, MusicNotes, DanceFloor });
