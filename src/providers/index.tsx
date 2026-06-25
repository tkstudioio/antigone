"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { ToastContainer } from "react-toastify";
import { TooltipProvider } from "@/components/ui/tooltip";

import { ReactNode, useState } from "react";
import { WalletAutoReconnect } from "@/components/wallet-auto-reconnect";

export function AppProviders({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  // Un'unica istanza per il ciclo di vita dell'app: ricrearla a ogni render azzererebbe la cache.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
        <NuqsAdapter>
          <TooltipProvider>
            <WalletAutoReconnect />
            {children}
            <ToastContainer />
          </TooltipProvider>
        </NuqsAdapter>
      </QueryClientProvider>
    </SessionProvider>
  );
}
