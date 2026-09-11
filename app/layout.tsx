import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./magi-part2.css";

export const metadata: Metadata = {
  title: "MAGI SYSTEM — NERV",
  description: "MAGI Supercomputer Deliberation Interface",
};

export const viewport: Viewport = {
  width: 1024,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
