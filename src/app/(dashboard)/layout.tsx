import type { Metadata } from "next";
import { Bowlby_One, Inter } from "next/font/google";
import "../globals.css";

const bowlbyOne = Bowlby_One({
  variable: "--font-bowlby-one",
  subsets: ["latin"],
  weight: "400",
});

const inter = Inter({
  variable: "--font-inter-next",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Upperdeck · Admin",
  description: "Menu management",
  robots: { index: false, follow: false },
};

export default function DashboardRoot({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bowlbyOne.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-ink font-ui">{children}</body>
    </html>
  );
}
