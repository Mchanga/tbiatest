import { ManagementWorkspace } from "../../../components/ManagementWorkspace";
import { useAuth } from "../../auth/AuthProvider";
import { JudgingEvaluationPanel } from "./JudgingEvaluationPanel";

export function JudgingPage() {
  const { user } = useAuth();
  const canManageJudges = user?.permissions?.includes("judges.manage") ?? false;
  const canAssign =
    user?.permissions?.includes("nominations.assign_judges") ?? false;
  const scope = canManageJudges
    ? "/judging/assignments"
    : "/judging/assignments/mine";
  return (
    <>
      {canManageJudges && (
        <ManagementWorkspace
          path="/judging/judges"
          title="Judges"
          description="Register verified judges for an award edition and maintain their availability."
          columns={[
            "full_name",
            "email",
            "edition",
            "title",
            "organisation",
            "is_active",
          ]}
          createEndpoint="/judging/judges"
          editEndpoint={(id) => `/judging/judges/${id}`}
          createPermission="judges.manage"
          editPermission="judges.manage"
          createFields={[
            {
              name: "user_uid",
              label: "Verified user",
              type: "lookup",
              required: true,
              lookup: {
                endpoint: "/judging/user-search",
                valueField: "uid",
                labelFields: ["full_name", "email"],
                minSearchLength: 2,
              },
            },
            {
              name: "edition_id",
              label: "Award edition",
              type: "lookup",
              required: true,
              lookup: {
                endpoint: "/awards/editions",
                valueField: "id",
                valueType: "number",
                labelFields: ["name", "year"],
              },
            },
            { name: "title", label: "Professional title", maxLength: 150 },
            { name: "organisation", label: "Organisation", maxLength: 190 },
          ]}
          editFields={[
            { name: "title", label: "Professional title", maxLength: 150 },
            { name: "organisation", label: "Organisation", maxLength: 190 },
            { name: "is_active", label: "Active judge", type: "checkbox" },
          ]}
        />
      )}
      <ManagementWorkspace
        path={scope}
        title="Judging assignments"
        description="Review assignments and manage eligible judge-to-nomination matches."
        columns={
          canManageJudges
            ? [
                "judge_name",
                "nominee_full_name",
                "edition",
                "status",
                "assigned_at",
              ]
            : [
                "reference_no",
                "nominee_full_name",
                "nominee_organisation",
                "category",
                "edition",
                "status",
                "assigned_at",
              ]
        }
        createEndpoint={canAssign ? "/judging/assignments" : undefined}
        editEndpoint={
          canAssign ? (id) => `/judging/assignments/${id}` : undefined
        }
        createPermission="nominations.assign_judges"
        editPermission="nominations.assign_judges"
        createFields={[
          {
            name: "judge_id",
            label: "Judge",
            type: "lookup",
            required: true,
            lookup: {
              endpoint: "/judging/judges/search",
              valueField: "id",
              valueType: "number",
              labelFields: ["full_name", "edition", "organisation"],
              minSearchLength: 2,
            },
          },
          {
            name: "nomination_id",
            label: "Nomination",
            type: "lookup",
            required: true,
            lookup: {
              endpoint: "/judging/eligible-nominations",
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
        ]}
      />
      {user?.permissions?.includes("evaluations.submit") && (
        <JudgingEvaluationPanel />
      )}
    </>
  );
}
