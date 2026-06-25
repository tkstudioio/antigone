"use client";

import { useEffect, useRef, useState } from "react";
import { match } from "ts-pattern";
import { useSession } from "next-auth/react";
import { useChat, useSendChatMessage, useUploadChatAttachment } from "@/hooks/chat";
import type { AttachmentMeta } from "@/hooks/chat";
import type { OrderDetail } from "@/lib/backend/query-orders";
import type { ChatMessage } from "@/lib/backend/query-chat-types";
import { MessageAttachment } from "@/components/message-attachment";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "react-toastify";
import { IMAGE_MIME_ALLOWLIST, MAX_ATTACHMENT_BYTES } from "@/validators";

type Props = {
  chatId: number;
  order: OrderDetail;
};

function MessageBubble({
  msg,
  currentPubkey,
  order,
}: {
  msg: ChatMessage;
  currentPubkey: string | undefined;
  order: OrderDetail;
}) {
  const isSystem = msg.isSystem;

  if (isSystem) {
    return (
      <div className="flex justify-center my-1">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {msg.message ?? ""}
        </span>
      </div>
    );
  }

  const isBuyer = msg.senderPubkey === order.buyer.pubkey;
  const isSeller = msg.senderPubkey === order.seller.pubkey;
  const isAdmin = !isBuyer && !isSeller;

  if (isAdmin) {
    return (
      <div className="flex justify-center my-1">
        <div className="flex flex-col items-center gap-0.5">
          {msg.message && (
            <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
              {msg.message}
            </span>
          )}
          {msg.attachment != null && <MessageAttachment attachment={msg.attachment} />}
          <span className="text-[10px] text-muted-foreground">
            Admin ·{" "}
            {new Date(msg.sentAt).toLocaleString("en-US", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    );
  }

  const isMine = msg.senderPubkey === currentPubkey;
  const senderLabel = isBuyer ? order.buyer.username : order.seller.username;
  const sentAt = new Date(msg.sentAt).toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
          isMine ? "bg-primary/10 text-foreground" : "bg-secondary text-secondary-foreground"
        }`}
      >
        {msg.message}
        {msg.attachment != null && <MessageAttachment attachment={msg.attachment} />}
      </div>
      <span className="text-[10px] text-muted-foreground px-1">
        {senderLabel} · {sentAt}
      </span>
    </div>
  );
}

export function OrderChatThread({ chatId, order }: Props) {
  const { data: session } = useSession();
  const currentPubkey = session?.user?.pubkey;

  // Once a dispute is open the admin must be able to read new messages too, so wrap them toward
  // the arbiter pubkey as well (grant-admin only re-wrapped the pre-dispute history).
  const disputeActive = order.status === "disputed" || order.status === "concluded";
  const adminPubkey = disputeActive ? (order.escrow?.arbiterPubkey ?? null) : null;

  const chatQuery = useChat(chatId);
  const sendMutation = useSendChatMessage(chatId, {
    buyerPubkey: order.buyer.pubkey,
    sellerPubkey: order.seller.pubkey,
    adminPubkey,
  });
  const uploadMutation = useUploadChatAttachment(chatId);

  const [draft, setDraft] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messageCount = chatQuery.data?.messages.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isClosed = chatQuery.data?.status === "closed";
  const isOrderCancelled = order.status === "cancelled";
  const isOrderConcluded = order.status === "concluded";
  const isOrderTerminal = isOrderCancelled || isOrderConcluded;
  const isBusy = sendMutation.isPending || uploadMutation.isPending;
  const canSend = !isClosed && !isBusy && (draft.trim().length > 0 || pendingFile != null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!(IMAGE_MIME_ALLOWLIST as readonly string[]).includes(file.type)) {
      toast.error("Unsupported file type. Only images are allowed (JPEG, PNG, WebP, GIF).");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("The file exceeds the maximum size of 5 MB.");
      e.target.value = "";
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = "";
  }

  function removePendingFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;

    let attachment: AttachmentMeta | undefined;
    if (pendingFile) {
      try {
        attachment = await uploadMutation.mutateAsync(pendingFile);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error uploading the attachment");
        return;
      }
    }

    const message = draft.trim() || undefined;

    sendMutation.mutate(
      { message, attachment },
      {
        onSuccess: () => {
          setDraft("");
          removePendingFile();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Error sending the message");
        },
      }
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {match(chatQuery)
        .with({ isPending: true }, () => (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-10 w-1/2" />
          </div>
        ))
        .with({ isError: true }, () => (
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-destructive">
            <p>Error loading the chat.</p>
            <Button variant="outline" size="sm" onClick={() => chatQuery.refetch()}>
              Retry
            </Button>
          </div>
        ))
        .with({ isSuccess: true }, ({ data }) => (
          <div className="max-h-96 overflow-y-auto flex flex-col gap-2 px-1 py-2">
            {data.messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No messages yet. Write the first one!
              </p>
            ) : (
              data.messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} currentPubkey={currentPubkey} order={order} />
              ))
            )}
            <div ref={bottomRef} />
          </div>
        ))
        .otherwise(() => null)}

      {isOrderConcluded && (
        <div className="rounded-md bg-muted px-4 py-2 text-sm text-muted-foreground text-center">
          Dispute concluded — the chat is closed.
        </div>
      )}

      {isOrderCancelled && (
        <div className="rounded-md bg-muted px-4 py-2 text-sm text-muted-foreground text-center">
          Order cancelled — the chat is closed.
        </div>
      )}

      {!isOrderTerminal && isClosed && (
        <div className="rounded-md bg-muted px-4 py-2 text-sm text-muted-foreground text-center">
          Chat closed
        </div>
      )}

      {!isOrderTerminal && (
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-2">
          {/* File preview */}
          {previewUrl && pendingFile && (
            <div className="flex items-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Attachment preview"
                className="h-16 w-16 rounded object-cover border"
              />
              <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                <span className="truncate max-w-[150px]">{pendingFile.name}</span>
                <button
                  type="button"
                  onClick={removePendingFile}
                  className="text-destructive hover:underline text-left"
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message..."
            rows={3}
            disabled={isClosed || isBusy}
            maxLength={4000}
          />

          <div className="flex items-center justify-between">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFileChange}
                disabled={isClosed || isBusy}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isClosed || isBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                Attach image
              </Button>
            </div>
            <Button type="submit" size="sm" disabled={!canSend}>
              {isBusy ? "Sending..." : "Send"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
