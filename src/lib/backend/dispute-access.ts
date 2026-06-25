import "server-only";

import { db } from "@/db";
import type { OrderStatus } from "@/db/enums";

/**
 * Admin confidentiality gate.
 *
 * The admin is the escrow's third party ONLY once a dispute exists. Outside a dispute the admin
 * must not be able to read license-key codes, chat attachments, or chat contents — same principle
 * already enforced cryptographically for text messages (admin only gets a wrapped CEK via
 * `grant-admin`, triggered when a dispute opens).
 *
 * "Under dispute" covers the order while it is `disputed` (opened, awaiting the admin's verdict)
 * and `concluded` (verdict issued, settlement in progress). After settlement the order moves to a
 * terminal status and admin access is revoked again.
 */
const ADMIN_DISPUTE_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "disputed",
  "concluded",
]);

export function isDisputeStatus(status: string): boolean {
  return ADMIN_DISPUTE_STATUSES.has(status as OrderStatus);
}

/**
 * Whether the admin may **read** an order's confidential data (chat history, attachments, key
 * codes). True while the order is actively under dispute, AND after settlement for any order the
 * admin actually adjudicated (`conclusionStatus` is set at conclusion and persists into the
 * terminal status). This lets the admin review a dispute it resolved without re-opening access to
 * happy-path orders, which never carry a `conclusionStatus`. Writes stay gated on
 * {@link isDisputeStatus} (an active dispute) — there is nothing to write once it is over.
 */
export function mayAdminReadOrder(order: {
  status: string;
  conclusionStatus: string | null;
}): boolean {
  return isDisputeStatus(order.status) || order.conclusionStatus != null;
}

/** True if the order behind a chat is currently under dispute resolution. */
export async function isChatInDispute(chatId: number): Promise<boolean> {
  const chat = await db.chat.findUnique({
    where: { id: chatId },
    select: { order: { select: { status: true } } },
  });
  return chat ? isDisputeStatus(chat.order.status) : false;
}
