import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ArrowLeft, Fingerprint, KeyRound, ShieldCheck } from "lucide-react";

import { authOptions } from "@/lib/auth-options";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

const principles = [
  {
    icon: <Fingerprint />,
    title: "No email, no password",
    description: "Your identity is a key pair. The server only ever learns your public key.",
  },
  {
    icon: <KeyRound />,
    title: "Derived in this browser",
    description: "Seed phrase + passphrase derive your key locally. Neither leaves this device.",
  },
  {
    icon: <ShieldCheck />,
    title: "Nothing to recover, nothing to leak",
    description: "There is no reset link. Keep both the seed phrase and the passphrase safe.",
  },
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (session) redirect("/wallet");
  return (
    <main className="relative isolate grid min-h-screen w-full overflow-x-clip lg:grid-cols-2">
      {/* Brand panel (desktop only) */}
      <aside className="relative isolate hidden flex-col justify-between overflow-hidden border-r bg-card p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-32 -z-10 size-[32rem] rounded-full bg-primary/40 blur-3xl"
        />
        <Link
          href="/"
          className="w-fit rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Logo />
        </Link>
        <div className="max-w-md space-y-10">
          <div className="space-y-4">
            <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              Passwordless by design
            </span>
            <p className="font-serif text-4xl leading-tight font-semibold text-balance">
              Your key is your account.
            </p>
          </div>
          <ul className="space-y-6">
            {principles.map((principle) => (
              <li key={principle.title} className="flex gap-4">
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground [&_svg]:size-5"
                >
                  {principle.icon}
                </span>
                <div className="space-y-1">
                  <p className="font-semibold">{principle.title}</p>
                  <p className="text-sm text-pretty text-muted-foreground">
                    {principle.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="font-mono text-xs text-muted-foreground">Schnorr · secp256k1 · BIP39</p>
      </aside>

      {/* Form column */}
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <Link
            href="/"
            className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
          >
            <Logo />
          </Link>
          <Button variant="ghost" action="muted" size="sm" asChild>
            <Link href="/">
              <ArrowLeft />
              Back to store
            </Link>
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </main>
  );
}
