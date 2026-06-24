import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { Metadata } from "next";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Deadline Guardian AI",
  description: "Sophisticated AI-powered deadline protector and task strategist.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#08090b] text-[#f3f4f6] min-h-screen antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
        <div className="ambient-glow" />
        <div className="ambient-glow-purple" />
        {children}
      </body>
    </html>
  );
}
