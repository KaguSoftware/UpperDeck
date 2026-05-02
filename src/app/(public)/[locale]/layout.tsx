import type { Metadata } from "next";
import { Teko, Inter } from "next/font/google";
import "../../globals.css";
import { locales, defaultLocale } from "@/i18n/config";
import type { Locale } from "@/i18n/config";

const teko = Teko({
  variable: "--font-bowlby-one",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter-next",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Upperdeck American Diner",
  description: "Burgers, waffles & whatever else.",
  icons: { icon: "/upperdeck-logo.png" },
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const lang = locales.includes(locale as Locale) ? locale : defaultLocale;

  return (
    <html lang={lang} className={`${teko.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="no-scroll">{children}</body>
    </html>
  );
}
