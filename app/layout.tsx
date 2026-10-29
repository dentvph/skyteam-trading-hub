import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sky Team Trading Hub — Lead Manager",
  description: "Private lead management for Sky Team Trading Hub.",
  icons: {
    icon: "/assets/sky-logo.png",
    shortcut: "/assets/sky-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
