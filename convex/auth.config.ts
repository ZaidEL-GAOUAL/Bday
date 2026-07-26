// auth.config.ts — Clerk as the OIDC provider.
//
// CLERK_JWT_ISSUER_DOMAIN must be set on the Convex deployment:
//   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
//
// It has to match the `iss` claim of the Clerk JWT exactly, and the
// applicationID has to match `aud`. Clerk's Convex JWT template uses the
// audience "convex" by default — if you renamed it, change it here too.

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
