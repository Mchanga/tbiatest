import { ManagementWorkspace } from "../../../components/ManagementWorkspace";

export function ContentPage() {
  return (
    <ManagementWorkspace
      path="/cms"
      title="Content"
      description="Create, edit and review public website pages and their publishing state."
      columns={["title", "slug", "is_published", "updated_at"]}
      createEndpoint="/cms"
      editEndpoint={(id) => `/cms/${id}`}
      createPermission="cms.manage"
      editPermission="cms.manage"
      createFields={[
        { name: "title", label: "Page title", required: true, maxLength: 190 },
        { name: "slug", label: "URL slug", required: true, maxLength: 150 },
        { name: "content", label: "Page content", type: "textarea" },
        { name: "meta_title", label: "Meta title", maxLength: 190 },
        { name: "meta_description", label: "Meta description", maxLength: 300 },
        { name: "translations", label: "Translations (JSON)", type: "json" },
        { name: "is_published", label: "Publish this page", type: "checkbox" },
      ]}
    />
  );
}
