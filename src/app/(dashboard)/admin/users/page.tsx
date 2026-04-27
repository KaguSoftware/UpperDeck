import { requireRole } from "@/lib/auth/require-session";
import { getAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Field, Select, PrimaryButton } from "../_components";
import { SetRoleButton } from "../_submit-buttons";
import { setRole, inviteUser } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { user: actor } = await requireRole("admin");

  const admin = getAdminClient();
  const [{ data: list, error: listErr }, { data: profiles, error: profErr }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 200 }),
    admin.from("profiles").select("id, role, display_name"),
  ]);

  if (listErr) throw new Error(listErr.message);
  if (profErr) throw new Error(profErr.message);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows = (list?.users ?? [])
    .map((u) => ({
      id: u.id,
      email: u.email ?? "—",
      created_at: u.created_at,
      profile: profileById.get(u.id) ?? null,
    }))
    .sort((a, b) => (a.email < b.email ? -1 : 1));

  return (
    <>
      <PageHeader title="Users" subtitle={`${rows.length} accounts`} />

      <section className="mb-8">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-green/70 mb-3">
          Invite by email
        </div>
        <form
          action={inviteUser}
          className="border-2 border-green bg-white p-5 grid grid-cols-1 md:grid-cols-[1fr_10rem_auto] gap-4 items-end max-w-2xl"
        >
          <Field label="Email" name="email" type="email" required />
          <Select
            label="Role"
            name="role"
            defaultValue="owner"
            options={[
              { value: "owner", label: "Owner" },
              { value: "admin", label: "Admin" },
            ]}
          />
          <PrimaryButton>Send invite</PrimaryButton>
        </form>
      </section>

      <div className="border-2 border-green bg-white">
        <div className="grid grid-cols-[1fr_1fr_8rem_8rem] gap-3 px-4 py-3 border-b-2 border-green bg-bg-deep text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
          <div>Email</div>
          <div>Display name</div>
          <div>Role</div>
          <div></div>
        </div>
        {rows.map((row) => {
          const isSelf = row.id === actor.id;
          const role = row.profile?.role ?? "owner";
          return (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_1fr_8rem_8rem] gap-3 items-center px-4 py-3 border-b border-green/20 last:border-b-0"
            >
              <div className="font-ui font-extrabold text-[12px] text-green truncate">
                {row.email}
                {isSelf && (
                  <span className="ml-2 text-[8px] text-orange tracking-[0.2em] uppercase">
                    you
                  </span>
                )}
              </div>
              <div className="text-[12px] text-green/80">{row.profile?.display_name ?? "—"}</div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-orange">
                {role}
              </div>
              <div className="flex justify-end">
                {!isSelf && (
                  <form action={setRole} className="flex gap-2 items-center">
                    <input type="hidden" name="user_id" value={row.id} />
                    <select
                      name="role"
                      defaultValue={role}
                      className="border-2 border-green bg-bg px-2 py-1 text-[11px] font-extrabold uppercase tracking-[0.15em] text-green"
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                    </select>
                    <SetRoleButton />
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
