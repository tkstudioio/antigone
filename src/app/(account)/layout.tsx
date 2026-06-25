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
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
          <div className="container flex items-center justify-between py-md">
            <Link href="/" className="visible md:invisible">
              <Icon className="h-8" />
            </Link>
            <SidebarTrigger className="md:hidden" />
          </div>
        </header>
        <main className="container mt-md space-y-lg">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
