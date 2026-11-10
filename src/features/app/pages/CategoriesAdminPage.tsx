import { ManagementWorkspace } from "../../../components/ManagementWorkspace";
import { api } from "../../../lib/api";

export function CategoriesAdminPage() {
  return (
    <ManagementWorkspace
      path="/awards/categories"
      title="Award category"
      description="Create, edit and remove categories that are not assigned to an award edition."
      columns={["name", "group_name", "slug", "nominee_type", "sort_order"]}
      createEndpoint="/awards/categories"
      editEndpoint={(id) => `/awards/categories/${id}`}
      createPermission="categories.manage"
      editPermission="categories.manage"
      createFields={[
        {
          name: "group_id",
          label: "Category group",
          type: "lookup",
          required: true,
          lookup: {
            endpoint: "/awards/category-groups",
            valueField: "id",
            valueType: "number",
            labelFields: ["name"],
            minSearchLength: 1,
          },
        },
        {
          name: "name",
          label: "Category name",
          required: true,
          maxLength: 190,
        },
        {
          name: "slug",
          label: "URL slug",
          required: true,
          maxLength: 190,
          placeholder: "example-category",
        },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          maxLength: 10000,
        },
        { name: "icon", label: "Icon name (optional)", maxLength: 80 },
        {
          name: "nominee_type",
          label: "Eligible nominee type",
          type: "select",
          required: true,
          options: [
            { value: "any", label: "Any" },
            { value: "business", label: "Business" },
            { value: "individual", label: "Individual" },
            { value: "institution", label: "Institution" },
          ],
        },
        {
          name: "sort_order",
          label: "Display order",
          type: "number",
          min: 0,
          max: 32767,
        },
      ]}
      actions={[
        {
          label: () => "Delete",
          run: async (row) => {
            if (
              !window.confirm(
                `Delete category ${String(row.name)}? Categories assigned to editions cannot be deleted.`,
              )
            )
              return false;
            await api.delete(`/awards/categories/${row.id}`);
          },
        },
      ]}
    />
  );
}
