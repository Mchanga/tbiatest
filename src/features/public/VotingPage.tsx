import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LockKeyhole, Vote } from "lucide-react";
import { Link } from "react-router-dom";
import { api, unwrap } from "../../lib/api";
import { EmptyState, PageTitle } from "../../components/ui";
import { useAuth } from "../auth/AuthProvider";

type Period = {
  id: number;
  edition?: string;
  category?: string;
  starts_at?: string;
  ends_at?: string;
  is_paid?: boolean;
  rules?: string;
};
export function VotingPage() {
  const { user } = useAuth();
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["voting-periods"],
    queryFn: async () =>
      unwrap<Period[]>((await api.get("/voting/periods")).data),
  });
  return (
    <div className="wrap inner-page">
      <PageTitle
        eyebrow="YOUR VOICE COUNTS"
        title="Vote with purpose."
        description="Support the people and businesses raising the bar for Tanzania."
      />
      <div className="notice-card">
        <div className="notice-icon">
          <Vote />
        </div>
        <div>
          <b>Voting is tied to a live awards period</b>
          <p>
            Votes can only be submitted for active periods, by signed-in users
            with a verified email address. Paid voting is not enabled by the
            backend.
          </p>
        </div>
        {user ? (
          <Link className="button button-secondary" to="/app/profile">
            View your profile <ArrowRight size={15} />
          </Link>
        ) : (
          <Link className="button button-primary" to="/login">
            Sign in to continue <ArrowRight size={15} />
          </Link>
        )}
      </div>
      {error ? (
        <div className="empty-card">
          <EmptyState
            title="Voting periods are unavailable"
            text="Please try again later."
          />
        </div>
      ) : isLoading ? (
        <div className="skeleton-row" />
      ) : data.length ? (
        <div className="period-grid">
          {data.map((period) => (
            <article className="period-card" key={period.id}>
              <span className="eyebrow">
                {period.edition || "AWARDS"} ·{" "}
                {period.category || `PERIOD ${period.id}`}
              </span>
              <h3>{period.category || "Open voting period"}</h3>
              <p>
                {period.rules ||
                  "Voting is open for this category. A public ballot cannot be displayed until the API exposes eligible nominee records."}
              </p>
              <div className="period-dates">
                {period.starts_at && (
                  <span>{new Date(period.starts_at).toLocaleDateString()}</span>
                )}
                {period.ends_at && (
                  <span>— {new Date(period.ends_at).toLocaleDateString()}</span>
                )}
              </div>
              <span className="period-closed">
                <LockKeyhole size={14} /> Public nominee ballot data is
                unavailable.
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-card">
          <EmptyState
            title="Voting has not opened yet"
            text="Live voting periods will appear here when an edition is configured."
          />
        </div>
      )}
    </div>
  );
}
