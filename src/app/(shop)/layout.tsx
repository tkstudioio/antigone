import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import { LogIn, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CartPopover } from "@/components/cart-popover";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (session?.user.isAdmin) {
    redirect("/disputes");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="w-full bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 flex">
        <div className="container mx-auto flex py-lg items-center justify-between">
          <div className="flex items-center gap-sm">
            <Link href={"/"}>
              <Icon className="h-8" />
            </Link>

            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink href="/products">Products</NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
          <div className="flex items-center gap-sm">
            {session ? (
              <>
                <CartPopover />
                <Button variant={"ghost"} asChild>
                  <Link href="/dashboard">
                    <Wallet />
                  </Link>
                </Button>
              </>
            ) : (
              <Button variant={"ghost"} action={"muted"} asChild>
                <Link href="/login">
                  Log in
                  <LogIn />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto space-y-xl mt-md ">{children}</main>
    </div>
  );
}
