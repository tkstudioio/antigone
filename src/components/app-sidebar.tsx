"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes, Package, ShoppingBag, ShoppingCart, Tag, Wallet } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import useProfileStore from "@/stores/profile";
import { useWalletStore } from "@/stores/wallet";
import { Logo } from "./ui/logo";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  matchPrefix?: boolean;
};

const shopLinks: NavItem[] = [{ label: "Products", href: "/products", icon: Package }];

const dashboardLinks: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Wallet },
  { label: "Stocks", href: "/stocks", icon: Boxes, matchPrefix: true },
  { label: "Cart", href: "/cart", icon: ShoppingCart },
  { label: "Purchases", href: "/orders/buying", icon: ShoppingBag, matchPrefix: true },
  { label: "Sales", href: "/orders/selling", icon: Tag, matchPrefix: true },
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

  return (
    <Sidebar
      side="right"
      collapsible={isMobile ? "offcanvas" : "none"}
      className="md:sticky md:top-0 md:h-svh"
    >
      <SidebarHeader>
        <Logo className="h-5" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Shop</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {shopLinks.map(({ label, href, icon: Icon, matchPrefix }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(href, pathname, matchPrefix)}
                    tooltip={label}
                  >
                    <Link href={href}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dashboardLinks.map(({ label, href, icon: Icon, matchPrefix }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(href, pathname, matchPrefix)}
                    tooltip={label}
                  >
                    <Link href={href}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {session?.user?.name && (
          <p className="px-2 text-xs text-muted-foreground truncate group-data-[collapsible=icon]:hidden">
            {session.user.name}
          </p>
        )}
        <Button
          size="sm"
          action={"negative"}
          onClick={() => {
            useProfileStore.getState().clear();
            useWalletStore.getState().clear();
            queryClient.removeQueries({ queryKey: ["wallet"] });
            signOut({ callbackUrl: "/" });
          }}
        >
          <span className="group-data-[collapsible=icon]:hidden">Log out</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
