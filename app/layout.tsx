import type { Metadata } from "next";
import { Archivo, Fraunces, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "WONK", "opsz"],
  weight: "variable",
  display: "swap",
});

const ui = Archivo({
  subsets: ["latin"],
  variable: "--font-ui",
  weight: ["400", "500", "600"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quorum — how independent is your fact check?",
  description:
    "Three models agreeing is one witness if they all read the same page. Quorum measures how independent its verifiers actually are, and prices the truth score by it. Every inference runs on the Gonka Network.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
