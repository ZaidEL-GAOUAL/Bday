// groups.ts — passcode unlock + the client's bootstrap query.
//
// Replaces the `unlock` and `link-group` Edge Functions. The old two-step
// token dance existed because the passcode was checked before the user had a
// session; with Clerk they're already authenticated, so `join` verifies the
// passcode and writes the membership in a single transaction.

import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, getMembership } from "./lib/access";
import { derivePasscodeHash, randomSaltHex, verifyPasscode } from "./lib/signing";
import { assertNotRateLimited, recordFailure, clearFailures } from "./lib/ratelimit";

/**
 * Everything the client needs to decide which screen to show, in one
 * reactive query. Never throws — an unauthenticated caller just gets
 * `signedIn: false` so the login screen can render.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { signedIn: false, group: null, profile: null } as const;
    }

    const membership = await getMembership(ctx, identity.subject);
    if (!membership) {
      return {
        signedIn: true,
        email: identity.email ?? null,
        group: null,
        profile: null,
      } as const;
    }

    const group = await ctx.db.get(membership.groupId);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_group_claimedBy", (q) =>
        q.eq("groupId", membership.groupId).eq("claimedBy", identity.subject),
      )
      .first();

    return {
      signedIn: true,
      email: identity.email ?? null,
      group: group
        ? { id: group._id, slug: group.slug, name: group.name }
        : null,
      profile: profile ? { id: profile._id, displayName: profile.displayName } : null,
    } as const;
  },
});

/**
 * "Use the same gmail, we'll find you" — no passcode required.
 *
 * Anyone who had already claimed a profile carries their email on it (brought
 * over from Supabase, where claimed_by was a user id that means nothing to
 * Clerk). Matching on the email lets every existing member keep their profile
 * and skip setup entirely.
 *
 * Access is granted on three conditions, all required:
 *   - Google asserted the address and Clerk marked it verified
 *   - a profile in that group is already reserved for exactly that address
 *   - nobody has claimed it under Clerk yet
 *
 * So this can only ever re-admit someone who was demonstrably already a
 * member. A stranger's Google account matches nothing and gets nowhere.
 */
export const autoJoinByEmail = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) return { joined: false as const };
    // Unverified addresses are not proof of anything.
    if (identity.emailVerified === false) return { joined: false as const };

    if (await getMembership(ctx, identity.subject)) {
      return { joined: false as const, already: true };
    }

    const email = identity.email.trim().toLowerCase();
    const reserved = (await ctx.db.query("profiles").collect()).find(
      (p) => !p.claimedBy && (p.claimedEmail ?? "").trim().toLowerCase() === email,
    );
    if (!reserved) return { joined: false as const };

    await ctx.db.insert("memberships", {
      userId: identity.subject,
      groupId: reserved.groupId,
      joinedAt: Date.now(),
    });
    await ctx.db.patch(reserved._id, { claimedBy: identity.subject });

    return { joined: true as const, profileId: reserved._id };
  },
});

/**
 * Redeem a passcode to join its group. Idempotent: re-submitting the same
 * passcode when already a member is a no-op rather than an error.
 */
export const join = mutation({
  args: { passcode: v.string() },
  handler: async (ctx, { passcode }) => {
    const identity = await requireUser(ctx);

    // Throttled per Clerk account. Requiring sign-in first is itself most of
    // the defence — an attacker needs a fresh Google account per 8 guesses.
    const rlKey = `join:${identity.subject}`;
    await assertNotRateLimited(ctx, rlKey);

    // Each group carries its own salt, so we verify against every row rather
    // than hashing once and looking it up. The table holds a handful of rows.
    const groups = await ctx.db.query("groups").collect();
    let group = null;
    for (const g of groups) {
      if (await verifyPasscode(passcode.trim(), g.passcodeSalt, g.passcodeHash)) {
        group = g;
        break;
      }
    }
    if (!group) {
      await recordFailure(ctx, rlKey);
      throw new Error("that passcode doesn't match any wall");
    }
    await clearFailures(ctx, rlKey);

    const existing = await getMembership(ctx, identity.subject);
    if (existing) {
      if (existing.groupId === group._id) return { groupId: group._id, slug: group.slug };
      throw new Error("you're already in a different wall — sign out to switch");
    }

    await ctx.db.insert("memberships", {
      userId: identity.subject,
      groupId: group._id,
      joinedAt: Date.now(),
    });

    return { groupId: group._id, slug: group.slug };
  },
});

// ---------------------------------------------------------------------------
// Admin-only. Internal, so these are reachable from `npx convex run` (which
// authenticates with your deploy key) but never from the browser.
// ---------------------------------------------------------------------------

/** npx convex run groups:createGroup '{"slug":"bday","name":"The Wall","passcode":"..."}' */
export const createGroup = internalMutation({
  args: {
    slug: v.string(),
    name: v.string(),
    passcode: v.string(),
    legacyId: v.optional(v.string()),
  },
  handler: async (ctx, { slug, name, passcode, legacyId }) => {
    const existing = await ctx.db
      .query("groups")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    const passcodeSalt = randomSaltHex();
    const passcodeHash = await derivePasscodeHash(passcode.trim(), passcodeSalt);
    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        passcodeHash,
        passcodeSalt,
        legacyId,
      });
      return existing._id;
    }
    return await ctx.db.insert("groups", {
      slug,
      name,
      passcodeHash,
      passcodeSalt,
      legacyId,
    });
  },
});

/** npx convex run groups:setPasscode '{"slug":"bday","passcode":"..."}' */
export const setPasscode = internalMutation({
  args: { slug: v.string(), passcode: v.string() },
  handler: async (ctx, { slug, passcode }) => {
    const group = await ctx.db
      .query("groups")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!group) throw new Error(`no group with slug "${slug}"`);
    const passcodeSalt = randomSaltHex();
    await ctx.db.patch(group._id, {
      passcodeSalt,
      passcodeHash: await derivePasscodeHash(passcode.trim(), passcodeSalt),
    });
    return "ok";
  },
});
