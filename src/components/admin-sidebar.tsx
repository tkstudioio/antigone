"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Package, Wallet } from "lucide-react";
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
import { Logo } from "./ui/logo";
import { useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import useProfileStore from "@/stores/profile";
import { useWalletStore } from "@/stores/wallet";

const adminLinks = [
  { label: "Dispute", href: "/disputes", icon: Package },
  { label: "Wallet", href: "/wallet", icon: Wallet },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const profileStore = useProfileStore();
  const walletStore = useWalletStore();

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
          <SidebarGroupLabel>Gestione</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminLinks.map(({ label, href, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(href)} tooltip={label}>
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
            profileStore.clear();
            walletStore.clear();
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
