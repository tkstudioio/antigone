import { NextResponse } from "next/server";
import { signedRoute } from "@/lib/auth/signed-route";
import { checkoutSchema } from "@/validators";
import { processCheckout } from "@/lib/backend/mutations-checkout";
import { getArkOperatorConfig } from "@/lib/ark/operator";
import { db } from "@/db";
import { getAdminPubkey } from "@/lib/backend/admin-key";

export const POST = signedRoute({
  schema: checkoutSchema,
  signer: "session",
  handler: async ({ payload, pubkey: buyerPubkey, action }) => {
    // Resolve escrow inputs before the DB transaction (getInfo is a network call).
    const adminPubkey = getAdminPubkey();
    if (!adminPubkey) {
      return Response.json(
        { error: "Missing escrow configuration: ADMIN_PUBKEY not set or invalid" },
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

    // Escrow.arbiterPubkey is a FK to Account: ensure the admin account exists.
    await db.account.upsert({
      where: { pubkey: adminPubkey },
      create: { pubkey: adminPubkey, username: "admin" },
      update: {},
    });

    // CSV exit-path delay is a relative timelock (seconds/blocks); fits in a JS number.
    const exitDelay = Number(unilateralExitDelay);

    // The payload carries the terms the buyer saw (key, seller, price per item); a drift answers 409.
    const result = await processCheckout(buyerPubkey, payload.items, {
      serverPubkey,
      hrp,
      adminPubkey,
      exitDelay,
      dustLimit: Number(dust),
      signature: action.signature,
      actionId: action.id,
    });

    if ("error" in result) {
      return Response.json(
        {
          error: result.error,
          ...(result.unavailableKeys ? { unavailableKeys: result.unavailableKeys } : {}),
        },
        { status: result.status }
      );
    }

    if (result.orders.length === 0) {
      return Response.json(
        {
          error: "Error",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ orders: result.orders });
  },
});
