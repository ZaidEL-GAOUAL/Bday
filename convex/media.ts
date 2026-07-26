// media.ts — the photo/video scrapbook.
//
// Replaces public.media + its RLS policies + the per-friend cap trigger.
//
// Upload flow (Convex's standard three-step):
//   1. client calls generateUploadUrl()
//   2. client POSTs the file straight to that URL, gets back a storageId
//   3. client calls add({ storageId, ... }) to record the row
// Step 3 re-reads the real file size from storage metadata, so a client can't
// lie its way past the size cap.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMember, requireProfile, requireInGroup } from "./lib/access";
import { signMediaToken } from "./lib/signing";

const MAX_PER_FRIEND = 10;
const MEDIA_URL_TTL = 60 * 60 * 1000; // 1 hour

// NOTE: this is deliberately below the old 30 MB client cap. Convex HTTP
// actions cannot return a response larger than 20 MB, and every file is served
// through one so that access stays revocable. Anything bigger simply could not
// be played back. The client compresses video to 1080p/CRF 28 before upload,
// which lands well under this in practice.
const MAX_UPLOAD_BYTES = 19 * 1024 * 1024;

/**
 * All media in the caller's group, newest first, with signed playback URLs.
 * `urlWindow` is a 15-minute bucket — see the note in profiles.list.
 */
export const list = query({
  args: { urlWindow: v.number() },
  handler: async (ctx, { urlWindow }) => {
    const { groupId } = await requireMember(ctx);

    const rows = await ctx.db
      .query("media")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();

    rows.sort((a, b) => b.addedAt - a.addedAt);
    const expiresAt = urlWindow * 900_000 + MEDIA_URL_TTL;

    return await Promise.all(
      rows.map(async (m) => ({
        id: m._id,
        friend: m.friend,
        kind: m.kind,
        type: m.contentType,
        name: m.name,
        caption: m.caption,
        author: m.author,
        profileId: m.profileId,
        locked: m.locked,
        addedAt: m.addedAt,
        url: `/file?kind=media&id=${m._id}&token=${await signMediaToken(m._id, expiresAt)}`,
      })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const add = mutation({
  args: {
    storageId: v.id("_storage"),
    friend: v.string(),
    kind: v.union(v.literal("image"), v.literal("video")),
    contentType: v.string(),
    name: v.string(),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { groupId, profile } = await requireProfile(ctx);

    // Roll back the orphaned upload on any rejection below, so a refused
    // insert never leaves a paid-for blob behind.
    const reject = async (message: string): Promise<never> => {
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        // Best effort.
      }
      throw new Error(message);
    };

    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) return await reject("upload didn't land — try again");
    if (meta.size > MAX_UPLOAD_BYTES) {
      return await reject(
        `that file is ${(meta.size / 1024 / 1024).toFixed(1)} MB — cap is ${Math.round(
          MAX_UPLOAD_BYTES / 1024 / 1024,
        )} MB. Try a shorter clip.`,
      );
    }

    // The friend key must name a real profile in this group, otherwise the
    // upload would vanish from the wall (no card would ever query for it).
    const friends = await ctx.db
      .query("profiles")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();
    const known = friends.some(
      (p) => p.friendKey === args.friend || p._id === args.friend,
    );
    if (!known) return await reject("unknown friend");

    const existing = await ctx.db
      .query("media")
      .withIndex("by_group_friend", (q) =>
        q.eq("groupId", groupId).eq("friend", args.friend),
      )
      .collect();
    if (existing.length >= MAX_PER_FRIEND) {
      return await reject(
        `this friend already has ${MAX_PER_FRIEND} memories — remove one to add more.`,
      );
    }

    return await ctx.db.insert("media", {
      groupId,
      friend: args.friend,
      profileId: profile._id,
      kind: args.kind,
      contentType: args.contentType,
      name: args.name.slice(0, 200),
      caption: (args.caption ?? "").slice(0, 300),
      author: profile.displayName,
      locked: false,
      storageId: args.storageId,
      size: meta.size,
      addedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("media") },
  handler: async (ctx, { id }) => {
    const { groupId, profile } = await requireProfile(ctx);
    const doc = await requireInGroup(ctx, "media", id, groupId);

    // Locked memories can only be removed by whoever posted them.
    if (doc.locked && doc.profileId !== profile._id) {
      throw new Error("that one's locked by the person who posted it");
    }

    await ctx.db.delete(id);
    try {
      await ctx.storage.delete(doc.storageId);
    } catch {
      // Row is gone either way; a stray blob is not worth failing the call.
    }
    return "ok";
  },
});

export const setCaption = mutation({
  args: { id: v.id("media"), caption: v.string() },
  handler: async (ctx, { id, caption }) => {
    const { groupId } = await requireMember(ctx);
    await requireInGroup(ctx, "media", id, groupId);
    await ctx.db.patch(id, { caption: caption.slice(0, 300) });
    return "ok";
  },
});

export const setLocked = mutation({
  args: { id: v.id("media"), locked: v.boolean() },
  handler: async (ctx, { id, locked }) => {
    const { groupId, profile } = await requireProfile(ctx);
    const doc = await requireInGroup(ctx, "media", id, groupId);
    if (doc.profileId !== profile._id) {
      throw new Error("only the person who posted it can lock it");
    }
    await ctx.db.patch(id, { locked });
    return "ok";
  },
});
