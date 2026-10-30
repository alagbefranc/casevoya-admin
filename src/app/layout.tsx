import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { AdminApp } from "@/client/app";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Casevoya admin",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0d0d0d" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Erode headings (Casevoya type), served by Fontshare; Georgia is the fallback. */}
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=erode@500,600&display=swap" />
      </head>
      <body>
        <Suspense fallback={null}>
          <AdminApp>{children}</AdminApp>
        </Suspense>
      </body>
    </html>
  );
}
