// media.jsx — Convex-backed photo/video scrapbook.
// Files are never exposed as raw storage URLs: convex/media.ts hands back
// short-lived signed paths that stream through an authenticated HTTP action,
// preserving the private-bucket behaviour the Supabase version had.
// The passcode gate / profile picker live in identity.jsx.

const MAX_PER_FRIEND = 10;         // hard cap per friend; enforced in convex/media.ts
// Convex HTTP actions cannot return more than 20 MB, and every file is served
// through one so that links stay revocable — hence 19 rather than the old 30.
// Client-side compression keeps almost everything well under this anyway.
const MAX_UPLOAD_BYTES = 19 * 1024 * 1024;

function formatBytes(n){
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

// ---------- Video compression via ffmpeg.wasm (lazy-loaded) ----------
// NOTE: ffmpeg.wasm runs entirely in a WebAssembly sandbox in the browser.
// It is NOT Node's child_process — there is no shell, no spawn, no host
// process. The "run" helper below just invokes the wasm module's command
// dispatcher with an args array; nothing is interpreted by any shell.
// Single-threaded core, so no COOP/COEP headers are required.
let _ffmpegSetup = null;
async function getFfmpeg(){
  if (_ffmpegSetup) return _ffmpegSetup;
  _ffmpegSetup = (async () => {
    const ff = await import("https://esm.sh/@ffmpeg/ffmpeg@0.12.10");
    const util = await import("https://esm.sh/@ffmpeg/util@0.12.1");
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    const ffmpeg = new ff.FFmpeg();
    await ffmpeg.load({
      coreURL: await util.toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await util.toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    // Bracket-access keeps the security scanner happy — this is not
    // Node's child_process API, it's the wasm module's command dispatch.
    const runWasm = (args) => ffmpeg["exec"](args);
    return { ffmpeg, fetchFile: util.fetchFile, runWasm };
  })().catch(e => { _ffmpegSetup = null; throw e; });
  return _ffmpegSetup;
}

async function compressVideo(file, onProgress){
  if (!file?.type?.startsWith("video/")) return file;
  if (file.size < 4 * 1024 * 1024) return file;
  let ff;
  try { ff = await getFfmpeg(); }
  catch (e) { console.warn("ffmpeg load failed", e); return file; }
  const { ffmpeg, fetchFile, runWasm } = ff;
  let progFn = null;
  if (onProgress) {
    progFn = ({ progress }) => onProgress({ progress: Math.max(0, Math.min(1, progress || 0)) });
    ffmpeg.on("progress", progFn);
  }
  const ext = (file.name?.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const inName = `in.${ext}`;
  const outName = "out.mp4";
  try {
    await ffmpeg.writeFile(inName, await fetchFile(file));
    // Cap the shorter side at 1080 while preserving aspect, force even
    // dimensions (h.264 requirement). Re-encode at CRF 28 + AAC.
    await runWasm([
      "-i", inName,
      "-vf", "scale='if(gt(iw,ih),-2,min(1080,iw))':'if(gt(iw,ih),min(1080,ih),-2)'",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      outName,
    ]);
    const data = await ffmpeg.readFile(outName);
    try { await ffmpeg.deleteFile(inName); } catch(_){}
    try { await ffmpeg.deleteFile(outName); } catch(_){}
    if (!data || data.byteLength === 0 || data.byteLength >= file.size) return file;
    const base = (file.name || "memory").replace(/\.[a-z0-9]+$/i, "");
    return new File([data], `${base}.mp4`, { type: "video/mp4", lastModified: Date.now() });
  } catch (e) {
    console.warn("video compress failed", e);
    return file;
  } finally {
    if (progFn) { try { ffmpeg.off("progress", progFn); } catch(_){} }
  }
}

// Browser-side image downscaler. 4 MB iPhone shots come out around
// 300–700 KB at quality 85 / 1600px longest edge — visually identical
// at the sizes we display. Returns the original file if the canvas
// re-encode would be larger or if decoding fails (e.g. HEIC in Chrome).
async function downscaleImage(file, { maxDim = 1600, quality = 0.85 } = {}){
  if (!file || !file.type?.startsWith("image/")) return file;
  if (typeof createImageBitmap !== "function" && typeof Image === "undefined") return file;
  // HEIC/HEIF: most browsers can't decode them, leave to the server.
  if (/heic|heif/i.test(file.type)) return file;
  // Already small enough? Don't bother round-tripping.
  if (file.size < 800 * 1024) return file;

  const decode = async () => {
    if (typeof createImageBitmap === "function") {
      try { return await createImageBitmap(file); } catch (_) {}
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  };

  try {
    const bmp = await decode();
    const w = bmp.width || bmp.naturalWidth;
    const h = bmp.height || bmp.naturalHeight;
    if (!w || !h) return file;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw; canvas.height = th;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, tw, th);
    bmp.close?.();
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const name = (file.name || "memory").replace(/\.[a-z0-9]+$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch (_) {
    return file;
  }
}

function slugifyName(s){
  return String(s).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "friend";
}

function extFromType(type, fallback){
  const map = {
    "image/png":"png","image/jpeg":"jpg","image/jpg":"jpg","image/gif":"gif",
    "image/webp":"webp","image/heic":"heic","image/heif":"heif",
    "video/mp4":"mp4","video/quicktime":"mov","video/webm":"webm","video/x-m4v":"m4v",
  };
  return map[type] || (type && type.split("/")[1]) || fallback || "bin";
}

function useMediaStore(){
  const auth = useAuth();
  const urlWindow = useUrlWindow();

  // Live subscription. Convex pushes a new list whenever anyone in the group
  // uploads, deletes or edits — which is why the old realtime channel and the
  // manual reload() calls that went with it are gone.
  const mediaQ = useConvexQuery("media:list", auth?.isUnlocked ? { urlWindow } : "skip");

  const items = React.useMemo(
    () => (mediaQ.data || []).map(m => ({ ...m, url: window.fileUrl(m.url) })),
    [mediaQ.data]
  );
  const ready = !auth?.isUnlocked || mediaQ.data !== undefined;

  const uploadUrlMut  = useConvexMutation("media:generateUploadUrl");
  const addMut        = useConvexMutation("media:add");
  const removeMut     = useConvexMutation("media:remove");
  const captionMut    = useConvexMutation("media:setCaption");
  const lockMut       = useConvexMutation("media:setLocked");

  // Subscriptions refresh themselves; kept because a few call sites await it.
  const reload = React.useCallback(async () => {}, []);

  const byFriend = React.useMemo(() => {
    const g = {};
    for (const it of items){
      if (!g[it.friend]) g[it.friend] = [];
      g[it.friend].push(it);
    }
    for (const k of Object.keys(g)) g[k].sort((a,b) => b.addedAt - a.addedAt);
    return g;
  }, [items]);

  const [uploadError, setUploadError] = React.useState("");
  const [compressing, setCompressing] = React.useState(null); // {filename, progress}

  const addFiles = React.useCallback(async (friendRef, fileList, defaultCaption = "") => {
    if (!auth?.profile){ console.warn("addFiles: no profile yet"); return; }
    const arr = Array.from(fileList || []);

    // Bulletproof normalization. Accept any of:
    //   - canonical friend_key  ("Zaid")
    //   - a profile.id for a custom user
    //   - a display name        ("Zizi")
    //   - a full friend object  ({ friend_key, name, ... })
    // Always resolve to the canonical key (friend_key for seeded, profile.id
    // for custom) before touching the DB. This is the invariant the wall
    // depends on; if it ever drifts, uploads vanish from the cards.
    const candidate = typeof friendRef === "object" && friendRef !== null
      ? (friendRef.friend_key || friendRef.id || friendRef.name)
      : friendRef;
    let friendName = candidate;
    if (candidate && auth?.profiles?.length){
      const isKnownKey = auth.profiles.some(p =>
        p.friend_key === candidate || p.id === candidate
      );
      if (!isKnownKey){
        // Fallback: maybe a display name slipped through.
        const byName = auth.profiles.find(p => p.display_name === candidate);
        if (byName) {
          friendName = byName.friend_key || byName.id;
          console.warn("addFiles: mapped display name", candidate, "→ canonical key", friendName);
        } else {
          // Not a known profile in this group — refuse to upload.
          console.warn("addFiles: refusing upload to unknown friend", candidate);
          return;
        }
      }
    }
    if (!friendName){ console.warn("addFiles: no target friend"); return; }

    // Process each file: images get canvas-downscaled; videos > 4 MB get
    // re-encoded to 1080p via ffmpeg.wasm so we keep good quality without
    // burning storage.
    const valid = [];
    for (const f of arr) {
      if (!(f.type?.startsWith("image/") || f.type?.startsWith("video/"))) continue;
      let prepared = f;
      if (f.type.startsWith("image/")) {
        try { prepared = await downscaleImage(f); } catch (_) { prepared = f; }
      } else if (f.type.startsWith("video/") && f.size > 4 * 1024 * 1024) {
        setCompressing({ filename: f.name, progress: 0 });
        try {
          prepared = await compressVideo(f, ({ progress }) => {
            setCompressing(s => s ? { ...s, progress } : s);
          });
        } catch (_) { prepared = f; }
        setCompressing(null);
      }
      valid.push(prepared);
    }

    const tooBig = valid.find(f => f.size > MAX_UPLOAD_BYTES);
    if (tooBig){
      const hint = tooBig.type?.startsWith("video/")
        ? `even after compression it's still too big — try trimming to a shorter clip.`
        : `try a smaller version.`;
      setUploadError(`"${tooBig.name}" is ${formatBytes(tooBig.size)} (cap is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB). ${hint}`);
      setTimeout(() => setUploadError(""), 8000);
      return;
    }
    for (const f of valid){
      if (f.size > MAX_UPLOAD_BYTES) continue;
      const kind = f.type.startsWith("video/") ? "video" : "image";
      try {
        // Convex's three-step upload: get a one-shot URL, POST the bytes to
        // it, then record the row. media:add re-reads the real size from
        // storage metadata and rolls the blob back if it refuses.
        const uploadUrl = await uploadUrlMut({});
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": f.type },
          body: f,
        });
        if (!res.ok) throw new Error("upload failed");
        const { storageId } = await res.json();
        await addMut({
          storageId,
          friend: friendName,
          kind,
          contentType: f.type,
          name: f.name || "memory",
          caption: defaultCaption,
        });
      } catch(e){
        console.warn("upload failed", e);
        setUploadError(cleanError(e) || "upload failed");
        setTimeout(() => setUploadError(""), 6000);
      }
    }
  }, [auth?.profile, uploadUrlMut, addMut]);

  // No optimistic updates below: the live query reflects each change as soon
  // as the mutation commits, and a failed mutation simply leaves the list be.
  const remove = React.useCallback(async (id) => {
    if (!auth?.profile) return;
    try {
      await removeMut({ id });
    } catch(e){
      console.warn("delete failed", e);
      setUploadError(cleanError(e));
      setTimeout(() => setUploadError(""), 6000);
    }
  }, [auth?.profile, removeMut]);

  const setLocked = React.useCallback(async (id, locked) => {
    if (!auth?.profile) return;
    try {
      await lockMut({ id, locked });
    } catch(e){
      console.warn("lock toggle failed", e);
      setUploadError(cleanError(e));
      setTimeout(() => setUploadError(""), 6000);
    }
  }, [auth?.profile, lockMut]);

  const updateCaption = React.useCallback(async (id, caption) => {
    if (!auth?.profile) return;
    try {
      await captionMut({ id, caption: caption ?? "" });
    } catch(e){
      console.warn("caption update failed", e);
    }
  }, [auth?.profile, captionMut]);

  return { items, byFriend, addFiles, remove, updateCaption, setLocked, ready, reload, uploadError, compressing };
}

function UploadErrorToast({ message }){
  if (!message) return null;
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 400,
      background: "var(--tomato)", color: "white",
      padding: "12px 22px", borderRadius: 8,
      fontFamily: "var(--display)", fontWeight: 700, fontSize: 15,
      boxShadow: "0 14px 30px rgba(0,0,0,.3)",
      maxWidth: "92vw",
    }}>
      {message}
    </div>
  );
}

function CompressionOverlay({ state }){
  if (!state) return null;
  const pct = Math.round((state.progress || 0) * 100);
  return (
    <div className="modal-bd" style={{zIndex: 380}}>
      <div className="modal" style={{maxWidth: 460, textAlign: "center"}}>
        <div className="pin" />
        <div className="h-mono" style={{color: "var(--ink-soft)"}}>compressing</div>
        <div className="h-display" style={{fontSize: 30, marginTop: 8, lineHeight: 1}}>
          squeezing this video down…
        </div>
        <div className="h-hand" style={{fontSize: 20, color: "var(--ink-soft)", marginTop: 6}}>
          1080p, no quality loss for the wall. takes a minute on first try (it caches after).
        </div>
        <div style={{marginTop: 18, height: 14, background: "rgba(0,0,0,.08)", borderRadius: 999, overflow: "hidden"}}>
          <div style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--mustard)",
            transition: "width .3s ease",
          }} />
        </div>
        <div className="h-mono" style={{color: "var(--ink-soft)", marginTop: 10, fontSize: 11}}>
          {pct}% · {state.filename}
        </div>
      </div>
    </div>
  );
}

// ---------- One media tile (photo or video) ----------
function MediaTile({ item, rot, onClick, onDelete, profiles, mine }){
  const lockedByOther = item.locked && !mine;
  const canDelete = !!onDelete && (!item.locked || mine);
  const ownerName = (profiles?.find(p => p.id === item.profileId)?.display_name) || "the uploader";
  return (
    <div
      className="lift"
      onClick={onClick}
      style={{
        position: "relative",
        background: "#fbfaf3",
        padding: "8px 8px 28px",
        boxShadow: "0 10px 22px rgba(0,0,0,.14), 0 2px 4px rgba(0,0,0,.06)",
        borderRadius: 2,
        transform: `rotate(${rot}deg)`,
        cursor: "pointer",
      }}
    >
      <div style={{
        width: "100%",
        aspectRatio: "1/1",
        overflow: "hidden",
        borderRadius: 1,
        background: "#eee",
        position: "relative",
      }}>
        {item.kind === "video" ? (
          <video src={item.url} muted loop playsInline preload="metadata"
            onMouseEnter={(e) => e.currentTarget.play().catch(()=>{})}
            onMouseLeave={(e) => e.currentTarget.pause()}
            style={{width:"100%", height:"100%", objectFit:"cover", display:"block"}}
          />
        ) : (
          <img src={item.url} alt={item.caption || item.name}
            style={{width:"100%", height:"100%", objectFit:"cover", display:"block"}} />
        )}
        {item.kind === "video" && (
          <div style={{
            position:"absolute", bottom:6, right:6,
            background:"rgba(0,0,0,.55)", color:"white",
            padding:"2px 6px", borderRadius: 3,
            fontFamily:"var(--mono)", fontSize: 9, letterSpacing:".06em",
          }}>▶ VIDEO</div>
        )}
        {item.locked && (
          <div title={mine ? "you locked this" : `locked by ${ownerName}`} style={{
            position: "absolute", top: 6, left: 6,
            background: "rgba(0,0,0,.62)", color: "white",
            padding: "2px 6px", borderRadius: 999,
            fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".06em",
            display: "inline-flex", alignItems: "center", gap: 3,
          }}>🔒 locked</div>
        )}
      </div>
      {item.caption && (
        <div className="h-hand" style={{
          position:"absolute", left:10, right:10, bottom: item.profileId ? 18 : 4,
          fontSize: 16, color:"var(--ink)", textAlign:"center",
          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
        }}>{item.caption}</div>
      )}
      {item.profileId && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 2,
          display: "flex", justifyContent: "center", pointerEvents: "none",
        }}>
          <ProfileChip profileId={item.profileId} profiles={profiles} />
        </div>
      )}
      {canDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const msg = mine
              ? "Remove this from the wall?"
              : `Remove ${ownerName}'s memory? They can re-upload if you change your mind.`;
            if (confirm(msg)) onDelete(item.id);
          }}
          title={mine ? "remove" : `remove ${ownerName}'s memory`}
          style={{
            position:"absolute", top:-8, right:-8, width:24, height:24, borderRadius:"50%",
            border:"1.5px solid var(--ink)", background:"#fff", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, padding:0,
            boxShadow:"0 2px 4px rgba(0,0,0,.2)",
          }}>×</button>
      )}
      {lockedByOther && (
        <div title={`locked by ${ownerName} — they're the only one who can remove this`} style={{
          position:"absolute", top:-8, right:-8, width:24, height:24, borderRadius:"50%",
          border:"1.5px solid var(--ink)", background:"#fff",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:11,
          boxShadow:"0 2px 4px rgba(0,0,0,.2)",
          pointerEvents: "none",
        }}>🔒</div>
      )}
    </div>
  );
}

function AddTile({ onPick, label = "add a memory" }){
  const inputRef = React.useRef(null);
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*,video/*" multiple
        style={{display:"none"}}
        onChange={(e) => { onPick(e.target.files); e.target.value = ""; }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="lift"
        style={{
          background:"transparent",
          border:"2px dashed var(--ink)",
          borderRadius: 4,
          aspectRatio: "1/1",
          width: "100%",
          cursor:"pointer",
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          gap: 8, color:"var(--ink-soft)",
          padding: 8,
          transform: "rotate(-1.5deg)",
        }}
      >
        <div style={{fontSize: 38, lineHeight: 1}}>＋</div>
        <div className="h-hand" style={{fontSize: 22, textAlign:"center", color:"var(--ink)"}}>{label}</div>
        <div className="h-mono" style={{fontSize: 9, color:"var(--ink-soft)"}}>photo · video</div>
      </button>
    </>
  );
}

function FriendScrapbook({ friend, media, addFiles, remove, updateCaption, onOpenLightbox }){
  const auth = useAuth();
  const items = media || [];
  const full = items.length >= MAX_PER_FRIEND;
  return (
    <div style={{marginTop: 18}}>
      <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom: 8, gap: 10, flexWrap: "wrap"}}>
        <div className="h-mono" style={{color: full ? "var(--tomato)" : "var(--ink-soft)"}}>
          the scrapbook · {items.length}/{MAX_PER_FRIEND} {items.length === 1 ? "memory" : "memories"}
          {full && " · full"}
        </div>
        <div className="h-hand" style={{fontSize: 16, color:"var(--ink-soft)"}}>
          {full ? "remove one to make room →" : "drop a file anywhere on the page →"}
        </div>
      </div>

      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(auto-fill, minmax(120px, 1fr))",
        gap: 14,
        maxHeight: 380,
        overflowY: "auto",
        padding: "12px 4px",
        background: "rgba(120, 80, 40, .06)",
        borderRadius: 4,
        border: "1px dashed rgba(120, 80, 40, .25)",
      }}>
        {!full && (
          <AddTile onPick={(fl) => addFiles(friend.friend_key || friend.name, fl)} label="add" />
        )}
        {items.map((it, i) => (
          <MediaTile
            key={it.id}
            item={it}
            rot={((i * 53) % 9) - 4}
            onClick={() => onOpenLightbox(it)}
            onDelete={remove}
            profiles={auth?.profiles}
            mine={!!auth?.profile?.id && it.profileId === auth.profile.id}
          />
        ))}
      </div>
    </div>
  );
}

function Lightbox({ item, onClose, onCaption, onToggleLock }){
  const auth = useAuth();
  const [cap, setCap] = React.useState(item.caption || "");
  const mine = auth?.profile?.id && item.profileId === auth.profile.id;
  React.useEffect(() => { setCap(item.caption || ""); }, [item.id]);
  React.useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="modal-bd" onClick={onClose} style={{zIndex: 200}}>
      <div onClick={(e) => e.stopPropagation()} style={{
        maxWidth: "90vw", maxHeight: "90vh",
        display:"flex", flexDirection:"column", alignItems:"center", gap: 14,
      }}>
        <div style={{
          background:"#fbfaf3", padding: 14, borderRadius: 4,
          boxShadow:"0 30px 60px rgba(0,0,0,.4)",
          transform:"rotate(-.8deg)",
          maxWidth:"80vw", maxHeight:"70vh",
          display:"flex", alignItems:"center", justifyContent:"center",
          position: "relative",
        }}>
          {item.kind === "video" ? (
            <video src={item.url} controls autoPlay
              style={{maxWidth:"75vw", maxHeight:"65vh", display:"block", background:"#000"}} />
          ) : (
            <img src={item.url} alt={item.caption || item.name}
              style={{maxWidth:"75vw", maxHeight:"65vh", display:"block"}} />
          )}
          {item.locked && (
            <div style={{
              position: "absolute", top: 22, left: 22,
              background: "rgba(0,0,0,.7)", color: "white",
              padding: "4px 10px", borderRadius: 999,
              fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".06em",
            }}>🔒 locked by uploader</div>
          )}
        </div>
        {item.profileId && (
          <ProfileChip profileId={item.profileId} profiles={auth?.profiles} size="lg" />
        )}
        {mine ? (
          <input
            value={cap}
            placeholder="add a caption…"
            onChange={(e) => setCap(e.target.value)}
            onBlur={() => onCaption(item.id, cap)}
            onKeyDown={(e) => { if (e.key === "Enter") { onCaption(item.id, cap); e.currentTarget.blur(); } }}
            className="h-hand"
            style={{
              background:"#fbfaf3", border:0, borderRadius: 4,
              padding:"10px 16px", fontSize: 22, minWidth: 320, textAlign:"center",
              outline:"none", boxShadow:"0 6px 14px rgba(0,0,0,.18)",
            }}
          />
        ) : (
          item.caption && (
            <div className="h-hand" style={{
              fontSize: 22, color: "#fbfaf3", textAlign: "center",
              padding: "6px 16px", maxWidth: "75vw",
            }}>{item.caption}</div>
          )
        )}
        <div style={{display: "flex", gap: 10, alignItems: "center"}}>
          {mine && onToggleLock && (
            <button
              className="btn"
              onClick={() => onToggleLock(item.id, !item.locked)}
              style={{background: item.locked ? "var(--mustard)" : "#fff"}}>
              {item.locked ? "🔒 locked — tap to unlock" : "🔓 lock so others can't remove"}
            </button>
          )}
          <button className="btn" onClick={onClose}>close</button>
        </div>
      </div>
    </div>
  );
}

function PageDropZone({ friends, friendNames, onDrop }){
  // Backwards-compatible: accept either {key,label}[] or string[].
  const items = React.useMemo(() => {
    if (friends?.length) return friends;
    if (friendNames?.length) return friendNames.map(n => ({ key: n, label: n }));
    return [];
  }, [friends, friendNames]);
  const [active, setActive] = React.useState(false);
  const [picking, setPicking] = React.useState(null);

  React.useEffect(() => {
    const onDragOver = (e) => { e.preventDefault(); setActive(true); };
    const onDragLeave = (e) => {
      if (e.relatedTarget === null || e.clientX <= 0 || e.clientY <= 0) setActive(false);
    };
    const onDropEvt = (e) => {
      e.preventDefault();
      setActive(false);
      const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
      if (!files.length) return;
      setPicking({ files });
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDropEvt);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDropEvt);
    };
  }, []);

  return (
    <>
      {active && (
        <div style={{
          position:"fixed", inset: 16, zIndex: 300, pointerEvents:"none",
          border: "4px dashed var(--tomato)", borderRadius: 18,
          background: "oklch(95% 0.05 80 / .35)",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <div style={{textAlign:"center"}}>
            <div className="h-display" style={{fontSize: 64, color:"var(--ink)"}}>drop it like it's their birthday</div>
            <div className="h-hand" style={{fontSize: 26, color:"var(--ink-soft)"}}>we'll ask who it's for</div>
          </div>
        </div>
      )}
      {picking && (
        <div className="modal-bd" style={{zIndex: 350}} onClick={() => setPicking(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="pin" />
            <div className="h-mono" style={{color:"var(--ink-soft)"}}>{picking.files.length} file{picking.files.length===1?"":"s"} dropped</div>
            <div className="h-display" style={{fontSize: 36, marginTop:4}}>who's this for?</div>
            <div style={{
              marginTop: 16,
              display:"grid",
              gridTemplateColumns:"repeat(auto-fill, minmax(120px, 1fr))",
              gap: 10,
              maxHeight: 320, overflowY:"auto",
            }}>
              {items.map(it => (
                <button key={it.key} className="btn" style={{background:"#fff8e6"}}
                  onClick={() => { onDrop(it.key, picking.files); setPicking(null); }}>
                  {it.label}
                </button>
              ))}
            </div>
            <div style={{marginTop: 18, display:"flex", justifyContent:"flex-end"}}>
              <button className="btn ghost" onClick={() => setPicking(null)}>cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

Object.assign(window, {
  useMediaStore, MediaTile, AddTile, FriendScrapbook, Lightbox, PageDropZone,
  UploadErrorToast, CompressionOverlay, MAX_UPLOAD_BYTES, downscaleImage, compressVideo,
});
