"use client";

import { useState } from "react";
import { match } from "ts-pattern";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";

import type { StockTier } from "@/hooks/stocks";
import { useStockTierKeys, useDeleteStock, useDeleteKeysFromStock } from "@/hooks/stocks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { CreateStockSheet } from "@/components/create-stock-sheet";
import { EditStockPriceDialog } from "@/components/edit-stock-price-dialog";

type Props = {
  tier: StockTier;
  productId: number;
  productName: string;
  productSlug: string;
};

export function StockTierDetail({ tier, productId, productName, productSlug }: Props) {
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
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">{tier.price.toLocaleString("en-US")} sats</span>
            <span className="text-sm text-muted-foreground">
              {tier.availableCount.toLocaleString("en-US")} key
              {tier.availableCount === 1 ? "" : "s"} available
            </span>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setAddKeysOpen(true)}
            >
              Add keys
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setEditPriceOpen(true)}
            >
              Edit price
            </Button>
            <Button
              action="negative"
              size="sm"
              className="w-full sm:w-auto"
              disabled={removeDisabled}
              onClick={() => setRemoveKeysOpen(true)}
            >
              Remove selected
            </Button>
            <Button
              action="negative"
              size="sm"
              className="w-full sm:ml-auto sm:w-auto"
              onClick={() => setDeleteStockOpen(true)}
            >
              Delete stock
            </Button>
          </div>
          {selected.size > 0 && selected.size === tier.availableCount && (
            <p className="text-xs text-muted-foreground">
              To empty the stock use &ldquo;Delete stock&rdquo;
            </p>
          )}
        </CardContent>

        <CardContent className="flex flex-col gap-4">
          {match(keysQuery)
            .with({ isPending: true }, () => (
              <div className="flex justify-center py-4">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ))
            .with({ isError: true }, () => (
              <p className="text-sm text-destructive">Error loading the keys.</p>
            ))
            .with({ isSuccess: true }, () => (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => handleToggleAll(keys)}
                        />
                      </TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Created on</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No keys available.
                        </TableCell>
                      </TableRow>
                    ) : (
                      keys.map((k) => (
                        <TableRow key={k.id}>
                          <TableCell>
                            <Checkbox
                              checked={selected.has(k.id)}
                              onCheckedChange={() => handleToggleKey(k.id)}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            #{k.id}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{k.code ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(k.createdAt).toLocaleDateString("en-US")}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            ))
            .otherwise(() => null)}
        </CardContent>
      </Card>

      {/* Add keys sheet */}
      <CreateStockSheet
        open={addKeysOpen}
        onOpenChange={setAddKeysOpen}
        mode="append"
        productId={productId}
        productSlug={productSlug}
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
