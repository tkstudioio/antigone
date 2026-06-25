import { schnorr } from "@noble/curves/secp256k1.js";
import { hex } from "@scure/base";
import { ZodError } from "zod";
import { db } from "@/db";
import { toXOnly } from "@/lib/utils";
import { registerSchema } from "@/validators";
import { rateLimit } from "@/lib/auth/rate-limit";

export async function POST(request: Request) {
  let parsed: { pubkey: string; username: string; signature: string };

  try {
    const body = await request.json();
    parsed = registerSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      // Do not echo schema internals (error.issues) to unauthenticated callers.
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { pubkey, username, signature } = parsed;

  // Throttle account-creation spam (best-effort; in-memory like the rest of the rate limiter).
  // Prefer the client IP, but fall back to the request's pubkey when no proxy sets the header —
  // otherwise every client would collapse into one shared "unknown" bucket and a handful of
  // requests would lock out registration platform-wide (self-DoS).
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "";
  const limitKey = ip ? `register:ip:${ip}` : `register:pk:${pubkey}`;
  if (!rateLimit(limitKey, 5, 60_000)) {
    return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const isValid = schnorr.verify(
    hex.decode(signature),
    new TextEncoder().encode(`${username} ${pubkey}`),
    toXOnly(hex.decode(pubkey))
  );

  if (!isValid) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
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
}
