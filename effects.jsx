// effects.jsx — confetti, balloons, sparkles, ambient drift, party mode bg

function rng(seed){
  let s = seed | 0;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

const CONFETTI_COLORS = [
  "var(--tomato)", "var(--mustard)", "var(--mint)", "var(--lavender)", "var(--sky)", "var(--pink)"
];

// A burst that rains for `duration` seconds, then fades. If continuous, it keeps going.
// Always rendered fixed to the viewport so pieces actually fall across the screen
// (otherwise an absolute parent with overflow:hidden traps them mid-air).
// Non-continuous bursts auto-unmount once the last piece has exited so they don't sit stuck.
function ConfettiBurst({ count = 80, duration = 6, continuous = false, seed = 1, intensity = 1 }){
  const [alive, setAlive] = React.useState(true);
  const pieces = React.useMemo(() => {
    const r = rng(seed);
    const maxDelay = continuous ? duration : duration * 0.6;
    return Array.from({length: count}, (_, i) => {
      const left = r() * 100;
      const delay = r() * maxDelay;
      const dur = 3 + r() * 4;
      const drift = (r() * 200 - 100) + "px";
      const spin = (r() * 720 + 360) + "deg";
      const size = 6 + r() * 10;
      const color = CONFETTI_COLORS[Math.floor(r() * CONFETTI_COLORS.length)];
      const shape = r();
      return {i, left, delay, dur, drift, spin, size, color, shape};
    });
  }, [count, seed, continuous, duration]);

  React.useEffect(() => {
    if (continuous) return;
    // longest piece = max delay (duration * 0.6) + max per-piece duration (~7s) + small buffer
    const ttlMs = (duration * 0.6 + 7 + 1) * 1000;
    setAlive(true);
    const t = setTimeout(() => setAlive(false), ttlMs);
    return () => clearTimeout(t);
  }, [continuous, duration, seed]);

  if (!alive) return null;

  return (
    <div style={{position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 30}}>
      {pieces.map(p => (
        <div key={p.i}
          className="confetti"
          style={{
            left: p.left + "%",
            width: p.size,
            height: p.shape > 0.5 ? p.size * 0.4 : p.size,
            background: p.color,
            borderRadius: p.shape > 0.8 ? "50%" : "2px",
            top: 0,
            "--drift": p.drift,
            "--spin": p.spin,
            animation: `fall ${p.dur}s cubic-bezier(.3,.1,.7,1) ${p.delay}s ${continuous ? "infinite" : "1"} both`,
            opacity: 0.9 * intensity,
          }}
        />
      ))}
    </div>
  );
}

// Floating balloons that drift up the screen. Click to pop.
function Balloons({ count = 8, palette = ["var(--tomato)","var(--mustard)","var(--mint)","var(--lavender)","var(--sky)","var(--pink)"] }){
  const [popped, setPopped] = React.useState({});
  const balloons = React.useMemo(() => {
    const r = rng(7);
    return Array.from({length: count}, (_, i) => ({
      i,
      left: r() * 100,
      delay: r() * 14,
      dur: 10 + r() * 8,
      bx: (r() * 160 - 80) + "px",
      color: palette[Math.floor(r() * palette.length)],
      scale: 0.7 + r() * 0.6,
    }));
  }, [count, palette]);

  return (
    <div style={{position:"fixed", inset:0, pointerEvents:"none", overflow:"hidden", zIndex: 25}}>
      {balloons.map(b => popped[b.i] ? null : (
        <div key={b.i}
          className="balloon"
          onClick={() => setPopped(p => ({...p, [b.i]: true}))}
          style={{
            left: b.left + "%",
            background: b.color,
            transform: `scale(${b.scale})`,
            animation: `floatup ${b.dur}s linear ${b.delay}s infinite`,
            "--bx": b.bx,
          }}
        />
      ))}
    </div>
  );
}

// Sparkles in random spots
function Sparkles({ count = 16, seed = 3 }){
  const ss = React.useMemo(() => {
    const r = rng(seed);
    return Array.from({length: count}, (_, i) => ({
      i,
      top: r() * 100,
      left: r() * 100,
      delay: r() * 3,
      dur: 2 + r() * 2,
      size: 6 + r() * 12,
    }));
  }, [count, seed]);
  return (
    <div style={{position:"absolute", inset:0, pointerEvents:"none", zIndex: 0}}>
      {ss.map(s => (
        <div key={s.i} className="twink" style={{
          top: s.top + "%", left: s.left + "%",
          width: s.size, height: s.size,
          animationDelay: s.delay + "s",
          animationDuration: s.dur + "s",
        }} />
      ))}
    </div>
  );
}

// Ambient drifters — random emojis float in from all four sides every few
// seconds, drift across the screen, then fade out. Cap concurrent drifters
// so the page never gets visually noisy.
function AmbientDrift({ enabled = true, spawnEveryMs = 1800, maxConcurrent = 8 }){
  const [drifters, setDrifters] = React.useState([]);
  React.useEffect(() => {
    if (!enabled) return;
    let id = 0;
    const KINDS = [
      "🎈","🎉","🎊","🥳","✨","🌟","💫","🎂","🍰","🎁","🎀",
      "✉️","🪁","🦋","🐦","🍃","💝","🌈","🍭","🍩","☘️","💌",
    ];
    const tick = () => {
      setDrifters(arr => {
        if (arr.length >= maxConcurrent) return arr;
        const id2 = id++;
        const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
        const from = ["left","right","top","bottom"][Math.floor(Math.random() * 4)];
        const dur = 12 + Math.random() * 12;          // 12–24s
        const scale = 0.6 + Math.random() * 0.8;       // 0.6–1.4
        const spin = Math.random() > 0.5 ? 1 : -1;
        const spinDeg = (10 + Math.random() * 30) * spin;
        // Cross-axis start position (where on the entering edge it appears)
        const cross = 5 + Math.random() * 90;          // 5–95 %
        // Cross-axis drift (how much it wanders across as it crosses)
        const drift = (Math.random() * 40 - 20);       // -20..+20 vw/vh
        const d = { id: id2, kind, from, dur, scale, spinDeg, cross, drift };
        // Self-cleanup
        setTimeout(() => setDrifters(a => a.filter(x => x.id !== id2)), dur * 1000);
        return [...arr, d];
      });
    };
    const first = setTimeout(tick, 1200);
    const interval = setInterval(tick, spawnEveryMs);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [enabled, spawnEveryMs, maxConcurrent]);

  // Per-direction start/end positioning. The animation translates from
  // start (just offscreen) to end (the opposite offscreen side), with a
  // small wander on the perpendicular axis.
  const styleFor = (d) => {
    switch (d.from) {
      case "left":   return { top: `${d.cross}%`, left: "-12%",  start: "0,0",       end: `124vw,${d.drift}vh` };
      case "right":  return { top: `${d.cross}%`, left: "112%",  start: "0,0",       end: `-124vw,${d.drift}vh` };
      case "top":    return { top: "-12%",        left: `${d.cross}%`, start: "0,0", end: `${d.drift}vw,124vh` };
      case "bottom": return { top: "112%",        left: `${d.cross}%`, start: "0,0", end: `${d.drift}vw,-124vh` };
      default:       return { top: "50%", left: "-12%", start: "0,0", end: "124vw,0" };
    }
  };

  return (
    <div style={{position:"fixed", inset:0, pointerEvents:"none", zIndex: 15, overflow:"hidden"}}>
      {drifters.map(d => {
        const pos = styleFor(d);
        return (
          <div key={d.id} style={{
            position: "absolute",
            top: pos.top,
            left: pos.left,
            fontSize: (24 * d.scale) + "px",
            animation: `drift-${d.id} ${d.dur}s linear forwards`,
            filter: "drop-shadow(0 2px 3px rgba(0,0,0,.12))",
            willChange: "transform",
          }}>
            <style>{`
              @keyframes drift-${d.id} {
                from { transform: translate(${pos.start}) rotate(${-d.spinDeg}deg); opacity: 0; }
                10%  { opacity: 1; }
                90%  { opacity: 1; }
                to   { transform: translate(${pos.end})   rotate(${d.spinDeg}deg); opacity: 0; }
              }
            `}</style>
            {d.kind}
          </div>
        );
      })}
    </div>
  );
}

// CAKE — a little stacked cake with N candles. Click candles to blow them out.
function Cake({ candles = 5, lit, onBlow }){
  const flames = React.useMemo(() => Array.from({length: candles}, (_,i) => i), [candles]);
  return (
    <div className="cake" role="img" aria-label="birthday cake">
      <div className="cake-base" />
      <div className="cake-drip" />
      <div className="cake-top" />
      {flames.map(i => {
        const left = 18 + i * ((160 - 36) / Math.max(candles - 1, 1));
        return (
          <div key={i} className="candle" style={{left}} onClick={() => onBlow && onBlow(i)}>
            {lit[i] && <div className="flame" />}
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { ConfettiBurst, Balloons, Sparkles, AmbientDrift, Cake });
