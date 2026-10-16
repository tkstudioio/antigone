import type { Metadata } from "next";
import { Cinzel, Noto_Sans, Noto_Sans_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppProviders } from "@/providers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

// Brand typography: Noto Sans for the UI, Noto Sans Mono for keys/addresses, Cinzel for display
// headings. globals.css maps them onto --font-sans / --font-mono / --font-serif.
const notoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-noto-sans" });
const notoSansMono = Noto_Sans_Mono({ subsets: ["latin"], variable: "--font-noto-sans-mono" });
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  title: {
    default: "Antigone",
    template: "%s · Antigone",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        notoSans.variable,
        notoSansMono.variable,
        cinzel.variable,
        "font-sans"
      )}
    >
      <body className="min-h-screen bg-background">
        <AppProviders session={session}>{children}</AppProviders>
      </body>
    </html>
  );
}
