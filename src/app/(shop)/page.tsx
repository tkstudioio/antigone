import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  ArrowRight,
  ArrowUpFromLine,
  Fingerprint,
  KeyRound,
  Lock,
  LockKeyhole,
  PackageCheck,
  Scale,
  ShieldCheck,
  ShoppingCart,
  UserPlus,
  Wallet,
  Zap,
} from "lucide-react";

import { authOptions } from "@/lib/auth-options";
import { queryProducts } from "@/lib/backend/query-products";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { H1, P } from "@/components/ui/typography";
import { Satoshi } from "@/components/icons/satoshi";
import { ProductTile } from "@/components/product-tile";

const FEATURED_COUNT = 4;

export default async function Homepage() {
  const [session, products] = await Promise.all([
    getServerSession(authOptions),
    queryProducts({ withStock: true, pageSize: 100 }),
  ]);

  // Best-rated in-stock products first; unrated ones go last.
  const featured = [...products.data]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, FEATURED_COUNT);

  const secondaryCta = session
    ? { href: "/stocks", label: "Sell your keys" }
    : { href: "/create", label: "Create your key" };

  return (
    <div className="space-y-24 pb-24">
      {/* Hero */}
      <section className="relative isolate grid items-center overflow-x-clip gap-12 py-8 lg:grid-cols-2 lg:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -z-10 size-[28rem] -translate-x-1/2 rounded-full bg-primary/40 blur-3xl lg:left-1/4"
        />
        <div className="space-y-8">
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-positive" aria-hidden />
            Bitcoin · Ark escrow · No passwords
          </span>
          <H1 className="text-5xl leading-tight text-balance lg:text-6xl">
            Trade license keys without trusting anyone.
          </H1>
          <P className="max-w-xl text-lg text-pretty text-muted-foreground">
            A peer-to-peer marketplace where your identity is a key you hold, every payment waits in
            an escrow no single party can move, and your browser verifies what the server tells it.
          </P>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/products">
                Browse catalog
                <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
            </Button>
          </div>
        </div>
        <EscrowIllustration />
      </section>

      {/* Featured listings */}
      {featured.length > 0 && (
        <section aria-labelledby="featured-heading" className="space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              id="featured-heading"
              eyebrow="In stock now"
              title="Top-rated in the catalog"
            />
            <Button variant="ghost" action="muted" asChild>
              <Link href="/products">
                View all products
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((product) => (
              <li key={product.id}>
                <ProductTile product={product} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Principles */}
      <section aria-labelledby="principles-heading" className="space-y-8">
        <SectionHeading
          id="principles-heading"
          eyebrow="Why Antigone"
          title="Built so you never have to take our word for it"
          subtitle="The platform is designed around one assumption: the server could be wrong, or worse. Everything that matters is enforced by cryptography, in your browser."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Principle
            icon={<Fingerprint />}
            title="Your key is your account"
            description="No email, no password, nothing to leak. You sign in by signing a challenge; your recovery phrase and passphrase never leave your browser."
          />
          <Principle
            icon={<Lock />}
            title="An escrow nobody controls alone"
            description="Every order gets its own escrow on Ark, a Bitcoin layer-2. Buyer, seller, arbiter, operator: none of them can move the funds alone."
          />
          <Principle
            icon={<KeyRound />}
            title="Codes only you can read"
            description="License codes and chat messages are end-to-end encrypted to the people in the trade. The server stores ciphertext it cannot open."
          />
          <Principle
            icon={<ShieldCheck />}
            title="Don't trust, verify"
            description="Your browser re-checks every signature, price and verdict the server returns. If anything was tampered with, paying and signing are blocked."
          />
        </div>
      </section>

      {/* How a trade works */}
      <section aria-labelledby="how-heading" className="space-y-8">
        <SectionHeading
          id="how-heading"
          eyebrow="How a trade works"
          title="From your key to your code in five steps"
          subtitle="No sign-up form and no waiting. Your sats move only when both sides agree."
        />
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Step
            step={1}
            icon={<UserPlus />}
            title="Create your key"
            description="A recovery phrase plus your passphrase derive your identity, in the browser. The server only sees your public key."
          />
          <Step
            step={2}
            icon={<ShoppingCart />}
            title="Reserve"
            description="Add keys to your cart: they are held for you for 10 minutes while you check out."
          />
          <Step
            step={3}
            icon={<LockKeyhole />}
            title="Pay into escrow"
            description="Checkout opens one escrow per seller. Your sats are locked there, not sent to the seller."
          />
          <Step
            step={4}
            icon={<PackageCheck />}
            title="Receive the code"
            description="The seller confirms and encrypts the license code to your key. Only you can read it."
          />
          <Step
            step={5}
            icon={<Wallet />}
            title="Release"
            description="You and the seller co-sign the release. The seller is paid and the trade is done."
          />
        </ol>
        <div className="flex flex-col gap-4 rounded-md border border-dashed p-6 sm:flex-row sm:items-start">
          <IconChip icon={<Scale />} />
          <div className="space-y-1">
            <p className="font-semibold">Something went wrong?</p>
            <P className="text-pretty text-muted-foreground">
              Either side can open a dispute. The admin reviews the order and rules a verdict, but
              still cannot take the funds: the party ruled in favour settles the escrow, with the
              arbiter co-signing from their own browser.
            </P>
          </div>
        </div>
      </section>

      {/* Wallet */}
      <section
        aria-labelledby="wallet-heading"
        className="grid gap-8 lg:grid-cols-2 lg:items-center"
      >
        <SectionHeading
          id="wallet-heading"
          eyebrow="Your wallet"
          title="Your sats stay yours"
          subtitle="A built-in Arkade wallet, derived from the same key you sign in with. No custodian, no lock-up: move funds in and out whenever you want."
        />
        <Card className="divide-y space-y-0 py-0">
          <WalletRow
            icon={<Zap />}
            title="Instant Ark transfers"
            description="Pay escrows and send to any Ark address off-chain, in seconds, for a tiny fee."
          />
          <WalletRow
            icon={<ArrowUpFromLine />}
            title="On-chain offboard"
            description="Withdraw to any Bitcoin address whenever you want to settle on the base layer."
          />
          <WalletRow
            icon={<Satoshi />}
            title="Priced in satoshi"
            description="Every price is a whole number of sats. No fiat conversion, no decimals, no surprises."
          />
        </Card>
      </section>

      {/* Closing CTA */}
      <section>
        <Card className="relative isolate space-y-0 px-6 py-12 text-center sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-primary/30 to-transparent"
          />
          <div className="mx-auto max-w-xl space-y-6">
            <h2 className="font-serif text-3xl font-semibold text-balance">
              Ready to trade on your own terms?
            </h2>
            <P className="text-pretty text-muted-foreground">
              Browse the catalog without an account. When you are ready to buy or sell, create your
              key in seconds.
            </P>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/products">Browse catalog</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
              </Button>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

/** Static illustration of an order escrow and its spend paths (example data, not a live order). */
function EscrowIllustration() {
  return (
    <figure className="mx-auto w-full max-w-md lg:mr-0">
      <Card className="space-y-6 p-6 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <span className="font-mono text-xs text-muted-foreground">escrow · order #1042</span>
          <Badge action="positive" variant="outline" className="text-xs">
            Funds locked
          </Badge>
        </div>
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-4xl font-bold">
            <Satoshi className="size-8" aria-hidden />
            25,000
            <span className="sr-only">sats</span>
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">tark1qz8v…m4x7f3k</p>
        </div>
        <ul className="space-y-3 border-t pt-6">
          <SpendPath label="Release" signers="buyer + seller" />
          <SpendPath label="Dispute" signers="arbiter + winning side" />
          <SpendPath label="Exit" signers="after timelock, no operator" />
        </ul>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          No single key can move these funds.
        </p>
      </Card>
      <figcaption className="sr-only">
        Example of an order escrow: the funds can be released only by buyer and seller together, by
        the arbiter with the side it ruled for, or after a timelock without the operator.
      </figcaption>
    </figure>
  );
}

function SpendPath({ label, signers }: { label: string; signers: string }) {
  return (
    <li className="flex items-center justify-between gap-4 text-sm">
      <span className="font-medium">{label}</span>
      <span className="font-mono text-xs text-muted-foreground">{signers}</span>
    </li>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  subtitle,
}: {
  id: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="max-w-xl space-y-3">
      <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
        {eyebrow}
      </span>
      <h2 id={id} className="scroll-mt-24 font-serif text-3xl font-semibold text-balance">
        {title}
      </h2>
      {subtitle && <P className="text-pretty text-muted-foreground">{subtitle}</P>}
    </div>
  );
}

function IconChip({ icon }: { icon: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground [&_svg]:size-5"
    >
      {icon}
    </span>
  );
}

function Principle({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="gap-4">
        <IconChip icon={icon} />
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-pretty text-muted-foreground">{description}</CardContent>
    </Card>
  );
}

function Step({
  step,
  icon,
  title,
  description,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="space-y-3 border-t-2 border-primary pt-4">
      <div className="flex items-center justify-between">
        <IconChip icon={icon} />
        <span className="font-mono text-sm text-muted-foreground" aria-hidden>
          {String(step).padStart(2, "0")}
        </span>
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-pretty text-muted-foreground">{description}</p>
    </li>
  );
}

function WalletRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 p-6">
      <IconChip icon={icon} />
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-pretty text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
