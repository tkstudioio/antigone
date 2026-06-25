"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import type { OrderDetail } from "@/lib/backend/query-orders";
import { useAdminConcludeDispute, useAdminFeeConfig } from "@/hooks/admin";
import {
  CONCLUSION_STATUS_LABELS,
  CONCLUSION_STATUS_BADGE,
  deriveConclusionStatus,
} from "@/lib/orders-status";
import { formatPrice } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// The refund amount and the conclusion status are no longer entered by hand: they are derived from
// which keys the admin checks for refund. Only the checked keys and the favoured party are real form
// inputs (the favoured party defaults to a derived value but can be overridden).
const formSchema = z.object({
  favouredRole: z.enum(["buyer", "seller"], { error: "Invalid favoured party" }),
  refundedKeyIds: z.array(z.number().int().positive()),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  order: OrderDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AdminConcludeDisputeDialog({ order, open, onOpenChange }: Props) {
  const concludeMutation = useAdminConcludeDispute(order.id, order.chatId);
  const feeConfig = useAdminFeeConfig();

  const isReconclusion = order.status === "concluded";

  const { handleSubmit, control, setValue, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      favouredRole: "seller",
      refundedKeyIds: [],
    },
  });

  // Seed the form from the order's current verdict only on the closed→open transition (a
  // re-conclusion starts where it left off: refunded keys pre-checked, favoured party preselected).
  // Keyed off `open` alone so a background refetch of `order` mid-edit can't wipe the selections.
  const [favouredOverridden, setFavouredOverridden] = useState(false);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const refunded = order.items.filter((i) => i.refunded).map((i) => i.keyId);
      reset({
        favouredRole: order.favouredRole === "buyer" ? "buyer" : "seller",
        refundedKeyIds: refunded,
      });
      setFavouredOverridden(order.favouredRole != null);
    }
    wasOpen.current = open;
  }, [open, order, reset]);

  const refundedKeyIds = useWatch({ control, name: "refundedKeyIds" }) ?? [];

  // Derived from the checked keys — the single source of truth (mirrors the server-side check).
  const watchedRefund = order.items
    .filter((i) => refundedKeyIds.includes(i.keyId))
    .reduce((sum, i) => sum + i.price, 0);
  const conclusionStatus = deriveConclusionStatus(refundedKeyIds.length, order.items.length);

  // Favoured party: defaults to whoever gets more than half the order value (the buyer when the
  // refund exceeds 50%), but the admin can override it — the lever to unblock a stuck settlement.
  const derivedFavoured: FormValues["favouredRole"] =
    watchedRefund > order.totalSats / 2 ? "buyer" : "seller";
  const favouredWatch = useWatch({ control, name: "favouredRole" });
  const favouredRole = favouredOverridden ? (favouredWatch ?? "seller") : derivedFavoured;

  const adminDisputeShare = feeConfig.data
    ? Math.ceil((order.totalSats * feeConfig.data.adminDisputeSharePercent) / 100)
    : 0;
  const platformFee = order.platformFee;
  // The buyer paid the platform fee on top of the goods price, so it is non-refundable and is NOT
  // docked from the seller. The admin keeps the platform fee plus the arbitration share; the goods
  // pot (totalSats) is split between the buyer refund and the seller, net of the arbitration share.
  const adminReceives = platformFee + adminDisputeShare;
  const sellerReceives = order.totalSats - adminDisputeShare - watchedRefund;
  const breakdownValid = sellerReceives >= 0;

  function toggleKeyId(keyId: number) {
    if (refundedKeyIds.includes(keyId)) {
      setValue(
        "refundedKeyIds",
        refundedKeyIds.filter((id) => id !== keyId)
      );
    } else {
      setValue("refundedKeyIds", [...refundedKeyIds, keyId]);
    }
  }

  function selectAll() {
    setValue(
      "refundedKeyIds",
      order.items.map((i) => i.keyId)
    );
  }

  function deselectAll() {
    setValue("refundedKeyIds", []);
  }

  const onSubmit = handleSubmit((data: FormValues) => {
    concludeMutation.mutate(
      {
        orderId: order.id,
        refundAmount: watchedRefund,
        conclusionStatus,
        favouredRole,
        refundedKeyIds: data.refundedKeyIds,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-large">
        <DialogHeader>
          <DialogTitle>
            {isReconclusion ? "Update verdict" : "Conclude dispute"} #{order.id}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-5 py-2">
          {/* Items to refund — the source of truth for amount and outcome */}
          {order.items.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Items to refund</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={deselectAll}>
                    Deselect all
                  </Button>
                </div>
              </div>
              <div className="rounded-md border divide-y">
                {order.items.map((item) => (
                  <div key={item.keyId} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Checkbox
                      id={`key-${item.keyId}`}
                      checked={refundedKeyIds.includes(item.keyId)}
                      onCheckedChange={() => toggleKeyId(item.keyId)}
                    />
                    <label
                      htmlFor={`key-${item.keyId}`}
                      className="flex flex-1 items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="font-medium">{item.productName}</span>
                      <span className="text-muted-foreground shrink-0">
                        {formatPrice(item.price)}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Derived outcome + refund amount */}
          <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2.5 text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Outcome</span>
              <Badge {...CONCLUSION_STATUS_BADGE[conclusionStatus]} className="w-fit">
                {CONCLUSION_STATUS_LABELS[conclusionStatus]}
              </Badge>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Buyer refund
              </span>
              <span className="font-heading text-base font-semibold">
                {formatPrice(watchedRefund)}
              </span>
            </div>
          </div>

          {/* Fee breakdown preview */}
          {adminReceives > 0 && (
            <div className="rounded-md border p-3 flex flex-col gap-1.5 text-sm bg-muted/50">
              <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                Amount breakdown
              </p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Buyer refund</span>
                <span>{formatPrice(watchedRefund)}</span>
              </div>
              {platformFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform fee</span>
                  <span>{formatPrice(platformFee)}</span>
                </div>
              )}
              {adminDisputeShare > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admin dispute share</span>
                  <span>{formatPrice(adminDisputeShare)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Admin total</span>
                <span className="font-medium">{formatPrice(adminReceives)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Seller share</span>
                <span className={cn("font-medium", sellerReceives < 0 && "text-destructive")}>
                  {formatPrice(Math.max(0, sellerReceives))}
                </span>
              </div>
              {!breakdownValid && (
                <p className="text-xs text-destructive">
                  The refund exceeds the maximum refundable amount (the admin dispute share is
                  deducted from the total).
                </p>
              )}
            </div>
          )}

          {/* Favoured party (drives the on-chain settlement) */}
          <div className="flex flex-col gap-1.5">
            <Label>Favoured party (settlement)</Label>
            <Controller
              name="favouredRole"
              control={control}
              render={() => (
                <Select
                  value={favouredRole}
                  onValueChange={(value) => {
                    setFavouredOverridden(true);
                    setValue("favouredRole", value as FormValues["favouredRole"]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select favoured party" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seller">Seller</SelectItem>
                    <SelectItem value="buyer">Buyer</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              This is the party that performs the on-chain settlement (with its own leaf). Defaults
              based on who receives more; override it to unblock a stuck settlement (e.g. the seller
              is unresponsive → favour the buyer).
              {sellerReceives !== watchedRefund &&
                ` Receives more: ${sellerReceives > watchedRefund ? "seller" : "buyer"}.`}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={concludeMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={concludeMutation.isPending || !breakdownValid}>
              {concludeMutation.isPending
                ? "Sending..."
                : isReconclusion
                  ? "Update verdict"
                  : "Conclude dispute"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
