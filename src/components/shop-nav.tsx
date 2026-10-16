"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";

type ShopNavItem = {
  label: string;
  href: string;
  /** Route this item owns. Omitted for in-page anchors, which never claim an active state. */
  match?: string;
};

/**
 * Public storefront destinations. The anchors target the home page's section headings, which carry
 * a `scroll-mt` so the sticky header never covers them.
 */
const SHOP_NAV: ShopNavItem[] = [
  { label: "Products", href: "/products", match: "/products" },
  { label: "How it works", href: "/#how-heading" },
];

export function ShopNav() {
  const pathname = usePathname();

  return (
    <NavigationMenu viewport={false}>
      <NavigationMenuList>
        {SHOP_NAV.map(({ label, href, match }) => {
          const active = match != null && (pathname === match || pathname.startsWith(match + "/"));

          return (
            <NavigationMenuItem key={href}>
              <NavigationMenuLink asChild active={active}>
                <Link href={href} aria-current={active ? "page" : undefined}>
                  {label}
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
