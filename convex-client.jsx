// convex-client.jsx — Convex + Clerk bootstrap and the React bindings.
//
// This is the file that replaces window.sb. It exists because we deliberately
// have no bundler: the official convex/react package assumes imports, so we
// wire ConvexClient to React by hand. It's about 60 lines of actual logic.
//
// The big behavioural difference from the Supabase setup: useQuery here is a
// live subscription. Convex pushes new results whenever the underlying data
// changes, which is why all the .channel()/.subscribe() plumbing that used to
// live in auth.jsx and media.jsx is gone rather than ported.

const client = new convex.ConvexClient(window.CONVEX_URL);
window.cx = client;

/** HTTP actions live on .convex.site; queries return site-relative paths. */
function fileUrl(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : window.CONVEX_SITE_URL + path;
}

// ---------------------------------------------------------------------------
// Clerk -> Convex token bridge
// ---------------------------------------------------------------------------

// Convex calls this whenever it needs a token, including on its own refresh
// schedule. Returning null simply means "unauthenticated", which every query
// is written to tolerate.
async function fetchConvexToken({ forceRefreshToken } = {}) {
  try {
    const session = window.Clerk?.session;
    if (!session) return null;
    return await session.getToken({
      template: "convex",
      skipCache: !!forceRefreshToken,
    });
  } catch (_) {
    return null;
  }
}

let _clerkLoad = null;
function loadClerk() {
  if (!_clerkLoad) {
    _clerkLoad = window.Clerk.load({ afterSignOutUrl: window.location.href })
      .then(() => window.Clerk)
      .catch((e) => {
        _clerkLoad = null;
        throw e;
      });
  }
  return _clerkLoad;
}

/**
 * Clerk session state. Re-arms the Convex token fetcher whenever the session
 * actually changes — guarded on session id because Clerk's listener fires on
 * every resource update, and re-calling setAuth on each one would thrash the
 * websocket.
 */
function useClerkSession() {
  const [state, setState] = React.useState({
    loading: true,
    user: null,
    signedIn: false,
  });
  const lastSessionId = React.useRef(undefined);

  React.useEffect(() => {
    let alive = true;
    let unsub = null;

    loadClerk()
      .then((clerk) => {
        if (!alive) return;
        const sync = () => {
          if (!alive) return;
          const sessionId = clerk.session?.id ?? null;
          if (sessionId !== lastSessionId.current) {
            lastSessionId.current = sessionId;
            client.setAuth(fetchConvexToken);
          }
          setState({
            loading: false,
            user: clerk.user ?? null,
            signedIn: !!clerk.user,
          });
        };
        sync();
        unsub = clerk.addListener(sync);
      })
      .catch((e) => {
        console.warn("Clerk failed to load", e);
        if (alive) setState({ loading: false, user: null, signedIn: false });
      });

    return () => {
      alive = false;
      if (unsub) unsub();
    };
  }, []);

  return state;
}

// ---------------------------------------------------------------------------
// Query / mutation hooks
// ---------------------------------------------------------------------------

/**
 * Subscribe to a Convex query. Pass "skip" as args to stand down — used while
 * the user isn't signed in yet, so we don't fire queries that would only throw.
 * Returns { data, error, loading }.
 */
function useConvexQuery(name, args) {
  const [state, setState] = React.useState({ data: undefined, error: null });
  const skip = args === "skip";
  const key = skip ? "skip" : JSON.stringify(args ?? {});

  React.useEffect(() => {
    if (skip) {
      setState({ data: undefined, error: null });
      return;
    }
    let alive = true;
    const unsub = client.onUpdate(
      name,
      JSON.parse(key),
      (data) => alive && setState({ data, error: null }),
      (error) => alive && setState({ data: undefined, error }),
    );
    return () => {
      alive = false;
      try {
        unsub();
      } catch (_) {}
    };
  }, [name, key, skip]);

  return { ...state, loading: !skip && state.data === undefined && !state.error };
}

function useConvexMutation(name) {
  return React.useCallback((args) => client.mutation(name, args ?? {}), [name]);
}

/**
 * 15-minute bucket passed to queries that mint signed URLs.
 *
 * Convex caches query results by argument, so passing a raw Date.now() would
 * bust the cache on every render and defeat reactivity. Bucketing keeps the
 * result stable for 15 minutes while still rotating the 1-hour URLs well
 * before they expire.
 */
function useUrlWindow() {
  const [w, setW] = React.useState(() => Math.floor(Date.now() / 900_000));
  React.useEffect(() => {
    const t = setInterval(() => setW(Math.floor(Date.now() / 900_000)), 60_000);
    return () => clearInterval(t);
  }, []);
  return w;
}

/** Convex errors arrive prefixed with server frames; show only the message. */
function cleanError(e) {
  const raw = (e && (e.data || e.message)) || String(e || "");
  const m = String(raw).match(/Uncaught Error:\s*([^\n]+)/);
  return (m ? m[1] : String(raw)).replace(/\s*at handler.*$/s, "").trim();
}

Object.assign(window, {
  cx: client,
  fileUrl,
  loadClerk,
  useClerkSession,
  useConvexQuery,
  useConvexMutation,
  useUrlWindow,
  cleanError,
});
