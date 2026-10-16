import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";

import { authOptions } from "@/lib/auth-options";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Identicon } from "@/components/identicon";
import { CartSheet } from "@/components/cart-sheet";
import { ShopNav } from "@/components/shop-nav";
import { ShopFooter } from "@/components/shop-footer";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (session?.user.isAdmin) {
    redirect("/disputes");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-sm focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-3 focus:ring-ring/50"
      >
        Skip to main content
      </a>

      {/* Sticky in normal flow, so it keeps its space and never covers the first section. */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center gap-4 md:gap-6">
            <Link
              href="/"
              aria-label="Antigone — home"
              className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Icon className="h-8" />
            </Link>
            <ShopNav />
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {session ? (
              <>
                {/* Identity first, cart last: the cart sheet opens from the right edge, next to
                    its own trigger. */}
                <Button
                  variant="ghost"
                  action="muted"
                  asChild
                  className="h-auto min-h-11 gap-2.5 px-1.5 py-1 sm:pr-3"
                >
                  <Link href="/dashboard" aria-label={`My account: ${session.user.username}`}>
                    <Identicon value={session.user.pubkey} size={32} />
                    <span className="hidden min-w-0 text-left leading-tight sm:grid">
                      <span className="max-w-40 truncate text-sm font-semibold text-foreground">
                        {session.user.username}
                      </span>
                      <span className="truncate font-mono text-xs">
                        {session.user.pubkey.slice(0, 8)}…{session.user.pubkey.slice(-6)}
                      </span>
                    </span>
                  </Link>
                </Button>
                <CartSheet />
              </>
            ) : (
              <Button variant="ghost" action="muted" asChild>
                <Link href="/login" aria-label="Log in">
                  <LogIn />
                  <span className="hidden sm:inline">Log in</span>
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Container and top offset only: each page owns its own vertical rhythm. */}
      <main id="main" className="container mx-auto flex-1 px-4 pt-6 md:px-8 md:pt-10">
        {children}
      </main>

      <ShopFooter isAuthenticated={session != null} />
    </div>
  );
}
