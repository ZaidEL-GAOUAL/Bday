// ratelimit.ts — brute-force throttle for passcode entry.
//
// Both passcode entry points are open to the internet and this repo is public,
// so the scheme is not a secret. PBKDF2 makes each guess expensive; this makes
// the number of guesses finite.
//
// Deliberately fail-closed: if the counter can't be read we'd rather reject
// than wave someone through.

import type { MutationCtx } from "../_generated/server";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

/** Throws if `key` has burned through its failure budget for this window. */
export async function assertNotRateLimited(
  ctx: MutationCtx,
  key: string,
): Promise<void> {
  const row = await ctx.db
    .query("authAttempts")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (!row) return;

  const elapsed = Date.now() - row.windowStart;
  if (elapsed > WINDOW_MS) return; // stale window, treated as fresh
  if (row.failures >= MAX_FAILURES) {
    const mins = Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 60_000));
    throw new Error(`too many attempts — try again in ${mins} min`);
  }
}

export async function recordFailure(ctx: MutationCtx, key: string): Promise<void> {
  const row = await ctx.db
    .query("authAttempts")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  const now = Date.now();

  if (!row) {
    await ctx.db.insert("authAttempts", { key, windowStart: now, failures: 1 });
    return;
  }
  if (now - row.windowStart > WINDOW_MS) {
    await ctx.db.patch(row._id, { windowStart: now, failures: 1 });
    return;
  }
  await ctx.db.patch(row._id, { failures: row.failures + 1 });
}

/** Called after a success so a legitimate user isn't punished for typos. */
export async function clearFailures(ctx: MutationCtx, key: string): Promise<void> {
  const row = await ctx.db
    .query("authAttempts")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (row) await ctx.db.delete(row._id);
}
