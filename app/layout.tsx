import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/* Gonka's own type system: Plus Jakarta Sans for headlines, Inter for body,
   JetBrains Mono for anything that is a machine identifier — node numbers,
   request IDs, hashes. See gonka-colors.md. */
const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

const ui = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NEFF — how independent is your fact check?",
  description:
    "Nine models agreeing is not nine opinions. NEFF measures the effective number of independent voices behind an AI consensus — N_eff, Kish's effective sample size — and prices the truth score by it. Every inference runs on the Gonka Network.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
