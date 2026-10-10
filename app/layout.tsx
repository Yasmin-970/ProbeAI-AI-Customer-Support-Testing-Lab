import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProbeAI — Customer Support Assistant Testing Lab",
  description: "Test your support assistant, inspect evidence-backed findings, and compare improvements before release.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
