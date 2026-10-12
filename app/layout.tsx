import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoopSwap · A little loop goes a long way",
  description: "Find direct swaps and three-person exchanges in your campus community. Agree on one meetup and give useful items another life.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
