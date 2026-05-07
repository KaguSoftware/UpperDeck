import { requireRole } from "@/lib/auth/require-session";
import { getAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "../_components";
import { SetRoleButton } from "../_submit-buttons";
import { setRole } from "./actions";
import { RoleToggle } from "./_role-toggle";
import { InviteForm } from "./_invite-form";
import { RemoveButton } from "./_remove-button";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { user: actor } = await requireRole("owner");

  let rows: {
    id: string;
    email: string;
    created_at: string;
    profile: { id: string; role: string; display_name: string | null } | null;
  }[] = [];
  let configError: string | null = null;

  try {
    const admin = getAdminClient();
    const [{ data: list, error: listErr }, { data: profiles, error: profErr }] =
      await Promise.all([
        admin.auth.admin.listUsers({ perPage: 200 }),
        admin.from("profiles").select("id, role, display_name"),
      ]);

    if (listErr) throw new Error(listErr.message);
    if (profErr) throw new Error(profErr.message);

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    rows = (list?.users ?? [])
      .map((u) => ({
        id: u.id,
        email: u.email ?? "—",
        created_at: u.created_at,
        profile: profileById.get(u.id) ?? null,
      }))
      .sort((a, b) => (a.email < b.email ? -1 : 1));
  } catch (err) {
    configError = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <>
      <PageHeader
        title="Kullanıcılar"
        subtitle={configError ? "yapılandırma hatası" : `${rows.length} hesap`}
      />

      {/* Role description cards */}
      <div className="flex gap-3 max-w-2xl mb-8 flex-wrap">
        <div className="flex-1 min-w-[160px] bg-green text-bg px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1L10.2 5.5L15 6.3L11.5 9.7L12.4 14.5L8 12.1L3.6 14.5L4.5 9.7L1 6.3L5.8 5.5L8 1Z" />
            </svg>
            <span className="font-bowlby uppercase text-[15px]">Sahip</span>
          </div>
          <p className="font-ui text-[11px] opacity-70">
            Tam erişim. Personel davet eder, rolleri yönetir, her şeyi kontrol eder.
          </p>
        </div>
        <div className="flex-1 min-w-[160px] bg-white border-2 border-green px-4 py-3">
          <div className="flex items-center gap-2 mb-1 text-green">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.5 8c0-.4 0-.8-.1-1.2l1.4-1.1-1.5-2.5-1.7.7c-.6-.5-1.3-.9-2.1-1.1L9.2 1h-3l-.3 1.8C5.1 3.1 4.4 3.5 3.8 4L2.1 3.3.6 5.8l1.4 1.1C2 7.2 2 7.6 2 8s0 .8.1 1.2L.7 10.3l1.5 2.5 1.7-.7c.6.5 1.3.9 2.1 1.1l.3 1.8h3l.3-1.8c.8-.2 1.5-.6 2.1-1.1l1.7.7 1.5-2.5-1.4-1.1c.1-.4.1-.8.1-1.2ZM7.7 10.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
            </svg>
            <span className="font-bowlby uppercase text-[15px]">Admin</span>
          </div>
          <p className="font-ui text-[11px] opacity-70 text-green">
            Menü, kategoriler, ayarlar ve siparişleri yönetir. Kullanıcıları yönetemez.
          </p>
        </div>
      </div>

      {configError && (
        <div className="border-2 border-orange bg-white p-5 mb-8 max-w-2xl">
          <div className="font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase text-orange mb-2">
            Yapılandırma Gerekli
          </div>
          <p className="text-[13px] text-green/80 mb-3">
            Kullanıcı yönetimi için Supabase servis rolü anahtarı gereklidir.{" "}
            <code className="bg-bg-deep px-1 py-0.5 font-mono text-[12px]">
              SUPABASE_SERVICE_ROLE_KEY
            </code>{" "}
            değerini{" "}
            <code className="bg-bg-deep px-1 py-0.5 font-mono text-[12px]">.env.local</code> dosyanıza ekleyin.
          </p>
          <p className="text-[11px] text-green/50 font-mono">{configError}</p>
        </div>
      )}

      {!configError && (
        <>
          <InviteForm />

          {/* Users table */}
          <div className="border-2 border-green bg-white overflow-x-auto">
            <div className="min-w-180">
              {/* Header */}
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 border-b-2 border-green bg-bg-deep text-[10px] font-extrabold uppercase tracking-[0.18em] text-green items-center">
                <div className="w-10" />
                <div>Kullanıcı</div>
                <div>Rol</div>
                <div>Rol değiştir</div>
                <div />
              </div>

              {rows.map((row) => {
                const isSelf = row.id === actor.id;
                const role = (row.profile?.role ?? "admin") as "admin" | "owner";
                const displayName = row.profile?.display_name;
                const initials = (displayName ?? row.email).charAt(0).toUpperCase();
                const joinedDate = new Date(row.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });

                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-4 py-3 border-b border-green/20 last:border-b-0"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-bg-deep border-2 border-green flex items-center justify-center shrink-0">
                      <span className="font-bowlby text-[18px] text-green leading-none">
                        {initials}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="min-w-0">
                      <div className="font-bowlby text-[15px] uppercase text-green leading-none truncate">
                        {displayName ?? row.email.split("@")[0]}
                      </div>
                      <div className="font-ui text-[11px] text-green/60 truncate mt-0.5">
                        {row.email}
                      </div>
                      <div className="font-ui text-[9px] text-green/40 tracking-[0.18em] uppercase mt-0.5">
                        Katıldı: {joinedDate}
                      </div>
                    </div>

                    {/* Role badge */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={[
                          "px-2 py-0.5 font-ui font-extrabold text-[9px] uppercase tracking-[0.18em]",
                          role === "owner"
                            ? "bg-green text-bg"
                            : "bg-bg-deep text-green border border-green/30",
                        ].join(" ")}
                      >
                        {role}
                      </span>
                      {isSelf && (
                        <span className="text-[8px] text-orange tracking-[0.2em] uppercase font-extrabold">
                          siz
                        </span>
                      )}
                    </div>

                    {/* Role form */}
                    <div className="shrink-0">
                      {!isSelf && (
                        <form action={setRole} className="flex gap-2 items-end">
                          <input type="hidden" name="user_id" value={row.id} />
                          <RoleToggle defaultRole={role} />
                          <SetRoleButton />
                        </form>
                      )}
                    </div>

                    {/* Remove */}
                    <div className="shrink-0">
                      {!isSelf && <RemoveButton userId={row.id} email={row.email} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
