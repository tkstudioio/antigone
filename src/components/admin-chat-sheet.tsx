"use client";

import { AdminChatThread } from "@/components/admin-chat-thread";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Props = {
  chatId: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function AdminChatSheet({ chatId, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 data-[side=right]:sm:max-w-xlarge p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Admin chat</SheetTitle>
        </SheetHeader>
        {chatId != null ? (
          <AdminChatThread chatId={chatId} showHeader />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">No chat selected.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
