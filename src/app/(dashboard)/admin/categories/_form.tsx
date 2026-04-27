import { Field, PrimaryButton, GhostButton } from "../_components";
import type { Category } from "@/types/database";

export function CategoryForm({
  action,
  initial,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial?: Partial<Category>;
}) {
  return (
    <form
      action={action}
      className="border-2 border-green bg-white p-6 grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl"
    >
      <Field label="Slug" name="slug" required defaultValue={initial?.slug} />
      <Field
        label="Sort Order"
        name="sort_order"
        type="number"
        defaultValue={initial?.sort_order ?? 0}
      />
      <Field label="Name (EN)" name="name_en" required defaultValue={initial?.name_en} />
      <Field label="Name (TR)" name="name_tr" required defaultValue={initial?.name_tr} />

      <div className="md:col-span-2 flex gap-3 pt-2 border-t-2 border-green/20">
        <PrimaryButton>Save</PrimaryButton>
        <GhostButton href="/admin/categories">Cancel</GhostButton>
      </div>
    </form>
  );
}
