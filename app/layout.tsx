import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SaveProvider } from "@/components/save/save-provider";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EmeraldDex — ROM hack dex, save reader & damage calculator",
  description:
    "Read your pokeemerald-expansion save, inspect your team & boxes, browse a dex that mirrors the ROM hack, and run damage calculations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background">
        <ThemeProvider>
          <SaveProvider>
            <SiteHeader />
            <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
            <Toaster richColors position="bottom-right" />
          </SaveProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
