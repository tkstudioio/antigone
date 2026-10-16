"use client";

import { useState } from "react";
import { match } from "ts-pattern";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";

import type { StockTier } from "@/hooks/stocks";
import { useStockTierKeys, useDeleteStock, useDeleteKeysFromStock } from "@/hooks/stocks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Satoshi } from "@/components/icons/satoshi";
import { formatPrice } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreateStockDialog } from "@/components/create-stock-dialog";
import { EditStockPriceDialog } from "@/components/edit-stock-price-dialog";

type Props = {
  tier: StockTier;
  productId: number;
  productName: string;
};

export function StockTierDetail({ tier, productId, productName }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addKeysOpen, setAddKeysOpen] = useState(false);
  const [editPriceOpen, setEditPriceOpen] = useState(false);
  const [deleteStockOpen, setDeleteStockOpen] = useState(false);
  const [removeKeysOpen, setRemoveKeysOpen] = useState(false);

  const keysQuery = useStockTierKeys(productId, tier.price);
  const deleteStockMutation = useDeleteStock();
  const deleteKeysMutation = useDeleteKeysFromStock(productId);

  function handleToggleKey(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleAll(keys: { id: string }[]) {
    if (selected.size === keys.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(keys.map((k) => k.id)));
    }
  }

  const keys = keysQuery.data?.keys ?? [];
  const allSelected = keys.length > 0 && selected.size === keys.length;
  const removeDisabled = selected.size === 0 || selected.size === tier.availableCount;

  async function handleDeleteStock() {
    try {
      const result = await deleteStockMutation.mutateAsync({ productId, price: tier.price });
      toast.success(`Stock deleted (${result.deleted.toLocaleString("en-US")} keys)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error during deletion";
      toast.error(msg);
    }
    setDeleteStockOpen(false);
  }

  async function handleDeleteKeys() {
    const keyIds = [...selected];
    try {
      const result = await deleteKeysMutation.mutateAsync({ keyIds });
      toast.success(
        `${result.deleted.toLocaleString("en-US")} key${result.deleted === 1 ? "" : "s"} removed`
      );
      setSelected(new Set());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Some keys are no longer available";
      toast.error(msg);
    }
    setRemoveKeysOpen(false);
  }

  return (
    <>
      <Card className="space-y-0 py-0">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="space-y-1">
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              Price tier
            </p>
            <p className="flex items-center text-3xl font-bold tabular-nums">
              <Satoshi className="size-7 shrink-0" aria-hidden />
              {formatPrice(tier.price)}
              <span className="sr-only"> sats</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {tier.availableCount.toLocaleString("en-US")} key
              {tier.availableCount === 1 ? "" : "s"} available
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              action="muted"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setAddKeysOpen(true)}
            >
              <Plus />
              Add keys
            </Button>
            <Button
              variant="outline"
              action="muted"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setEditPriceOpen(true)}
            >
              <Pencil />
              Edit price
            </Button>
            <Button
              variant="ghost"
              action="negative"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setDeleteStockOpen(true)}
            >
              <Trash2 />
              Delete stock
            </Button>
          </div>
        </div>

        {/* Selection bar */}
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-y bg-muted/40 px-4 py-2 sm:px-6">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {selected.size === 0
              ? "Select keys to remove them from this tier."
              : selected.size === tier.availableCount
                ? "All keys selected: to empty the stock use “Delete stock”."
                : `${selected.size.toLocaleString("en-US")} selected`}
          </p>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                action="muted"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
              <Button
                action="negative"
                size="sm"
                disabled={removeDisabled}
                onClick={() => setRemoveKeysOpen(true)}
              >
                <Trash2 />
                Remove selected
              </Button>
            </div>
          )}
        </div>

        {match(keysQuery)
          .with({ isPending: true }, () => (
            <div className="flex justify-center py-8">
              <Loader2
                className="size-5 animate-spin text-muted-foreground"
                aria-label="Loading keys"
              />
            </div>
          ))
          .with({ isError: true }, () => (
            <p className="px-4 py-6 text-sm text-destructive sm:px-6">Error loading the keys.</p>
          ))
          .with({ isSuccess: true }, () => (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 pl-4 sm:pl-6">
                    <Checkbox
                      aria-label="Select all keys"
                      checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
                      onCheckedChange={() => handleToggleAll(keys)}
                    />
                  </TableHead>
                  <TableHead className="text-muted-foreground">ID</TableHead>
                  <TableHead className="text-muted-foreground">Code</TableHead>
                  <TableHead className="pr-4 text-right text-muted-foreground sm:pr-6">
                    Created on
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No keys available.
                    </TableCell>
                  </TableRow>
                ) : (
                  keys.map((k) => (
                    <TableRow key={k.id} data-state={selected.has(k.id) ? "selected" : undefined}>
                      <TableCell className="pl-4 sm:pl-6">
                        <Checkbox
                          aria-label={`Select key #${k.id}`}
                          checked={selected.has(k.id)}
                          onCheckedChange={() => handleToggleKey(k.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        #{k.id}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {k.code != null ? (
                          k.code
                        ) : k.codeStatus === "undecryptable" ? (
                          <span className="font-sans text-destructive">Unable to decrypt</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-right text-sm text-muted-foreground tabular-nums sm:pr-6">
                        {new Date(k.createdAt).toLocaleDateString("en-US")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ))
          .otherwise(() => null)}
      </Card>

      {/* Add keys wizard */}
      <CreateStockDialog
        open={addKeysOpen}
        onOpenChange={setAddKeysOpen}
        mode="append"
        productId={productId}
        productName={productName}
        price={tier.price}
      />

      {/* Edit price dialog */}
      <EditStockPriceDialog
        open={editPriceOpen}
        onOpenChange={setEditPriceOpen}
        productId={productId}
        oldPrice={tier.price}
      />

      {/* Delete stock confirm */}
      <AlertDialog open={deleteStockOpen} onOpenChange={setDeleteStockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stock</AlertDialogTitle>
            <AlertDialogDescription>
              Irreversible operation. {tier.availableCount.toLocaleString("en-US")} key
              {tier.availableCount === 1 ? "" : "s"} will be deleted. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              action="negative"
              onClick={handleDeleteStock}
              disabled={deleteStockMutation.isPending}
            >
              {deleteStockMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove keys confirm */}
      <AlertDialog open={removeKeysOpen} onOpenChange={setRemoveKeysOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove keys</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to remove {selected.size.toLocaleString("en-US")} key
              {selected.size === 1 ? "" : "s"}. Irreversible operation. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              action="negative"
              onClick={handleDeleteKeys}
              disabled={deleteKeysMutation.isPending}
            >
              {deleteKeysMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
