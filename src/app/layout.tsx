import type { Metadata } from "next";
import { Archivo, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Booth",
  description: "One call, radioed down. A fantasy football assistant that respects your time budget."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plex.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-rule bg-surface">
          <div className="mx-auto flex max-w-5xl items-baseline gap-6 px-4 py-3">
            <Link href="/dashboard" className="font-display text-xl font-extrabold tracking-tight">
              Booth
            </Link>
            <nav className="flex gap-5 text-sm text-muted">
              <Link href="/dashboard" className="hover:text-ink">This week</Link>
              <Link href="/draft" className="hover:text-ink">Draft</Link>
              <Link href="/requests" className="hover:text-ink">Ideas</Link>
              <Link href="/settings" className="hover:text-ink">Settings</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
