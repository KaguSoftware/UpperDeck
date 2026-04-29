import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync("./.env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const sk = env.SUPABASE_SERVICE_ROLE_KEY;

const r = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: "POST",
  headers: { apikey: sk, Authorization: `Bearer ${sk}`, "Content-Type": "application/json" },
  body: JSON.stringify({ sql: "select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'orders'" }),
});
console.log("status:", r.status);
console.log(await r.text());
