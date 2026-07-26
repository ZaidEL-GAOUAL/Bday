// http.ts — the two endpoints that aren't regular Convex function calls.
//
//   GET  /file        signed, time-limited photo/video/avatar serving
//   POST /widget-data passcode-authenticated birthday list for the Android widget
//
// Why /file exists at all: ctx.storage.getUrl() hands out a permanent,
// unrevocable public link. The Supabase setup used a private bucket with
// 1-hour signed URLs, so we keep that property by never exposing storage URLs
// and instead streaming bytes through this action, gated on an HMAC token.
//
// Hard limit to remember: an HTTP action response cannot exceed 20 MB, which
// is why convex/media.ts caps uploads at 19 MB.

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyMediaToken } from "./lib/signing";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

http.route({
  path: "/file",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const id = url.searchParams.get("id");
    const token = url.searchParams.get("token");

    if (!id || (kind !== "media" && kind !== "avatar")) {
      return new Response("bad request", { status: 400, headers: CORS });
    }

    // The token is bound to this exact id and carries its own expiry, so a
    // leaked link stops working on its own — the property Convex's native
    // file URLs don't have.
    if (!(await verifyMediaToken(id, token, Date.now()))) {
      return new Response("link expired", { status: 403, headers: CORS });
    }

    const row =
      kind === "media"
        ? await ctx.runQuery(internal.serve.mediaForServing, {
            id: id as Id<"media">,
          })
        : await ctx.runQuery(internal.serve.avatarForServing, {
            id: id as Id<"profiles">,
          });

    if (!row) return new Response("not found", { status: 404, headers: CORS });

    const blob = await ctx.storage.get(row.storageId);
    if (!blob) return new Response("not found", { status: 404, headers: CORS });

    return new Response(blob, {
      headers: {
        ...CORS,
        "Content-Type": row.contentType,
        // Cacheable for the life of the token but never by a shared proxy.
        "Cache-Control": "private, max-age=3600",
      },
    });
  }),
});

http.route({
  path: "/widget-data",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let passcode = "";
    try {
      passcode = ((await request.json()) as { passcode?: string }).passcode ?? "";
    } catch {
      return json({ error: "bad request" }, 400);
    }
    if (!passcode) return json({ error: "passcode required" }, 400);

    // Throttle key. No signed-in identity here, so fall back to the caller's
    // IP; "unknown" buckets everything Convex couldn't attribute, which
    // errs toward throttling too much rather than too little.
    const clientKey =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

    try {
      const data = await ctx.runMutation(internal.serve.widgetData, {
        passcode,
        clientKey,
      });
      if (!data) return json({ error: "wrong passcode" }, 403);
      return json(data, 200);
    } catch (e) {
      // assertNotRateLimited throws once the budget is gone.
      return json({ error: (e as Error).message }, 429);
    }
  }),
});

// Preflight for the widget's cross-origin POST.
http.route({
  path: "/widget-data",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export default http;
