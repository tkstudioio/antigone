import { isAfter } from "date-fns";
import { SignJWT } from "jose";
import { schnorr } from "@noble/curves/secp256k1.js";
import { hex } from "@scure/base";
import { db } from "@/db";
import { toXOnly } from "@/lib/utils";
import { loginSchema } from "@/validators";

const nextAuthSecret = process.env.NEXTAUTH_SECRET;

if (!nextAuthSecret) {
  throw new Error("NEXTAUTH_SECRET is required");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pubkey, nonce, signature } = loginSchema.parse(body);

    const challengeRecord = await db.challenge.findUnique({
      where: { nonce },
    });

    if (!challengeRecord) {
      return Response.json({ error: "Invalid nonce" }, { status: 401 });
    }
    if (challengeRecord.pubkey !== pubkey) {
      return Response.json({ error: "Wrong pubkey" }, { status: 401 });
    }
    if (isAfter(new Date(), challengeRecord.expiry)) {
      return Response.json({ error: "Challenge expired" }, { status: 401 });
    }

    const isValid = schnorr.verify(
      hex.decode(signature),
      new TextEncoder().encode(`${nonce} ${pubkey}`),
      toXOnly(hex.decode(pubkey))
    );

    if (!isValid) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    try {
      await db.challenge.delete({ where: { nonce } });
    } catch {
      // P2025: already consumed
      return Response.json({ error: "Challenge already consumed" }, { status: 401 });
    }

    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub: pubkey,
      iat: now,
      exp: now + 3600,
    })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(nextAuthSecret));

    return new Response(token, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}
