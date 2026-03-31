import type { Metadata } from "next";
import { Press_Start_2P, Space_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});
const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
});
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Claudio Control",
  description: "Dashboard for monitoring and managing Claude Code sessions",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${pressStart.variable} ${spaceMono.variable} ${geistSans.variable} ${geistMono.variable} antialiased bg-[#050508] text-zinc-100 min-h-screen bg-grid`}
      >
        <div className="h-screen flex flex-col overflow-hidden">
          {/* Draggable title bar for Electron (invisible in browser) */}
          <div className="titlebar-drag h-8 fixed top-0 left-0 right-0 z-50" />
          <div className="flex-1 flex flex-col min-h-0">{children}</div>
        </div>
      </body>
    </html>
  );
}
