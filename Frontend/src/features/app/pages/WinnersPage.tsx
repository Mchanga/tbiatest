import { api } from "../../../lib/api";
import { ManagementWorkspace } from "../../../components/ManagementWorkspace";

export function WinnersPage() {
  return (
    <ManagementWorkspace
      path="/winners/manage"
      title="Winners"
      description="Record award outcomes, edit their citations and control public announcements."
      columns={[
        "winner_name",
        "company_name",
        "edition_id",
        "edition_category_id",
        "nomination_id",
        "is_published",
      ]}
      createEndpoint="/winners"
      editEndpoint={(id) => `/winners/${id}`}
      createPermission="winners.manage"
      editPermission="winners.manage"
      createFields={[
        {
          name: "nomination_id",
          label: "Finalist nomination",
          type: "lookup",
          required: true,
          lookup: {
            endpoint: "/winners/eligible-nominations",
            valueField: "id",
            labelFields: [
              "reference_no",
              "nominee_full_name",
              "edition",
              "category",
            ],
            minSearchLength: 2,
          },
        },
        {
          name: "award_description",
          label: "Award description",
          type: "textarea",
          maxLength: 10000,
        },
        {
          name: "achievement_summary",
          label: "Achievement summary",
          type: "textarea",
          maxLength: 10000,
        },
        { name: "award_reference", label: "Award reference", maxLength: 60 },
      ]}
      editFields={[
        {
          name: "award_description",
          label: "Award description",
          type: "textarea",
          maxLength: 10000,
        },
        {
          name: "achievement_summary",
          label: "Achievement summary",
          type: "textarea",
          maxLength: 10000,
        },
        { name: "award_reference", label: "Award reference", maxLength: 60 },
      ]}
      actions={[
        {
          label: (row) => (row.is_published ? "Unpublish" : "Publish"),
          run: async (row) => {
            const publish = !row.is_published;
            if (
              !window.confirm(
                `${publish ? "Publish" : "Unpublish"} this winner?`,
              )
            )
              return false;
            await api.patch(`/winners/${String(row.id)}/publish`, {
              is_published: publish,
            });
          },
        },
      ]}
    />
  );
}
