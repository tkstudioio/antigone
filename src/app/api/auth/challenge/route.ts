import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { challengeSchema } from "@/validators";
import { rateLimit } from "@/lib/auth/rate-limit";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pubkey } = challengeSchema.parse(body);
    if (!rateLimit(`challenge:${pubkey}`, 10, 60_000)) {
      return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const nonce = randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 30_000);

    // Delete stale challenges
    await db.challenge.deleteMany({
      where: { expiry: { lt: new Date() } },
    });

    const saved = await db.challenge.upsert({
      where: { pubkey },
      create: { pubkey, nonce, expiry },
      update: { nonce, expiry },
    });

    return Response.json(saved);
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}
