// access.ts — authorization helpers.
//
// This file replaces every RLS policy from the Supabase setup. Instead of SQL
// predicates reading JWT claims, each function calls one of these guards up
// front and gets back the caller's group + profile. If a guard throws, the
// mutation never ran — Convex rolls the whole transaction back.
//
// Rule of thumb: no function that touches group data should call ctx.db
// directly without going through requireMember() or requireProfile() first.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

export type Identity = { subject: string; email?: string; name?: string };

/** Signed in with Clerk. Throws otherwise. */
export async function requireUser(ctx: Ctx): Promise<Identity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("not signed in");
  return {
    subject: identity.subject,
    email: identity.email ?? undefined,
    name: identity.name ?? undefined,
  };
}

export async function getMembership(ctx: Ctx, userId: string) {
  return await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

/** Signed in AND has unlocked a group with the passcode. */
export async function requireMember(
  ctx: Ctx,
): Promise<{ identity: Identity; groupId: Id<"groups"> }> {
  const identity = await requireUser(ctx);
  const membership = await getMembership(ctx, identity.subject);
  if (!membership) throw new Error("not in a group");
  return { identity, groupId: membership.groupId };
}

/** Signed in, in a group, AND has claimed a profile. Required for any write. */
export async function requireProfile(ctx: Ctx): Promise<{
  identity: Identity;
  groupId: Id<"groups">;
  profile: Doc<"profiles">;
}> {
  const { identity, groupId } = await requireMember(ctx);
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_group_claimedBy", (q) =>
      q.eq("groupId", groupId).eq("claimedBy", identity.subject),
    )
    .first();
  if (!profile) throw new Error("no profile claimed");
  return { identity, groupId, profile };
}

/**
 * Loads a document and asserts it belongs to the caller's group. Every
 * by-id lookup must go through this — otherwise someone in group A could pass
 * an id from group B and read or mutate it.
 */
export async function requireInGroup<T extends "media" | "profiles">(
  ctx: Ctx,
  table: T,
  id: Id<T>,
  groupId: Id<"groups">,
): Promise<Doc<T>> {
  const doc = await ctx.db.get(id);
  if (!doc) throw new Error(`${table} not found`);
  if ((doc as Doc<T> & { groupId: Id<"groups"> }).groupId !== groupId) {
    throw new Error("not in your group");
  }
  return doc as Doc<T>;
}
