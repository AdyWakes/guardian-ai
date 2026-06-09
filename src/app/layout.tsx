import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guardian AI - AI Safety Companion",
  description: "An AI safety companion that thinks before emergencies become disasters.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        {children}
      </body>
    </html>
  );
}
