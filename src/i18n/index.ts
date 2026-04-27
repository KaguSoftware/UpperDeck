import type { Locale } from "./config";
import type { Messages } from "./en";
import en from "./en";
import tr from "./tr";

const messages: Record<Locale, Messages> = { en, tr };

export function getMessages(locale: Locale): Messages {
  return messages[locale] ?? messages.en;
}

export type { Messages, Locale };
