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
// seconds. Clickable now: tap one and it pops into a small radial burst of
// mini copies + a "+1" floater. Every 10 catches triggers a brief cheer.
function AmbientDrift({ enabled = true, spawnEveryMs = 1800, maxConcurrent = 8 }){
  const [drifters, setDrifters] = React.useState([]);
  const [pops, setPops] = React.useState([]);
  const [score, setScore] = React.useState(0);
  const [milestone, setMilestone] = React.useState(null);
  const idRef = React.useRef(0);

  React.useEffect(() => {
    if (!enabled) return;
    const KINDS = [
      "🎈","🎉","🎊","🥳","✨","🌟","💫","🎂","🍰","🎁","🎀",
      "✉️","🪁","🦋","🐦","🍃","💝","🌈","🍭","🍩","☘️","💌",
    ];
    const tick = () => {
      setDrifters(arr => {
        if (arr.length >= maxConcurrent) return arr;
        const id2 = ++idRef.current;
        const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
        const from = ["left","right","top","bottom"][Math.floor(Math.random() * 4)];
        const dur = 12 + Math.random() * 12;
        const scale = 0.6 + Math.random() * 0.8;
        const spin = Math.random() > 0.5 ? 1 : -1;
        const spinDeg = (10 + Math.random() * 30) * spin;
        const cross = 5 + Math.random() * 90;
        const drift = (Math.random() * 40 - 20);
        const d = { id: id2, kind, from, dur, scale, spinDeg, cross, drift };
        setTimeout(() => setDrifters(a => a.filter(x => x.id !== id2)), dur * 1000);
        return [...arr, d];
      });
    };
    const first = setTimeout(tick, 1200);
    const interval = setInterval(tick, spawnEveryMs);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [enabled, spawnEveryMs, maxConcurrent]);

  const styleFor = (d) => {
    switch (d.from) {
      case "left":   return { top: `${d.cross}%`, left: "-12%",  start: "0,0",       end: `124vw,${d.drift}vh` };
      case "right":  return { top: `${d.cross}%`, left: "112%",  start: "0,0",       end: `-124vw,${d.drift}vh` };
      case "top":    return { top: "-12%",        left: `${d.cross}%`, start: "0,0", end: `${d.drift}vw,124vh` };
      case "bottom": return { top: "112%",        left: `${d.cross}%`, start: "0,0", end: `${d.drift}vw,-124vh` };
      default:       return { top: "50%", left: "-12%", start: "0,0", end: "124vw,0" };
    }
  };

  const onCatch = (drifter, e) => {
    e.stopPropagation();
    setDrifters(arr => arr.filter(x => x.id !== drifter.id));
    const pid = ++idRef.current;
    const x = e.clientX, y = e.clientY;
    setPops(arr => [...arr, { id: pid, x, y, kind: drifter.kind }]);
    setTimeout(() => setPops(arr => arr.filter(p => p.id !== pid)), 1000);
    setScore(s => {
      const next = s + 1;
      if (next % 10 === 0) {
        const mid = ++idRef.current;
        setMilestone({ id: mid, n: next });
        setTimeout(() => setMilestone(m => m && m.id === mid ? null : m), 2400);
      }
      return next;
    });
  };

  const PRAISES = [
    "nice reflexes",
    "you're a menace to confetti",
    "the wall thanks you",
    "do you ever miss one?",
    "okay, show-off",
    "🎉 keep going",
  ];

  return (
    <div style={{position:"fixed", inset:0, pointerEvents:"none", zIndex: 15, overflow:"hidden"}}>
      <style>{`
        @keyframes drift-emoji-pop {
          0%   { transform: translate(-50%, -50%) scale(.4); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx, 0px)), calc(-50% + var(--dy, 0px))) scale(1.1); opacity: 0; }
        }
        @keyframes drift-emoji-plus {
          0%   { transform: translate(-50%, 0px) scale(.8); opacity: 1; }
          100% { transform: translate(-50%, -70px) scale(1.15); opacity: 0; }
        }
        @keyframes drift-emoji-milestone {
          0%   { transform: translate(-50%, -50%) scale(.4) rotate(-6deg); opacity: 0; }
          15%  { transform: translate(-50%, -50%) scale(1.08) rotate(2deg); opacity: 1; }
          70%  { transform: translate(-50%, -50%) scale(1) rotate(-2deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(.9) rotate(0deg); opacity: 0; }
        }
      `}</style>

      {drifters.map(d => {
        const pos = styleFor(d);
        return (
          <button
            key={d.id}
            onClick={(e) => onCatch(d, e)}
            aria-label={`catch ${d.kind}`}
            title="catch it"
            style={{
              pointerEvents: "auto",
              position: "absolute",
              top: pos.top,
              left: pos.left,
              fontSize: (24 * d.scale) + "px",
              animation: `drift-${d.id} ${d.dur}s linear forwards`,
              filter: "drop-shadow(0 2px 3px rgba(0,0,0,.12))",
              willChange: "transform",
              background: "transparent",
              border: 0,
              padding: 6,
              cursor: "pointer",
              userSelect: "none",
              lineHeight: 1,
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
          </button>
        );
      })}

      {pops.map(p => (
        <div key={p.id} style={{
          position: "fixed", left: p.x, top: p.y, pointerEvents: "none",
        }}>
          {[0, 60, 120, 180, 240, 300].map((angle, i) => {
            const rad = angle * Math.PI / 180;
            return (
              <span key={i} style={{
                position: "absolute",
                fontSize: 22,
                left: 0, top: 0,
                animation: "drift-emoji-pop 900ms ease-out forwards",
                "--dx": `${Math.cos(rad) * 56}px`,
                "--dy": `${Math.sin(rad) * 56}px`,
              }}>{p.kind}</span>
            );
          })}
          <div className="h-display" style={{
            position: "absolute", left: 0, top: -10,
            fontSize: 22, color: "var(--tomato)",
            textShadow: "0 2px 4px rgba(255,255,255,.6)",
            animation: "drift-emoji-plus 900ms ease-out forwards",
          }}>+1</div>
        </div>
      ))}

      {milestone && (
        <div style={{
          position: "fixed", top: "30%", left: "50%",
          pointerEvents: "none",
          background: "color-mix(in oklch, var(--mustard) 90%, white 10%)",
          border: "3px solid var(--ink)", borderRadius: 10,
          padding: "16px 32px",
          boxShadow: "0 18px 36px rgba(0,0,0,.28)",
          animation: "drift-emoji-milestone 2400ms ease-out forwards",
          textAlign: "center",
        }}>
          <div className="h-display" style={{fontSize: 42, color: "var(--ink)", lineHeight: 1}}>
            caught {milestone.n}! 🎉
          </div>
          <div className="h-hand" style={{fontSize: 20, color: "var(--ink-soft)", marginTop: 4}}>
            {PRAISES[Math.floor((milestone.n / 10 - 1) % PRAISES.length)]}
          </div>
        </div>
      )}

      {score > 0 && (
        <div title="emojis caught" style={{
          position: "fixed", bottom: 14, left: 14,
          background: "rgba(20,12,8,.7)", color: "white",
          padding: "4px 12px", borderRadius: 999,
          fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".08em",
          textTransform: "uppercase",
          pointerEvents: "none",
          backdropFilter: "blur(4px)",
        }}>caught · {score}</div>
      )}
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
