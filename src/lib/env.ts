import { z } from "zod";

/** Treat empty-string env vars (common in .env files) as absent. */
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const PublicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  // PostHog (optional — analytics still degrades gracefully if absent)
  NEXT_PUBLIC_POSTHOG_KEY: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  NEXT_PUBLIC_POSTHOG_HOST: z.preprocess(emptyToUndefined, z.string().url().optional()),
});

const ServerSchema = PublicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(10).optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  QR_SECRET: z.string().min(16),
  COOKIE_SECRET: z.string().min(16),
  // PostHog server-side query API (optional)
  POSTHOG_PERSONAL_API_KEY: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  POSTHOG_PROJECT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
});

type Env = z.infer<typeof ServerSchema>;

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isProduction =
  process.env.NODE_ENV === "production" && !isBuildPhase;

function getEnv(): Env {
  const raw = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    QR_SECRET: process.env.QR_SECRET,
    COOKIE_SECRET: process.env.COOKIE_SECRET,
    POSTHOG_PERSONAL_API_KEY: process.env.POSTHOG_PERSONAL_API_KEY,
    POSTHOG_PROJECT_ID: process.env.POSTHOG_PROJECT_ID,
  };

  const result = ServerSchema.safeParse(raw);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");

    if (isBuildPhase) {
      process.stderr.write(
        `[env] WARNING: Missing or invalid environment variables during build: ${missing} — Supabase calls will fail if reached at build time.\n`
      );
      return {
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        QR_SECRET: "",
        COOKIE_SECRET: "",
      } as Env;
    }

    if (isProduction) {
      throw new Error(
        `Missing or invalid environment variables: ${missing}`
      );
    }

    // development
    throw new Error(
      `Missing or invalid environment variables: ${missing}\n` +
        `Copy .env.local.example to .env.local and fill in the values.`
    );
  }
  return result.data;
}

export const env: Env = getEnv();
