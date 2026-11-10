import { api } from "../../../lib/api";
import { ManagementWorkspace } from "../../../components/ManagementWorkspace";
import { useAuth } from "../../auth/AuthProvider";

const nominationTransitions: Record<string, string[]> = {
  submitted: ["under_review", "rejected"],
  under_review: ["approved", "pending_information", "rejected"],
  pending_information: ["submitted", "under_review", "rejected"],
  approved: ["shortlisted", "finalist", "winner"],
  shortlisted: ["finalist", "winner"],
  finalist: ["winner"],
};

export function NominationAdminPage() {
  const { user } = useAuth();
  const canChangeStatus =
    user?.permissions?.includes("nominations.change_status") ?? false;
  return (
    <ManagementWorkspace
      path="/nominations/review"
      title="Nominations"
      description="Review nominations, add a nominee photo, and update the details."
      columns={[
        "reference_no",
        "nominee_full_name",
        "nominee_organisation",
        "nominee_photo_path",
        "category_name",
        "status",
        "created_at",
      ]}
      createEndpoint={
        user?.permissions?.includes("nominations.create")
          ? "/nominations"
          : undefined
      }
      editEndpoint={(id) => `/nominations/${id}`}
      createPermission="nominations.create"
      editPermission="nominations.review"
      createFields={[
        {
          name: "edition_category_id",
          label: "Award category",
          type: "lookup",
          required: true,
          lookup: {
            endpoint: "/awards/edition-categories",
            valueField: "edition_category_id",
            valueType: "number",
            labelFields: ["edition_name", "category_name"],
            staticParams: { purpose: "nomination" },
          },
        },
        {
          name: "nomination_kind",
          label: "Nomination type",
          type: "select",
          required: true,
          options: [
            "self",
            "business",
            "entrepreneur",
            "investor",
            "company",
            "institution",
          ].map((value) => ({ value, label: value })),
        },
        {
          name: "nominee_business_id",
          label: "Nominee business",
          type: "lookup",
          lookup: {
            endpoint: "/businesses",
            valueField: "id",
            valueType: "number",
            labelFields: ["organisation_name", "region"],
            minSearchLength: 2,
          },
        },
        {
          name: "nominee_user_id",
          label: "Nominee individual",
          type: "lookup",
          lookup: {
            endpoint: "/nominations/nominee-users",
            valueField: "id",
            valueType: "number",
            labelFields: ["full_name", "account_type"],
            minSearchLength: 2,
          },
        },
        {
          name: "nominee_full_name",
          label: "Nominee name",
          required: true,
          maxLength: 200,
        },
        {
          name: "nominee_photo_path",
          label: "Nominee photo",
          type: "image",
          imageUploadEndpoint: "/cms/media",
        },
        { name: "nominee_organisation", label: "Organisation", maxLength: 200 },
        {
          name: "nominee_email",
          label: "Email",
          type: "email",
          maxLength: 255,
        },
        {
          name: "reason_for_nomination",
          label: "Reason for nomination",
          type: "textarea",
          required: true,
          minLength: 20,
          maxLength: 10000,
        },
        {
          name: "achievements",
          label: "Achievements",
          type: "textarea",
          maxLength: 10000,
        },
        {
          name: "business_impact",
          label: "Business impact",
          type: "textarea",
          maxLength: 10000,
        },
        {
          name: "consent_accepted",
          label: "Consent confirmed",
          type: "checkbox",
        },
        {
          name: "status",
          label: "Initial status",
          type: "select",
          options: [
            { value: "draft", label: "Draft" },
            { value: "submitted", label: "Submitted" },
          ],
        },
      ]}
      editFields={[
        {
          name: "nominee_full_name",
          label: "Nominee name",
          required: true,
          maxLength: 200,
        },
        {
          name: "nominee_photo_path",
          label: "Nominee photo",
          type: "image",
          imageUploadEndpoint: "/cms/media",
        },
        { name: "nominee_organisation", label: "Organisation", maxLength: 200 },
        {
          name: "nominee_email",
          label: "Email",
          type: "email",
          maxLength: 255,
        },
        { name: "nominee_phone", label: "Phone", maxLength: 30 },
        {
          name: "reason_for_nomination",
          label: "Reason for nomination",
          type: "textarea",
          required: true,
          minLength: 20,
          maxLength: 10000,
        },
        {
          name: "achievements",
          label: "Achievements",
          type: "textarea",
          maxLength: 10000,
        },
        {
          name: "business_impact",
          label: "Business impact",
          type: "textarea",
          maxLength: 10000,
        },
      ]}
      exclusiveFields={[["nominee_business_id", "nominee_user_id"]]}
      actions={
        canChangeStatus
          ? Object.entries(nominationTransitions).flatMap(
              ([current, nextStatuses]) =>
                nextStatuses.map((status) => ({
                  label: () => `Set ${status.replaceAll("_", " ")}`,
                  visible: (row: Record<string, unknown>) =>
                    row.status === current,
                  run: async (row: Record<string, unknown>) => {
                    const rejection_reason =
                      status === "rejected"
                        ? window.prompt("Enter the reason for rejection")
                        : undefined;
                    if (status === "rejected" && !rejection_reason)
                      return false;
                    await api.patch(`/nominations/${String(row.id)}/status`, {
                      status,
                      ...(rejection_reason ? { rejection_reason } : {}),
                    });
                  },
                })),
            )
          : []
      }
    />
  );
}
