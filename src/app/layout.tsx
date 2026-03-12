import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

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
  title: "Claude Control",
  description: "Dashboard for monitoring Claude Code sessions",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
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
        className={`${geistSans.variable} ${geistMono.variable} font-[family-name:var(--font-geist-sans)] antialiased bg-[#050508] text-zinc-100 min-h-screen bg-grid`}
      >
        <div className="min-h-screen">
          {/* Draggable title bar for Electron (invisible in browser) */}
          <div className="titlebar-drag h-8 fixed top-0 left-0 right-0 z-50" />
          <main className="max-w-[1400px] mx-auto px-6 pt-10 pb-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
