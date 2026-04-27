import { z } from "zod";

const PublicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

const ServerSchema = PublicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
});

type Env = z.infer<typeof ServerSchema>;

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isProduction =
  process.env.NODE_ENV === "production" && !isBuildPhase;

function getEnv(): Env {
  const raw = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
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
