"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTheme } from "next-themes";
import {
  Boxes,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Package,
  ShoppingBag,
  ShoppingCart,
  Sun,
  Tag,
  Wallet,
} from "lucide-react";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useCart } from "@/hooks/cart";
import { useIsMobile } from "@/hooks/use-mobile";
import useProfileStore from "@/stores/profile";
import { useWalletStore } from "@/stores/wallet";
import { Identicon } from "./identicon";
import { Logo } from "./ui/logo";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  matchPrefix?: boolean;
  /** Renders the live cart count as a `SidebarMenuBadge`. */
  badge?: "cart";
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

/**
 * Navigation grouped by what the user is doing, not by which route group serves it: browsing the
 * catalogue, the buy side, the sell side, the account itself. The footer holds only the identity,
 * with log out and the theme behind its menu.
 */
const navGroups: NavGroup[] = [
  {
    label: "Browse",
    items: [
      { label: "Products", href: "/products", icon: Package },
      { label: "Cart", href: "/cart", icon: ShoppingCart, badge: "cart" },
    ],
  },
  {
    label: "Buying",
    items: [{ label: "Purchases", href: "/orders/buying", icon: ShoppingBag, matchPrefix: true }],
  },
  {
    label: "Selling",
    items: [
      { label: "Stocks", href: "/stocks", icon: Boxes, matchPrefix: true },
      { label: "Sales", href: "/orders/selling", icon: Tag, matchPrefix: true },
    ],
  },
  {
    label: "Account",
    items: [{ label: "Wallet", href: "/dashboard", icon: Wallet }],
  },
];

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function isActive(href: string, pathname: string, matchPrefix?: boolean) {
  if (matchPrefix) return pathname === href || pathname.startsWith(href + "/");
  return pathname === href;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const cartQuery = useCart();
  const { theme, setTheme } = useTheme();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const cartCount = cartQuery.data?.products.reduce((sum, p) => sum + p.totalQuantity, 0) ?? 0;

  function handleSignOut() {
    useProfileStore.getState().clear();
    useWalletStore.getState().clear();
    queryClient.removeQueries({ queryKey: ["wallet"] });
    signOut({ callbackUrl: "/" });
  }

  return (
    // `side` only takes effect on mobile, where the sidebar is an offcanvas sheet: it opens from the
    // right, next to its trigger in the header. On desktop `collapsible="none"` renders a plain
    // column in normal flow, so DOM order puts it on the left of the inset. There it floats: a
    // sticky, rounded panel inset from the viewport edges (`variant="floating"` is ignored by
    // `collapsible="none"`, so the same look is applied here).
    <Sidebar
      side="right"
      collapsible={isMobile ? "offcanvas" : "none"}
      className="md:sticky md:top-3 md:my-3 md:ml-3 md:h-[calc(100svh-1.5rem)] md:rounded-xl md:shadow-sm md:ring-1 md:ring-sidebar-border"
    >
      <SidebarHeader className="px-4 py-6">
        <Link
          href="/"
          aria-label="Antigone — home"
          className="w-fit rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Logo className="h-5" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="font-mono tracking-widest uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavMenuItem
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    cartCount={cartCount}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-2">
        {session?.user && (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="h-14 gap-3 data-[state=open]:bg-sidebar-accent"
                  >
                    <Identicon value={session.user.pubkey} size={40} />
                    <div className="grid min-w-0 flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-semibold">
                        {session.user.username}
                      </span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {session.user.pubkey.slice(0, 8)}…{session.user.pubkey.slice(-6)}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="end"
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
                >
                  <DropdownMenuLabel>Theme</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={theme ?? "dark"} onValueChange={setTheme}>
                    {themeOptions.map(({ value, label, icon: Icon }) => (
                      <DropdownMenuRadioItem key={value} value={value}>
                        <Icon />
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setLogoutOpen(true)}>
                    <LogOut />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        )}

        <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Log out of Antigone?</AlertDialogTitle>
              <AlertDialogDescription>
                Your key is cleared from this browser and the wallet disconnects. Your vault stays
                on this device, so you will need your passphrase to log back in.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel action="muted">Stay logged in</AlertDialogCancel>
              <AlertDialogAction action="negative" onClick={handleSignOut}>
                Log out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavMenuItem({
  item,
  pathname,
  cartCount,
}: {
  item: NavItem;
  pathname: string;
  cartCount: number;
}) {
  const { label, href, icon: Icon, matchPrefix, badge } = item;
  const active = isActive(href, pathname, matchPrefix);
  const showCartBadge = badge === "cart" && cartCount > 0;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>
        <Link href={href} aria-current={active ? "page" : undefined}>
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      {showCartBadge && (
        <SidebarMenuBadge className="border border-border bg-muted">
          <span aria-hidden>{cartCount.toLocaleString("en-US")}</span>
          <span className="sr-only" role="status" aria-atomic="true">
            {cartCount.toLocaleString("en-US")} {cartCount === 1 ? "item" : "items"} in cart
          </span>
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}
