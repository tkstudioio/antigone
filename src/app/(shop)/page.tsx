import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { H1, Large, P } from "@/components/ui/typography";
import {
  Fingerprint,
  KeyRound,
  Bitcoin,
  UserPlus,
  ShoppingCart,
  PackageCheck,
  ShieldCheck,
  Lock,
  Scale,
  Zap,
  ArrowUpFromLine,
} from "lucide-react";
import Link from "next/link";

export default async function Homepage() {
  return (
    <div className="space-y-xl pb-xl">
      {/* Hero */}
      <section className="flex flex-col items-center gap-lg py-xl text-center">
        <div className="max-w-large space-y-md">
          <H1 className="text-balance text-5xl">Buy and sell digital products in full privacy</H1>
          <P className="text-pretty text-lg text-muted">
            A peer-to-peer marketplace for license keys and digital goods. No email, no password —
            just your key. Every order is protected by Bitcoin escrow.
          </P>
        </div>
        <div className="flex w-full max-w-medium flex-col gap-md sm:flex-row">
          <Button size="lg" asChild className="flex-1">
            <Link href="/products">Browse catalog</Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="flex-1">
            <Link href="/login">Start selling</Link>
          </Button>
        </div>
      </section>

      {/* What it is */}
      <section className="space-y-lg">
        <SectionHeading
          eyebrow="What it is"
          title="A marketplace built around your keys"
          subtitle="Antigone connects buyers and sellers of digital products without ever asking for personal data. Your identity is a cryptographic key you control — nothing more."
        />
        <div className="grid gap-md sm:grid-cols-3">
          <Feature
            icon={<Fingerprint />}
            title="Passwordless identity"
            description="Sign in with a Schnorr signature derived from your recovery phrase. No accounts to leak, nothing to phish."
          />
          <Feature
            icon={<KeyRound />}
            title="Digital goods"
            description="Buy and sell software license keys and digital products, delivered instantly the moment payment clears."
          />
          <Feature
            icon={<Bitcoin />}
            title="Bitcoin native"
            description="Prices and payments are denominated in satoshi, settled over the Arkade network for fast, low-fee transfers."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="space-y-lg">
        <SectionHeading
          eyebrow="How it works"
          title="From key to delivery in three steps"
          subtitle="No onboarding forms, no waiting. Create your key in the browser and start trading right away."
        />
        <div className="grid gap-md sm:grid-cols-3">
          <Step
            step={1}
            icon={<UserPlus />}
            title="Create your key"
            description="Generate a recovery phrase locally. It derives your identity and your wallet — and never leaves your browser."
          />
          <Step
            step={2}
            icon={<ShoppingCart />}
            title="Reserve & pay"
            description="Add products to your cart, reserve them, and pay in satoshi. Funds go straight into escrow."
          />
          <Step
            step={3}
            icon={<PackageCheck />}
            title="Receive instantly"
            description="The license key is released to you on payment. Confirm delivery and the seller gets paid."
          />
        </div>
      </section>

      {/* Funding */}
      <section className="space-y-lg">
        <SectionHeading
          eyebrow="Your funds"
          title="Top up or cash out whenever you want"
          subtitle="Your balance is always yours to move. Add or withdraw funds at any time, with no lock-up and no intermediary holding your money."
        />
        <div className="grid gap-md sm:grid-cols-2">
          <Feature
            icon={<Zap />}
            title="Lightning swap"
            description="Move funds in and out instantly over the Lightning Network — ideal for everyday amounts, settled in seconds."
          />
          <Feature
            icon={<ArrowUpFromLine />}
            title="On-chain offboard"
            description="Withdraw straight to any Bitcoin address with an on-chain offboard whenever you want to settle on the base layer."
          />
        </div>
      </section>

      {/* Escrow */}
      <section>
        <Card className="space-y-lg p-lg">
          <SectionHeading
            eyebrow="Escrow"
            title="Every trade is protected"
            subtitle="Payments are never sent directly to the seller. They are locked in a Bitcoin escrow until the buyer receives the goods — protecting both sides of the trade."
          />
          <div className="grid gap-md sm:grid-cols-3">
            <Feature
              variant="ghost"
              icon={<Lock />}
              title="Funds held safely"
              description="When you pay, satoshi are held in a secured escrow address instead of going straight to the seller."
            />
            <Feature
              variant="ghost"
              icon={<ShieldCheck />}
              title="Released on delivery"
              description="The seller is paid only once the order is fulfilled and delivery is confirmed by the buyer."
            />
            <Feature
              variant="ghost"
              icon={<Scale />}
              title="Disputes resolved"
              description="If something goes wrong, the order chat and platform moderation step in to settle the dispute fairly."
            />
          </div>
          <div className="flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
            <Large>Ready to trade with confidence?</Large>
            <div className="flex gap-md">
              <Button asChild>
                <Link href="/products">Browse catalog</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/login">Get started</Link>
              </Button>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="max-w-large space-y-sm">
      <span className="text-sm font-semibold tracking-widest text-primary uppercase">
        {eyebrow}
      </span>
      <h2 className="text-3xl font-bold text-balance">{title}</h2>
      <P className="text-pretty text-muted">{subtitle}</P>
    </div>
  );
}

function Feature({
  icon,
  title,
  description,
  variant = "solid",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  variant?: "solid" | "ghost";
}) {
  return (
    <Card variant={variant} className="h-full">
      <CardHeader className="gap-md">
        <span className="flex size-10 items-center justify-center rounded-card bg-primary/20 text-primary [&_svg]:size-5">
          {icon}
        </span>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted">{description}</CardContent>
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
    <Card className="h-full">
      <CardHeader className="gap-md">
        <div className="flex items-center justify-between">
          <span className="flex size-10 items-center justify-center rounded-card bg-primary/20 text-primary [&_svg]:size-5">
            {icon}
          </span>
          <span className="text-4xl font-bold text-primary/30">{step}</span>
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted">{description}</CardContent>
    </Card>
  );
}
