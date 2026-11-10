import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../../../lib/api";
import { Button, Card, ErrorBanner, SelectField } from "../../../components/ui";

type Assignment = {
  id: string;
  status: string;
  reference_no: string;
  nominee_full_name: string;
  category: string;
  edition: string;
};

type Criterion = {
  id: number;
  max_score: string;
  weight_percent: string;
  score: number | null;
  comment: string | null;
};

type CriteriaResponse = {
  assignment_status: string;
  criteria: Criterion[];
};

export function JudgingEvaluationPanel() {
  const [assignmentId, setAssignmentId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const assignments = useQuery({
    queryKey: ["judge-evaluation-assignments"],
    queryFn: async () =>
      unwrap<Assignment[]>((await api.get("/judging/assignments/mine")).data),
  });
  const criteria = useQuery({
    queryKey: ["judge-evaluation-criteria", assignmentId],
    enabled: Boolean(assignmentId),
    queryFn: async () =>
      unwrap<CriteriaResponse>(
        (await api.get(`/judging/assignments/${assignmentId}/criteria`)).data,
      ),
  });

  const submitScores = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!criteria.data || !assignmentId) return;
    const formData = new FormData(event.currentTarget);
    const scores = criteria.data.criteria.map((criterion) => ({
      criteria_id: criterion.id,
      score: Number(formData.get(`score-${criterion.id}`)),
      ...(String(formData.get(`comment-${criterion.id}`) ?? "").trim()
        ? { comment: String(formData.get(`comment-${criterion.id}`)).trim() }
        : {}),
    }));
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await api.post(`/judging/assignments/${assignmentId}/scores`, {
        scores,
      });
      setSuccessMessage("Evaluation submitted.");
      await queryClient.invalidateQueries({
        queryKey: ["judge-evaluation-criteria", assignmentId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["judge-evaluation-assignments"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["management", "/judging/assignments/mine"],
      });
    } catch (requestError) {
      const message = (
        requestError as { response?: { data?: { message?: string } } }
      ).response?.data?.message;
      setErrorMessage(message || "Evaluation could not be submitted.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="judging-evaluation">
      <h2>Submit an evaluation</h2>
      <p>Select one of your assignments and score every criterion.</p>
      {assignments.error && (
        <ErrorBanner message="Your assignments could not be loaded." />
      )}
      <SelectField
        label="Assignment"
        value={assignmentId}
        onChange={(event) => {
          setAssignmentId(event.currentTarget.value);
          setErrorMessage("");
          setSuccessMessage("");
        }}
      >
        <option value="">Select an assignment</option>
        {assignments.data?.map((assignment) => (
          <option key={assignment.id} value={assignment.id}>
            {assignment.reference_no} · {assignment.nominee_full_name} ·{" "}
            {assignment.category}
          </option>
        ))}
      </SelectField>
      {criteria.error && (
        <ErrorBanner message="Evaluation criteria could not be loaded for this assignment." />
      )}
      {criteria.data && criteria.data.criteria.length === 0 && (
        <ErrorBanner message="This category has no evaluation criteria configured." />
      )}
      {criteria.data && criteria.data.criteria.length > 0 && (
        <form className="form-stack" onSubmit={submitScores}>
          {criteria.data.criteria.map((criterion) => (
            <div className="evaluation-criterion" key={criterion.id}>
              <div>
                <b>Criterion {criterion.id}</b>
                <small>
                  Maximum {criterion.max_score} · Weight{" "}
                  {criterion.weight_percent}%
                </small>
              </div>
              <label className="field">
                <span>Score</span>
                <input
                  type="number"
                  name={`score-${criterion.id}`}
                  min="0"
                  max={criterion.max_score}
                  step="any"
                  required
                  defaultValue={criterion.score ?? ""}
                  disabled={criteria.data.assignment_status === "completed"}
                />
              </label>
              <label className="field">
                <span>Criterion comment</span>
                <textarea
                  name={`comment-${criterion.id}`}
                  maxLength={1000}
                  rows={2}
                  defaultValue={criterion.comment ?? ""}
                  disabled={criteria.data.assignment_status === "completed"}
                />
              </label>
            </div>
          ))}
          {errorMessage && <ErrorBanner message={errorMessage} />}
          {successMessage && (
            <div className="success-banner">{successMessage}</div>
          )}
          {criteria.data.assignment_status === "completed" ? (
            <p>This evaluation has been submitted and is locked.</p>
          ) : (
            <Button type="submit" loading={saving}>
              Submit scores
            </Button>
          )}
        </form>
      )}
    </Card>
  );
}
