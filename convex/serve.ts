// serve.ts — internal queries backing the HTTP actions in http.ts.
//
// HTTP actions can't touch ctx.db directly, so they hop through these. All of
// them are internalQuery: unreachable from the browser, only callable from
// inside another Convex function.

import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyPasscode } from "./lib/signing";
import { assertNotRateLimited, recordFailure, clearFailures } from "./lib/ratelimit";

export const mediaForServing = internalQuery({
  args: { id: v.id("media") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (!doc) return null;
    return { storageId: doc.storageId, contentType: doc.contentType };
  },
});

export const avatarForServing = internalQuery({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (!doc?.avatarId) return null;
    return { storageId: doc.avatarId, contentType: "image/jpeg" };
  },
});

/**
 * Data for the Android home-screen widget. Authenticated by group passcode
 * rather than a Clerk session, because the widget has no browser to sign in
 * with — same contract the widget-data Edge Function had.
 *
 * Returns only birthdays and display info: no media, no emails, no claim info.
 * That deliberately keeps the weakest-authenticated endpoint the least
 * privileged one.
 *
 * A mutation rather than a query because it has to write throttle counters —
 * this is the one passcode entry point that doesn't require a signed-in user,
 * so it's the most exposed thing in the deployment.
 */
export const widgetData = internalMutation({
  args: { passcode: v.string(), clientKey: v.string() },
  handler: async (ctx, { passcode, clientKey }) => {
    const rlKey = `widget:${clientKey}`;
    await assertNotRateLimited(ctx, rlKey);

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
      return null;
    }
    await clearFailures(ctx, rlKey);

    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();

    return {
      group: { slug: group.slug, name: group.name },
      friends: profiles
        .filter((p) => p.birthdayMonth && p.birthdayDay)
        .map((p) => ({
          name: p.displayName,
          month: p.birthdayMonth,
          day: p.birthdayDay,
          color: p.color ?? null,
          emoji: p.emoji ?? null,
        })),
    };
  },
});
