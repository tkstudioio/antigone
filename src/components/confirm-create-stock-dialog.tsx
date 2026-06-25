"use client";

import { Loader2 } from "lucide-react";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  codesCount: number;
  productName: string;
  price: number;
  onConfirm: () => void;
  isPending: boolean;
};

export function ConfirmCreateStockDialog({
  open,
  onOpenChange,
  codesCount,
  productName,
  price,
  onConfirm,
  isPending,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm stock creation</AlertDialogTitle>
          <AlertDialogDescription>
            You are about to insert {codesCount.toLocaleString("en-US")} key
            {codesCount === 1 ? "" : "s"} for the game <strong>{productName}</strong> at price{" "}
            <strong>{price.toLocaleString("en-US")} sats</strong>. Are you sure?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
