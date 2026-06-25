"use client";

import { toast } from "react-toastify";
import { Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCart, useCheckout } from "@/hooks/cart";
import type { CartProduct } from "@/hooks/cart";
import { formatPrice } from "@/lib/utils";
import { PLATFORM_FEE_PERCENT } from "@/lib/fees";
import { Large } from "./ui/typography";
import { Satoshi } from "./icons/satoshi";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useWalletAspInfo } from "@/hooks/wallet";

type Order = {
  sellerPubkey: string;
  sellerUsername: string;
  items: Array<{
    productName: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  keyIds: number[];
};

function buildOrders(products: CartProduct[]): Order[] {
  const groupMap = new Map<string, Order>();

  for (const product of products) {
    for (const tier of product.tiers) {
      const existing = groupMap.get(tier.sellerPubkey);
      if (!existing) {
        groupMap.set(tier.sellerPubkey, {
          sellerPubkey: tier.sellerPubkey,
          sellerUsername: tier.sellerUsername,
          items: [
            {
              productName: product.productName,
              quantity: tier.quantity,
              price: tier.price,
            },
          ],
          subtotal: tier.price * tier.quantity,
          keyIds: [...tier.keyIds],
        });
      } else {
        existing.items.push({
          productName: product.productName,
          quantity: tier.quantity,
          price: tier.price,
        });
        existing.subtotal += tier.price * tier.quantity;
        existing.keyIds.push(...tier.keyIds);
      }
    }
  }

  return Array.from(groupMap.values());
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CheckoutDialog({ open, onOpenChange }: Props) {
  const aspInfo = useWalletAspInfo();
  const cartQuery = useCart();
  const checkout = useCheckout();

  const products = cartQuery.data?.products ?? [];
  const orders = buildOrders(products);
  const grandTotal = orders.reduce((sum, g) => sum + g.subtotal, 0);
  const dust = Number(aspInfo.data?.dust ?? 0);
  const platformFee = orders.reduce(
    (sum, g) => sum + Math.ceil((g.subtotal * PLATFORM_FEE_PERCENT) / 100),
    0
  );
  const dustFee = dust * orders.length;
  const feeEstimate = platformFee + dustFee;

  const grandTotalWithFee = grandTotal + feeEstimate;
  const allKeyIds = orders.flatMap((g) => g.keyIds);

  async function handleConfirm() {
    if (allKeyIds.length === 0) return;

    try {
      await checkout.mutateAsync({ keyIds: allKeyIds });
      toast.success("Order confirmed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error during checkout");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send the funds to escrow</DialogTitle>
          <DialogDescription>
            Address verified client-side. Send the indicated amount to each escrow to complete the
            order.
          </DialogDescription>
        </DialogHeader>

        {orders.map((order) => (
          <>
            <Card key={order.sellerPubkey} variant={"ghost"}>
              <CardHeader className="px-0!">
                <CardTitle>{order.sellerUsername}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-xs px-0!">
                {order.items.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between text-sm text-muted-foreground"
                  >
                    <span className="flex items-center gap-xs">
                      {item.quantity}
                      <X className="inline size-3" />
                      {item.productName}
                      <span className="text-xs text-muted">
                        (<Satoshi className="inline size-4" />
                        {formatPrice(item.price)})
                      </span>
                    </span>

                    <span className="font-medium text-foreground">
                      <Satoshi className="inline size-4" />
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-xs">Platform fee</span>

                  <span className="font-medium text-foreground">
                    <Satoshi className="inline size-4" />
                    {formatPrice(Math.ceil((order.subtotal * PLATFORM_FEE_PERCENT) / 100) + dust)}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Separator />
          </>
        ))}

        <div className="flex justify-between items-center">
          <Large>Total:</Large>
          <Large>
            <Satoshi className="inline" /> {formatPrice(grandTotalWithFee)}
          </Large>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={checkout.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={checkout.isPending || allKeyIds.length === 0}>
            {checkout.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirming…
              </>
            ) : (
              "Confirm order"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
