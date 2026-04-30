import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PlayerShell } from "@/components/PlayerShell";
import { TopNav } from "@/components/TopNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Home",
  description: "Home",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col pt-14 font-sans">
        <TopNav />
        <PlayerShell>{children}</PlayerShell>
      </body>
    </html>
  );
}
