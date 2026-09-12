import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth-options";

import { Logo } from "@/components/ui/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (session) redirect("/wallet");
  return (
    <main className="relative flex min-h-screen w-screen flex-col items-center justify-center overflow-hidden px-4 py-16">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4">
          <Logo />
        </div>
        {children}
      </div>
    </main>
  );
}
