import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { verifySignedJsonBody } from "@/lib/auth/verify-signed-json-body";
import { checkoutSchema } from "@/validators";
import { processCheckout } from "@/lib/backend/mutations-checkout";
import { getArkOperatorConfig } from "@/lib/ark/operator";
import { db } from "@/db";
import { derivePubkey, mnemonicToPrivateKey } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const buyerPubkey = auth.session.user.pubkey;

  const parsed = await verifySignedJsonBody(req, buyerPubkey, checkoutSchema);

  // Resolve escrow inputs before the DB transaction (getInfo is a network call).
  if (!process.env.ADMIN_MNEMONIC) {
    return Response.json(
      { error: "Missing escrow configuration: ADMIN_MNEMONIC not set" },
      { status: 500 }
    );
  }

  let operatorConfig;
  try {
    operatorConfig = await getArkOperatorConfig();
  } catch (err) {
    // The ASP (Arkade server) is unreachable: without its config we cannot
    // derive the escrows. Handled error (503) instead of an opaque 500.
    console.error("getArkOperatorConfig failed (ASP unreachable?):", err);
    return Response.json(
      { error: "Arkade service unavailable, please try again later." },
      { status: 503 }
    );
  }
  const { serverPubkey, hrp, unilateralExitDelay, dust } = operatorConfig;
  const adminPubkey = derivePubkey(
    mnemonicToPrivateKey(process.env.ADMIN_MNEMONIC, process.env.ADMIN_PASSPHRASE)
  );

  // Escrow.arbiterPubkey is a FK to Account: ensure the admin account exists.
  await db.account.upsert({
    where: { pubkey: adminPubkey },
    create: { pubkey: adminPubkey, username: "admin" },
    update: {},
  });

  // CSV exit-path delay is a relative timelock (seconds/blocks); fits in a JS number.
  const exitDelay = Number(unilateralExitDelay);

  const result = await processCheckout(buyerPubkey, parsed.keyIds, {
    serverPubkey,
    hrp,
    adminPubkey,
    exitDelay,
    dustLimit: Number(dust),
    signature: parsed.signature,
  });

  if (result.orders.length === 0) {
    return Response.json(
      {
        error: "Error",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ orders: result.orders });
}
