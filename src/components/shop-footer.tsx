import Link from "next/link";

import { Logo } from "@/components/ui/logo";

type FooterLink = { label: string; href: string };

const browseLinks: FooterLink[] = [
  { label: "Products", href: "/products" },
  { label: "How a trade works", href: "/#how-heading" },
  { label: "Why Antigone", href: "/#principles-heading" },
];

const signedOutLinks: FooterLink[] = [
  { label: "Log in", href: "/login" },
  { label: "Create your key", href: "/create" },
  { label: "Restore an account", href: "/restore" },
];

const signedInLinks: FooterLink[] = [
  { label: "Wallet", href: "/dashboard" },
  { label: "Cart", href: "/cart" },
  { label: "Purchases", href: "/orders/buying" },
  { label: "Sales", href: "/orders/selling" },
  { label: "Stocks", href: "/stocks" },
];

/**
 * Storefront footer. Every link points at a route that exists — there are no legal or docs pages to
 * link yet, so the bottom line carries the plain-language guarantees instead.
 */
export function ShopFooter({ isAuthenticated }: { isAuthenticated: boolean }) {
  const accountLinks = isAuthenticated ? signedInLinks : signedOutLinks;

  return (
    <footer className="mt-24 border-t bg-card/30">
      <div className="container mx-auto grid gap-10 px-4 py-12 md:grid-cols-[2fr_1fr_1fr] md:px-8">
        <div className="space-y-4">
          <Logo className="h-5" />
          <p className="max-w-sm text-sm text-pretty text-muted-foreground">
            A peer-to-peer marketplace for license keys. Your identity is a key you hold, and every
            payment waits in an escrow no single party can move.
          </p>
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-positive" aria-hidden />
            Bitcoin · Ark escrow · No passwords
          </span>
        </div>

        <FooterColumn title="Browse" links={browseLinks} />
        <FooterColumn
          title={isAuthenticated ? "Your account" : "Get started"}
          links={accountLinks}
        />
      </div>

      <div className="border-t">
        <div className="container mx-auto flex flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-8">
          <p>© {new Date().getFullYear()} Antigone</p>
          <p>Non-custodial: keys and payments never leave your control.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <nav aria-label={title} className="space-y-3">
      <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{title}</p>
      <ul className="space-y-2">
        {links.map(({ label, href }) => (
          <li key={href}>
            <Link
              href={href}
              className="rounded-sm text-sm text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
