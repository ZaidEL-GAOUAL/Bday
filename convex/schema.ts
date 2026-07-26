// schema.ts — the Birthday Wall data model.
//
// Ported from Supabase. Two structural changes worth knowing about:
//
//  1. `unlock_tokens` is gone. It only existed because Supabase Edge Functions
//     had to bridge an unauthenticated passcode check to an authenticated
//     session. With Clerk the user is already signed in when they submit the
//     passcode, so `groups.join` verifies and writes the membership in one
//     transaction.
//
//  2. `app_metadata.group_id` / `profile_id` JWT claims are gone. Group access
//     now lives in `memberships`, and profile ownership in `profiles.claimedBy`.
//     That removes the whole refreshSession() dance — no token has to be
//     reminted when someone joins a group or claims a profile.
//
// `legacyId` columns hold the old Supabase UUIDs so the migration script can
// wire up cross-table references, and so we can re-run it idempotently.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  groups: defineTable({
    slug: v.string(),
    name: v.string(),
    // PBKDF2-SHA256(passcode, salt, 100k iterations), hex. Set via
    // `groups:createGroup` / `groups:setPasscode` — never copied from
    // Supabase, since we don't know what the old Edge Function used.
    //
    // The iteration count matters because this repo is public: anyone can read
    // exactly how the passcode is checked, so the only real defence is making
    // each guess expensive. A group with no salt can't be joined at all.
    passcodeHash: v.string(),
    passcodeSalt: v.optional(v.string()),
    legacyId: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_legacy", ["legacyId"]),

  // Brute-force throttle for the two passcode entry points (groups.join and
  // the widget-data HTTP action). Both are reachable by anyone on the
  // internet and the source is public, so without this a script could just
  // walk the passcode space.
  authAttempts: defineTable({
    key: v.string(), // "join:<clerk subject>" | "widget:<ip>"
    windowStart: v.number(),
    failures: v.number(),
  }).index("by_key", ["key"]),

  // One row per (Clerk user, group). Replaces the app_metadata.group_id claim.
  memberships: defineTable({
    userId: v.string(), // Clerk identity.subject
    groupId: v.id("groups"),
    joinedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_group", ["groupId"])
    .index("by_user_group", ["userId", "groupId"]),

  profiles: defineTable({
    groupId: v.id("groups"),
    // Stable key for seeded friends ("Zaid"). Custom profiles have none and are
    // referenced by their document id instead.
    friendKey: v.optional(v.string()),
    displayName: v.string(),
    initials: v.optional(v.string()),
    color: v.optional(v.string()),
    emoji: v.optional(v.string()),
    vibe: v.optional(v.string()),
    // Editable by anyone in the group (was the set_friend_memory RPC, which
    // existed to bypass the owner-only RLS policy).
    memory: v.optional(v.string()),
    birthdayMonth: v.optional(v.number()),
    birthdayDay: v.optional(v.number()),
    custom: v.boolean(),
    // Clerk identity.subject of whoever claimed this profile. The
    // by_group_claimedBy index enforces one Gmail = one profile per group,
    // which the old unique (group_id, claimed_by) index did.
    claimedBy: v.optional(v.string()),
    claimedEmail: v.optional(v.string()),
    avatarId: v.optional(v.id("_storage")),
    legacyId: v.optional(v.string()),
  })
    .index("by_group", ["groupId"])
    .index("by_group_claimedBy", ["groupId", "claimedBy"])
    .index("by_group_friendKey", ["groupId", "friendKey"])
    .index("by_legacy", ["legacyId"]),

  media: defineTable({
    groupId: v.id("groups"),
    // Canonical friend key: friendKey for seeded profiles, profile id string
    // for custom ones. Same invariant the wall relies on today.
    friend: v.string(),
    profileId: v.id("profiles"),
    kind: v.union(v.literal("image"), v.literal("video")),
    contentType: v.string(),
    name: v.string(),
    caption: v.string(),
    author: v.string(),
    locked: v.boolean(),
    storageId: v.id("_storage"),
    size: v.optional(v.number()),
    // Preserved from the old added_at so migrated memories keep their order.
    addedAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_group", ["groupId"])
    .index("by_group_friend", ["groupId", "friend"])
    .index("by_legacy", ["legacyId"]),
});
