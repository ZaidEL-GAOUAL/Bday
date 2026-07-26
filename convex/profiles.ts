// profiles.ts — the friend list, profile claiming, and profile editing.
//
// Replaces the `pick-profile` Edge Function, the `set_friend_memory` RPC, and
// the owner-only RLS policies on public.profiles.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMember, requireProfile, requireInGroup } from "./lib/access";
import { signMediaToken } from "./lib/signing";

const AVATAR_URL_TTL = 60 * 60 * 1000; // 1 hour, matching the old signed URLs

/**
 * Every profile in the caller's group.
 *
 * `urlWindow` should be Math.floor(Date.now() / 900_000) — a 15-minute bucket.
 * Passing a raw timestamp would bust Convex's query cache on every call and
 * defeat reactivity; bucketing keeps the result stable between windows while
 * still rotating avatar URLs. See docs: "Don't use Date.now() in queries".
 */
export const list = query({
  args: { urlWindow: v.number() },
  handler: async (ctx, { urlWindow }) => {
    const { groupId, identity } = await requireMember(ctx);

    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();

    const expiresAt = urlWindow * 900_000 + AVATAR_URL_TTL;

    return await Promise.all(
      profiles.map(async (p) => ({
        id: p._id,
        friendKey: p.friendKey ?? null,
        displayName: p.displayName,
        initials: p.initials ?? null,
        color: p.color ?? null,
        emoji: p.emoji ?? null,
        vibe: p.vibe ?? null,
        memory: p.memory ?? null,
        birthdayMonth: p.birthdayMonth ?? null,
        birthdayDay: p.birthdayDay ?? null,
        custom: p.custom,
        claimed: !!p.claimedBy,
        claimedEmail: p.claimedEmail ?? null,
        isMine: p.claimedBy === identity.subject,
        avatarUrl: p.avatarId
          ? `/file?kind=avatar&id=${p._id}&token=${await signMediaToken(p._id, expiresAt)}`
          : null,
      })),
    );
  },
});

/**
 * Claim an existing profile, or create a custom one and claim it.
 * One Clerk account gets exactly one profile per group, forever — the same
 * invariant the unique (group_id, claimed_by) index enforced.
 */
export const claim = mutation({
  args: {
    profileId: v.optional(v.id("profiles")),
    displayName: v.optional(v.string()),
    birthdayMonth: v.optional(v.number()),
    birthdayDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { identity, groupId } = await requireMember(ctx);

    const already = await ctx.db
      .query("profiles")
      .withIndex("by_group_claimedBy", (q) =>
        q.eq("groupId", groupId).eq("claimedBy", identity.subject),
      )
      .first();
    if (already) return already._id; // idempotent — routes you to your profile

    if (args.profileId) {
      const target = await requireInGroup(ctx, "profiles", args.profileId, groupId);
      if (target.claimedBy) throw new Error("someone already claimed that one");
      await ctx.db.patch(target._id, {
        claimedBy: identity.subject,
        claimedEmail: identity.email,
      });
      return target._id;
    }

    const name = (args.displayName ?? "").trim().slice(0, 60);
    if (!name) throw new Error("pick a profile or enter a name");

    return await ctx.db.insert("profiles", {
      groupId,
      displayName: name,
      initials: initialsFor(name),
      custom: true,
      claimedBy: identity.subject,
      claimedEmail: identity.email,
      birthdayMonth: args.birthdayMonth,
      birthdayDay: args.birthdayDay,
    });
  },
});

/** Edit your own profile. Field whitelist mirrors the old updateProfile(). */
export const update = mutation({
  args: {
    displayName: v.optional(v.string()),
    color: v.optional(v.string()),
    emoji: v.optional(v.string()),
    vibe: v.optional(v.union(v.string(), v.null())),
    birthdayMonth: v.optional(v.union(v.number(), v.null())),
    birthdayDay: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    const patch: Record<string, unknown> = {};

    if (args.displayName !== undefined) {
      const n = args.displayName.trim().slice(0, 60);
      if (!n) throw new Error("name can't be empty");
      patch.displayName = n;
      patch.initials = initialsFor(n);
    }
    if (args.color !== undefined) patch.color = args.color.slice(0, 60);
    if (args.emoji !== undefined) patch.emoji = args.emoji.slice(0, 8);
    if (args.vibe !== undefined) {
      patch.vibe = args.vibe ? args.vibe.trim().slice(0, 200) || undefined : undefined;
    }
    if (args.birthdayMonth !== undefined) {
      patch.birthdayMonth = validRange(args.birthdayMonth, 1, 12, "month");
    }
    if (args.birthdayDay !== undefined) {
      patch.birthdayDay = validRange(args.birthdayDay, 1, 31, "day");
    }

    if (Object.keys(patch).length) await ctx.db.patch(profile._id, patch);
    return profile._id;
  },
});

/**
 * The "remember when…" line. Deliberately writable by *any* group member, not
 * just the profile owner — that's what set_friend_memory did, and it's half
 * the fun.
 */
export const setMemory = mutation({
  args: { profileId: v.id("profiles"), memory: v.string() },
  handler: async (ctx, { profileId, memory }) => {
    const { groupId } = await requireMember(ctx);
    await requireInGroup(ctx, "profiles", profileId, groupId);
    const trimmed = memory.trim().slice(0, 300);
    await ctx.db.patch(profileId, { memory: trimmed || undefined });
    return "ok";
  },
});

export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const clearAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    if (profile.avatarId) {
      try {
        await ctx.storage.delete(profile.avatarId);
      } catch {
        // Already gone.
      }
    }
    await ctx.db.patch(profile._id, { avatarId: undefined });
    return "ok";
  },
});

export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const { profile } = await requireProfile(ctx);
    if (profile.avatarId) {
      try {
        await ctx.storage.delete(profile.avatarId);
      } catch {
        // Already gone — nothing to clean up.
      }
    }
    await ctx.db.patch(profile._id, { avatarId: storageId });
    return "ok";
  },
});

function initialsFor(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase() || name.slice(0, 2).toUpperCase()
  );
}

function validRange(
  value: number | null,
  min: number,
  max: number,
  label: string,
): number | undefined {
  if (value === null) return undefined;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`invalid birthday ${label}`);
  }
  return value;
}
