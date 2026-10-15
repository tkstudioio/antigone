"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";

import type { OrderDetailItemView, OrderDetailView } from "@/hooks/orders";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  order: OrderDetailView;
};

/**
 * License-key cell. The server only sends the ciphertext + the viewer's wrapped key when the viewer
 * is entitled to it (seller always; buyer once delivery is confirmed) and the browser decrypts it;
 * the UI never decides entitlement, it just reflects the outcome. Nothing to open → "—"; a wrap that
 * does not open (e.g. a bad delivery by the seller) → "Unable to decrypt — open a dispute".
 * Otherwise masked by default with a reveal toggle and a copy button.
 */
function KeyCell({ item }: { item: OrderDetailItemView }) {
  const code = item.code;
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (code == null) {
    if (item.codeStatus === "undecryptable") {
      return <span className="text-xs text-destructive">Unable to decrypt — open a dispute</span>;
    }
    return <span className="text-muted-foreground">—</span>;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy the key");
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <span className="font-mono text-xs">{revealed ? code : "••••••••"}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="size-7 shrink-0 p-0"
        aria-label={revealed ? "Hide key" : "Show key"}
        onClick={() => setRevealed((v) => !v)}
      >
        {revealed ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="size-7 shrink-0 p-0"
        aria-label="Copy key"
        onClick={copy}
      >
        {copied ? (
          <CheckIcon className="size-3.5 text-positive" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

/**
 * "Products" card: the ordered items (name links to the product page, price, license key with
 * reveal) plus the totals footer (subtotal `totalSats`, platform fee when > 0, grand total).
 */
export function OrderProductsTable({ order }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Products</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Key</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((item: OrderDetailItemView) => (
              <TableRow key={item.keyId}>
                <TableCell>
                  <Link
                    href={`/products/${item.productSlug}`}
                    className="font-medium hover:underline"
                  >
                    {item.productName}
                  </Link>
                </TableCell>
                <TableCell className="text-right">{formatPrice(item.price)}</TableCell>
                <TableCell className="text-right">
                  <KeyCell item={item} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="flex-col gap-1 border-t pt-4 text-sm">
        <div className="flex w-full items-center justify-between">
          <span className="text-muted-foreground">Items subtotal</span>
          <span>{formatPrice(order.totalSats)}</span>
        </div>
        {order.platformFee > 0 && (
          <div className="flex w-full items-center justify-between">
            <span className="text-muted-foreground">Platform fee (1%)</span>
            <span>{formatPrice(order.platformFee)}</span>
          </div>
        )}
        <div className="flex w-full items-center justify-between">
          <span className="text-muted-foreground">
            {order.role === "buyer" ? "Total paid" : "Order total"}
          </span>
          <span className="text-base font-semibold">
            {formatPrice(order.totalSats + order.platformFee)}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}
