import { PageHeader } from "../../_components";
import { CategoryForm } from "../_form";
import { createCategory } from "../actions";

export default function NewCategoryPage() {
  return (
    <>
      <PageHeader title="New Category" />
      <CategoryForm action={createCategory} />
    </>
  );
}
