import { PhoneMenu } from "@/components/PhoneMenu/components";
import { getMessages } from "@/i18n";
import { locales, defaultLocale } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { getPublicMenu } from "@/lib/menu/queries";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const lang: Locale = locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale;
  const [messages, { categories, items }] = await Promise.all([
    Promise.resolve(getMessages(lang)),
    getPublicMenu(lang),
  ]);

  return <PhoneMenu messages={messages} categories={categories} items={items} />;
}
