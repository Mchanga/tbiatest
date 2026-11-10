import { ManagementWorkspace } from "../../../components/ManagementWorkspace";
import { RecordList } from "../../../components/RecordList";

const periodFields = [
  {
    name: "starts_at",
    label: "Voting starts",
    type: "datetime-local" as const,
    required: true,
  },
  {
    name: "ends_at",
    label: "Voting ends",
    type: "datetime-local" as const,
    required: true,
  },
  {
    name: "max_votes_per_voter",
    label: "Maximum votes per voter",
    type: "number" as const,
    min: 1,
    max: 1000,
    required: true,
  },
  {
    name: "rules",
    label: "Voting rules",
    type: "textarea" as const,
    maxLength: 10000,
  },
  {
    name: "results_visible",
    label: "Show public results",
    type: "checkbox" as const,
  },
];

export function VotingAdminPage() {
  return (
    <>
      <ManagementWorkspace
        path="/voting/periods/manage"
        title="Voting periods"
        description="Create voting windows, review their settings and control result visibility."
        columns={[
          "edition",
          "category",
          "starts_at",
          "ends_at",
          "max_votes_per_voter",
          "results_visible",
        ]}
        createEndpoint="/voting/periods"
        editEndpoint={(id) => `/voting/periods/${id}`}
        createPermission="voting.manage"
        editPermission="voting.manage"
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
            },
          },
          ...periodFields,
        ]}
        editFields={periodFields}
      />
      <RecordList
        path="/voting/fraud-review"
        title="Voting integrity signals"
        description="Activity signals are for human review and are not, by themselves, proof of fraud."
        columns={[
          "voting_period_id",
          "hour",
          "ballot_count",
          "distinct_accounts",
          "distinct_nominees",
        ]}
      />
    </>
  );
}
