import { api } from "../../../lib/api";
import { ManagementWorkspace } from "../../../components/ManagementWorkspace";

const verificationStatuses = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "suspended",
];

export function BusinessAdminPage() {
  return (
    <ManagementWorkspace
      path="/businesses/review"
      title="Business verification"
      description="Review business profiles, correct profile data and manage verification decisions."
      columns={[
        "organisation_name",
        "owner_name",
        "owner_email",
        "region",
        "verification_status",
        "created_at",
      ]}
      editEndpoint={(id) => `/businesses/${id}/manage`}
      editPermission="businesses.verify"
      editFields={[
        {
          name: "organisation_name",
          label: "Organisation name",
          required: true,
          maxLength: 190,
        },
        { name: "sector", label: "Sector", maxLength: 120 },
        {
          name: "registration_number",
          label: "Registration number",
          maxLength: 80,
        },
        { name: "tin", label: "Tax identification number", maxLength: 30 },
        { name: "website", label: "Website", type: "url", maxLength: 255 },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          maxLength: 10000,
        },
        { name: "country", label: "Country", maxLength: 80 },
        { name: "region", label: "Region", maxLength: 80 },
        { name: "district_city", label: "District / city", maxLength: 80 },
        {
          name: "year_established",
          label: "Year established",
          type: "number",
          min: 1800,
          max: 2100,
        },
        {
          name: "employees_count",
          label: "Number of employees",
          type: "number",
          min: 0,
          max: 100000000,
        },
      ]}
      actions={verificationStatuses.map((status) => ({
        label: () => `Set ${status.replaceAll("_", " ")}`,
        visible: (row: Record<string, unknown>) =>
          row.verification_status !== status,
        run: async (row: Record<string, unknown>) => {
          if (
            !window.confirm(
              `Change this business verification status to ${status.replaceAll("_", " ")}?`,
            )
          )
            return false;
          await api.patch(`/businesses/${String(row.id)}/verification`, {
            verification_status: status,
          });
        },
      }))}
    />
  );
}
