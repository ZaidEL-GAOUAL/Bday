/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_ratelimit from "../lib/ratelimit.js";
import type * as lib_signing from "../lib/signing.js";
import type * as media from "../media.js";
import type * as migrate from "../migrate.js";
import type * as profiles from "../profiles.js";
import type * as serve from "../serve.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  groups: typeof groups;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/ratelimit": typeof lib_ratelimit;
  "lib/signing": typeof lib_signing;
  media: typeof media;
  migrate: typeof migrate;
  profiles: typeof profiles;
  serve: typeof serve;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
