"use client";

import { useState } from "react";
import Link from "next/link";
import { match } from "ts-pattern";
import { toast } from "react-toastify";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarPlus,
  CopyIcon,
  Gavel,
  Hash,
  MessagesSquare,
  Package,
  ShieldCheck,
  Store,
  User,
  Users,
  Wallet,
} from "lucide-react";

import { useAdminDisputeDetail } from "@/hooks/admin";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from "@/lib/orders-status";
import type { EscrowStatus, OrderStatus } from "@/db/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminConcludeDisputeDialog } from "@/components/admin-conclude-dispute-dialog";
import { AdminChatThread } from "@/components/admin-chat-thread";
import { OrderStepper } from "./order-stepper";
import { H1, P } from "./ui/typography";
import { EscrowFundingBar } from "./escrow-funding-bar";
import { useEscrowFunding } from "@/hooks/orders";

// A verdict is final only once the escrow is settled on-chain; until then the admin can re-conclude.
const SETTLED_ESCROW_STATUSES = ["completed", "refunded", "expiredSwept"] as const;

type Props = {
  orderId: number | null;
};

function truncateMiddle(str: string, head = 10, tail = 6) {
  if (str.length <= head + tail + 1) return str;
  return `${str.slice(0, head)}…${str.slice(-tail)}`;
}

/** A label / value row used inside the metadata cards. */
function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 shrink-0 opacity-70" />
        {label}
      </span>
      <span className="text-right font-medium text-foreground">{children}</span>
    </div>
  );
}

/** A buyer/seller tile with an avatar-like icon and a copyable pubkey. */
function PartyTile({
  icon: Icon,
  role,
  username,
  pubkey,
  onCopy,
}: {
  icon: React.ComponentType<{ className?: string }>;
  role: string;
  username: string;
  pubkey: string;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fill ring-1 ring-foreground/10">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{role}</span>
        <span className="truncate font-medium">{username}</span>
        <button
          type="button"
          onClick={() => onCopy(pubkey)}
          className="group flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          title="Copy public key"
        >
          {truncateMiddle(pubkey)}
          <CopyIcon className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </div>
    </div>
  );
}

export function AdminDisputeDetail({ orderId }: Props) {
  const detailQuery = useAdminDisputeDetail(orderId);
  const funding = useEscrowFunding(orderId ?? undefined, {
    enabled: orderId != null && Boolean(detailQuery.data?.escrowAddress),
    escrowStatus: detailQuery.data?.escrow?.status,
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Unable to copy");
    }
  }

  if (orderId == null) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Gavel className="size-10 opacity-40" />
        <p className="text-sm">Dispute not found.</p>
      </div>
    );
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/disputes">
          <ArrowLeft className="size-4" />
          All disputes
        </Link>
      </Button>

      {match(detailQuery)
        .with({ isPending: true }, () => (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-9 w-56" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ))
        .with({ isError: true }, () => (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Gavel className="size-10 opacity-40" />
            <p className="text-sm">Dispute not found.</p>
          </div>
        ))
        .with({ isSuccess: true }, ({ data: order }) => {
          const escrowStatus = order.escrow?.status;
          // The verdict is locked only once the escrow is settled on-chain (or there is no escrow to
          // settle and the order is already concluded). While the escrow stays `disputed` the admin
          // can re-conclude — the CTA stays enabled and switches to "Aggiorna verdetto".
          const isSettled = escrowStatus
            ? (SETTLED_ESCROW_STATUSES as readonly string[]).includes(escrowStatus)
            : order.status === "concluded";
          const ctaLabel = order.status === "concluded" ? "Update verdict" : "Conclude";

          // The platform fee was paid by the buyer on top of the goods price and is not docked from
          // the seller; only the buyer refund and the admin's arbitration share reduce the seller's
          // share of the goods pot (totalSats).
          const sellerShare =
            order.totalSats - (order.refundAmount ?? 0) - (order.adminDisputeShare ?? 0);

          return (
            <>
              <div>
                <H1>Dispute #{order.id}</H1>
                <P>Opened on {new Date(order.createdAt).toLocaleDateString("en-US")}</P>
              </div>

              <div className="grid grid-cols-1 gap-md lg:grid-cols-4">
                {/* Left column (1fr): summary + CTA, then lifecycle stepper */}
                <div className="flex flex-col gap-md lg:col-span-1">
                  <Card>
                    <CardHeader className="pb-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldCheck className="size-4 text-muted-foreground" />
                        Order summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <Badge {...ORDER_STATUS_BADGE[order.status as OrderStatus]}>
                          {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Order total</span>
                        <span className="font-heading text-lg font-semibold">
                          {formatPrice(order.totalSats)}
                        </span>
                      </div>

                      {funding.data &&
                        escrowStatus !== "completed" &&
                        escrowStatus !== "refunded" && (
                          <EscrowFundingBar
                            total={funding.data.total}
                            price={funding.data.price}
                            expiresAt={funding.data.expiresAt}
                            expirySoon={funding.data.expirySoon}
                            swept={funding.data.swept}
                          />
                        )}

                      {/* Verdict — shown only after conclusion */}
                      {order.status === "concluded" && (
                        <>
                          <Separator className="my-1" />
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Dispute outcome
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Buyer refund</span>
                            <span className="font-medium">
                              {order.refundAmount != null ? formatPrice(order.refundAmount) : "—"}
                            </span>
                          </div>
                          {order.platformFee > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Platform fee</span>
                              <span className="font-medium">{formatPrice(order.platformFee)}</span>
                            </div>
                          )}
                          {order.adminDisputeShare != null && order.adminDisputeShare > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Admin dispute share</span>
                              <span className="font-medium">
                                {formatPrice(order.adminDisputeShare)}
                              </span>
                            </div>
                          )}
                          {(order.platformFee > 0 ||
                            (order.adminDisputeShare != null && order.adminDisputeShare > 0)) && (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Seller share</span>
                              <span className="font-medium">{formatPrice(sellerShare)}</span>
                            </div>
                          )}
                          {order.concludedAt && (
                            <InfoRow icon={CalendarCheck} label="Concluded on">
                              {new Date(order.concludedAt).toLocaleString("en-US")}
                            </InfoRow>
                          )}
                          {order.refundSignature && (
                            <InfoRow icon={Hash} label="Signature">
                              <button
                                type="button"
                                onClick={() => copyToClipboard(order.refundSignature!)}
                                className="group flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                                title="Copy signature"
                              >
                                {truncateMiddle(order.refundSignature, 12, 8)}
                                <CopyIcon className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                              </button>
                            </InfoRow>
                          )}
                        </>
                      )}
                    </CardContent>
                    <CardFooter className="border-t border-foreground/10 pt-md">
                      <Button
                        onClick={() => setDialogOpen(true)}
                        disabled={isSettled}
                        className="w-full"
                      >
                        <Gavel className="size-4" />
                        {ctaLabel}
                      </Button>
                    </CardFooter>
                  </Card>

                  <OrderStepper
                    orderStatus={order.status}
                    escrowStatus={escrowStatus as EscrowStatus | undefined}
                    role={undefined}
                  />
                </div>

                {/* Right column (3fr): counterparties, items, chat */}
                <div className="flex flex-col gap-md lg:col-span-3">
                  <Card>
                    <CardHeader className="pb-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="size-4 text-muted-foreground" />
                        Counterparties
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <PartyTile
                          icon={Store}
                          role="Seller"
                          username={order.seller.username}
                          pubkey={order.seller.pubkey}
                          onCopy={copyToClipboard}
                        />
                        <PartyTile
                          icon={User}
                          role="Buyer"
                          username={order.buyer.username}
                          pubkey={order.buyer.pubkey}
                          onCopy={copyToClipboard}
                        />
                      </div>
                      <Separator />
                      <div className="flex flex-col text-sm">
                        <InfoRow icon={CalendarPlus} label="Created on">
                          {new Date(order.createdAt).toLocaleString("en-US")}
                        </InfoRow>
                        {order.completedAt && (
                          <InfoRow icon={CalendarCheck} label="Completed on">
                            {new Date(order.completedAt).toLocaleString("en-US")}
                          </InfoRow>
                        )}
                        {order.chatId != null && (
                          <InfoRow icon={Hash} label="Chat">
                            <span className="font-mono">#{order.chatId}</span>
                          </InfoRow>
                        )}
                        {order.escrowAddress && (
                          <InfoRow icon={Wallet} label="Escrow">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(order.escrowAddress!)}
                              className="group flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                              title="Copy escrow address"
                            >
                              {truncateMiddle(order.escrowAddress, 12, 8)}
                              <CopyIcon className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                            </button>
                          </InfoRow>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Items */}
                  <Card>
                    <CardHeader className="pb-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Package className="size-4 text-muted-foreground" />
                        Items
                        <Badge variant="outline" action="muted" className="ml-1">
                          {order.items.length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {order.items.length === 0 ? (
                        <p className="py-2 text-sm text-muted-foreground">No items.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Product</TableHead>
                              <TableHead>Code</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                              {order.status === "concluded" && (
                                <TableHead className="text-right">Outcome</TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {order.items.map((item) => (
                              <TableRow key={item.keyId}>
                                <TableCell className="font-medium">{item.productName}</TableCell>
                                <TableCell>
                                  {item.code != null ? (
                                    <span className="font-mono text-xs text-muted-foreground">
                                      {item.code}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatPrice(item.price)}
                                </TableCell>
                                {order.status === "concluded" && (
                                  <TableCell className="text-right">
                                    <Badge variant={item.refunded ? "solid" : "outline"}>
                                      {item.refunded ? "Refunded" : "Not refunded"}
                                    </Badge>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>

                  {/* Conversation */}
                  <Card className="space-y-0">
                    <CardHeader className="border-b border-foreground/10 pb-md">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <MessagesSquare className="size-4 text-muted-foreground" />
                        Conversation
                      </CardTitle>
                    </CardHeader>
                    {order.chatId != null ? (
                      <AdminChatThread chatId={order.chatId} />
                    ) : (
                      <CardContent>
                        <p className="py-2 text-sm text-muted-foreground">
                          No conversation for this order.
                        </p>
                      </CardContent>
                    )}
                  </Card>
                </div>
              </div>

              <AdminConcludeDisputeDialog
                order={order}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
              />
            </>
          );
        })
        .otherwise(() => null)}
    </>
  );
}
