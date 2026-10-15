import { db } from "@/db";
import { registerSchema } from "@/validators";
import { rateLimit } from "@/lib/auth/rate-limit";
import { signedRoute } from "@/lib/auth/signed-route";

// Registration is signed with the same v2 envelope as every other mutation; the signer is the
// `pubkey` inside the body (no session exists yet). A replayed old registration is rejected by the
// unique nonce, so it can no longer revert a username.
export const POST = signedRoute({
  schema: registerSchema,
  signer: "body-pubkey",
  handler: async ({ req, payload }) => {
    const { pubkey, username } = payload;

    // Throttle account-creation spam (best-effort; in-memory like the rest of the rate limiter).
    // Prefer the client IP, but fall back to the request's pubkey when no proxy sets the header —
    // otherwise every client would collapse into one shared "unknown" bucket and a handful of
    // requests would lock out registration platform-wide (self-DoS).
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "";
    const limitKey = ip ? `register:ip:${ip}` : `register:pk:${pubkey}`;
    if (!rateLimit(limitKey, 5, 60_000)) {
      return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    try {
      const saved = await db.account.upsert({
        where: { pubkey },
        create: { pubkey, username },
        update: { username },
      });

      return Response.json(saved);
    } catch (error) {
      console.error("[register] account upsert failed", error);
      return Response.json({ error: "Database error" }, { status: 500 });
    }
  },
});
