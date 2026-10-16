import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Icon } from "@/components/ui/icon";
import Link from "next/link";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  if (session.user.isAdmin) {
    redirect("/disputes");
  }

  return (
    <SidebarProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-sm focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-3 focus:ring-ring/50"
      >
        Skip to main content
      </a>
      <AppSidebar />
      <SidebarInset>
        {/* Mobile only: on desktop the sidebar is always visible and carries the logo. */}
        <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Link
              href="/"
              aria-label="Antigone — home"
              className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Icon className="h-8" />
            </Link>
            <SidebarTrigger />
          </div>
        </header>
        {/* Capped and centred on the inset's own width: `container` follows viewport breakpoints,
            which ignore the sidebar's width. Pages narrower than the cap centre themselves too. */}
        <main id="main" className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 md:px-8 md:py-10">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
