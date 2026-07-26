// migrate.ts — one-shot import of the Supabase data.
//
// Runs inside Convex rather than as a local script, so it can stream blobs
// straight into ctx.storage without a round trip through your laptop.
//
//   npx convex env set SUPABASE_URL https://adgqourcxbjkupdrqpyt.supabase.co
//   npx convex env set SUPABASE_SERVICE_KEY <service_role key>
//   npx convex run migrate:run '{"dryRun":true}'     # inspect first
//   npx convex run migrate:run '{}'                  # for real
//
// Idempotent: every row carries its old UUID in `legacyId`, so re-running
// updates in place instead of duplicating. Safe to run twice if it half-fails.
//
// NOT migrated, on purpose:
//   * passcode hashes — the old Edge Function's algorithm is unknown, so set
//     the passcode fresh with `groups:createGroup`.
//   * profiles.claimed_by — those are Supabase auth user IDs and mean nothing
//     to Clerk. Every friend re-claims their profile once on first sign-in.

import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const BUCKET = "bday-media";

type SupabaseProfile = {
  id: string;
  group_id: string;
  friend_key: string | null;
  display_name: string;
  initials: string | null;
  color: string | null;
  emoji: string | null;
  vibe: string | null;
  memory: string | null;
  birthday_month: number | null;
  birthday_day: number | null;
  custom: boolean | null;
  avatar_path: string | null;
  // The bridge between the two identity systems. Supabase auth user ids are
  // meaningless to Clerk, but the email is the same person either way, so
  // this is what lets everyone keep their profile without re-claiming it.
  // NB: the column is `email`, not `claimed_email`.
  email: string | null;
};

type SupabaseMedia = {
  id: string;
  group_id: string;
  profile_id: string | null;
  friend: string;
  kind: string;
  type: string | null;
  name: string | null;
  path: string;
  caption: string | null;
  author: string | null;
  locked: boolean | null;
  added_at: string | null;
};

/**
 * Diagnostic: dump the real column names and claim state from Supabase.
 * Read-only — used to work out why claimed_email came back empty.
 */
export const inspect = internalAction({
  args: {},
  handler: async () => {
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!base || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY not set");

    const res = await fetch(`${base}/rest/v1/profiles?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const rows = (await res.json()) as Record<string, unknown>[];
    if (!Array.isArray(rows) || !rows.length) return ["no rows", JSON.stringify(rows)];

    const columns = Object.keys(rows[0]);
    const claimish = columns.filter((c) => /claim|email|user|owner/i.test(c));
    const summary = rows.map((r) => {
      const bits = claimish.map((c) => `${c}=${JSON.stringify(r[c])}`).join(" ");
      return `${r.display_name}: ${bits}`;
    });
    return [`columns: ${columns.join(", ")}`, ...summary];
  },
});

export const run = internalAction({
  args: { dryRun: v.optional(v.boolean()), groupSlug: v.optional(v.string()) },
  handler: async (ctx, { dryRun = false, groupSlug = "bday" }) => {
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!base || !key) {
      throw new Error(
        "Set SUPABASE_URL and SUPABASE_SERVICE_KEY with `npx convex env set` first.",
      );
    }

    const rest = async <T>(path: string): Promise<T[]> => {
      const res = await fetch(`${base}/rest/v1/${path}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new Error(`${path} → HTTP ${res.status} ${await res.text()}`);
      return (await res.json()) as T[];
    };

    const profiles = await rest<SupabaseProfile>("profiles?select=*");
    const media = await rest<SupabaseMedia>("media?select=*");
    const log: string[] = [
      `found ${profiles.length} profiles, ${media.length} media rows`,
    ];

    if (dryRun) {
      log.push("dry run — nothing written");
      log.push(
        `media over the 19 MB serving cap will be skipped; checking requires download, so run for real to see`,
      );
      return log;
    }

    const groupId = await ctx.runMutation(internal.migrate.resolveGroup, { groupSlug });

    // ---- profiles ----------------------------------------------------------
    // legacy uuid -> new Convex id, needed to rewrite media.friend/profile_id.
    const profileMap: Record<string, Id<"profiles">> = {};

    for (const p of profiles) {
      let avatarId: Id<"_storage"> | undefined;
      if (p.avatar_path) {
        avatarId = (await download(base, key, p.avatar_path, ctx)) ?? undefined;
      }
      const newId = await ctx.runMutation(internal.migrate.upsertProfile, {
        groupId,
        legacyId: p.id,
        friendKey: p.friend_key ?? undefined,
        displayName: p.display_name,
        initials: p.initials ?? undefined,
        color: p.color ?? undefined,
        emoji: p.emoji ?? undefined,
        vibe: p.vibe ?? undefined,
        memory: p.memory ?? undefined,
        birthdayMonth: p.birthday_month ?? undefined,
        birthdayDay: p.birthday_day ?? undefined,
        custom: !!p.custom,
        claimedEmail: p.email ?? undefined,
        avatarId,
      });
      profileMap[p.id] = newId;
    }
    log.push(`imported ${Object.keys(profileMap).length} profiles`);

    // ---- media -------------------------------------------------------------
    let ok = 0;
    const skipped: string[] = [];

    for (const m of media) {
      const blobId = await download(base, key, m.path, ctx);
      if (!blobId) {
        skipped.push(`${m.name ?? m.id} (download failed)`);
        continue;
      }
      // Custom profiles are referenced by their uuid in `friend`; seeded ones
      // by friend_key. Remap the former, leave the latter alone.
      const friend = profileMap[m.friend] ?? m.friend;
      const profileId = m.profile_id ? profileMap[m.profile_id] : undefined;
      if (!profileId) {
        skipped.push(`${m.name ?? m.id} (no owning profile)`);
        continue;
      }

      await ctx.runMutation(internal.migrate.upsertMedia, {
        groupId,
        legacyId: m.id,
        friend: String(friend),
        profileId,
        kind: m.kind === "video" ? "video" : "image",
        contentType: m.type ?? "application/octet-stream",
        name: m.name ?? "memory",
        caption: m.caption ?? "",
        author: m.author ?? "",
        locked: !!m.locked,
        storageId: blobId,
        addedAt: m.added_at ? new Date(m.added_at).getTime() : Date.now(),
      });
      ok++;
    }

    log.push(`imported ${ok} media files`);
    if (skipped.length) log.push(`skipped ${skipped.length}: ${skipped.join(", ")}`);
    return log;
  },
});

/** Pull one object out of the private Supabase bucket and into Convex storage. */
async function download(
  base: string,
  key: string,
  path: string,
  ctx: { storage: { store: (b: Blob) => Promise<Id<"_storage">> } },
): Promise<Id<"_storage"> | null> {
  try {
    const res = await fetch(
      `${base}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return null;
    return await ctx.storage.store(await res.blob());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mutations the action calls. Internal — not reachable from the browser.
// ---------------------------------------------------------------------------

export const resolveGroup = internalMutation({
  args: { groupSlug: v.string() },
  handler: async (ctx, { groupSlug }) => {
    const group = await ctx.db
      .query("groups")
      .withIndex("by_slug", (q) => q.eq("slug", groupSlug))
      .first();
    if (!group) {
      throw new Error(
        `No group "${groupSlug}" yet. Create it first:\n` +
          `  npx convex run groups:createGroup '{"slug":"${groupSlug}","name":"The Birthday Wall","passcode":"..."}'`,
      );
    }
    return group._id;
  },
});

export const upsertProfile = internalMutation({
  args: {
    groupId: v.id("groups"),
    legacyId: v.string(),
    friendKey: v.optional(v.string()),
    displayName: v.string(),
    initials: v.optional(v.string()),
    color: v.optional(v.string()),
    emoji: v.optional(v.string()),
    vibe: v.optional(v.string()),
    memory: v.optional(v.string()),
    birthdayMonth: v.optional(v.number()),
    birthdayDay: v.optional(v.number()),
    custom: v.boolean(),
    claimedEmail: v.optional(v.string()),
    avatarId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_legacy", (q) => q.eq("legacyId", args.legacyId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("profiles", args);
  },
});

export const upsertMedia = internalMutation({
  args: {
    groupId: v.id("groups"),
    legacyId: v.string(),
    friend: v.string(),
    profileId: v.id("profiles"),
    kind: v.union(v.literal("image"), v.literal("video")),
    contentType: v.string(),
    name: v.string(),
    caption: v.string(),
    author: v.string(),
    locked: v.boolean(),
    storageId: v.id("_storage"),
    addedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("media")
      .withIndex("by_legacy", (q) => q.eq("legacyId", args.legacyId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("media", args);
  },
});
