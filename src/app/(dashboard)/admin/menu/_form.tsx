import { Field, Textarea, Select, Checkbox, PrimaryButton, GhostButton } from "../_components";
import { ImageField } from "./_image-field";
import type { Category, MenuItem } from "@/types/database";

export function MenuItemForm({
  action,
  categories,
  initial,
}: {
  action: (formData: FormData) => void | Promise<void>;
  categories: Pick<Category, "id" | "name_en">[];
  initial?: Partial<MenuItem>;
}) {
  return (
    <form
      action={action}
      className="border-2 border-green bg-white p-6 grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl"
    >
      <Select
        label="Category"
        name="category_id"
        required
        defaultValue={initial?.category_id}
        options={categories.map((c) => ({ value: c.id, label: c.name_en }))}
      />
      <div className="md:col-span-1">
        <ImageField defaultUrl={initial?.image_url} />
      </div>

      <Field label="Name (EN)" name="name_en" required defaultValue={initial?.name_en} />
      <Field label="Name (TR)" name="name_tr" required defaultValue={initial?.name_tr} />

      <Textarea label="Description (EN)" name="desc_en" defaultValue={initial?.desc_en ?? ""} />
      <Textarea label="Description (TR)" name="desc_tr" defaultValue={initial?.desc_tr ?? ""} />

      <Field
        label="Price (₺)"
        name="price"
        type="number"
        step="1"
        min="0"
        required
        defaultValue={initial?.price ?? 0}
      />
      <Field
        label="Sort Order"
        name="sort_order"
        type="number"
        defaultValue={initial?.sort_order ?? 0}
      />

      <div className="flex items-center gap-6">
        <Checkbox label="Spicy" name="spicy" defaultChecked={initial?.spicy ?? false} />
        <Checkbox
          label="Available"
          name="is_available"
          defaultChecked={initial?.is_available ?? true}
        />
      </div>

      <div className="md:col-span-2 flex gap-3 pt-2 border-t-2 border-green/20">
        <PrimaryButton>Save</PrimaryButton>
        <GhostButton href="/admin/menu">Cancel</GhostButton>
      </div>
    </form>
  );
}
