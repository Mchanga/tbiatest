import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Award, CircleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { api, unwrap } from "../../lib/api";
import { EmptyState, PageTitle } from "../../components/ui";

type Period = {
  id: number;
  edition: string;
  category: string;
  starts_at: string;
  ends_at: string;
};
type Candidate = {
  nomination_id: string;
  reference_no: string;
  nominee_full_name: string;
  nominee_photo_path?: string | null;
  votes: number;
};
export function NomineesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["visible-nominees"],
    queryFn: async () => {
      const periods = unwrap<Period[]>((await api.get("/voting/periods")).data);
      const visible = await Promise.allSettled(
        periods.map(async (period) => ({
          period,
          candidates: unwrap<Candidate[]>(
            (await api.get(`/voting/periods/${period.id}/results`)).data,
          ),
        })),
      );
      return visible.flatMap((item) =>
        item.status === "fulfilled"
          ? item.value.candidates.map((candidate) => ({
              ...candidate,
              edition: item.value.period.edition,
              category: item.value.period.category,
            }))
          : [],
      );
    },
  });
  return (
    <div className="wrap inner-page">
      <PageTitle
        eyebrow="THE PEOPLE BEHIND THE PROGRESS"
        title="Meet the nominees."
        description="See nominees whose voting results have been made public."
      />
      <div className="notice-card">
        <div className="notice-icon">
          <CircleAlert size={18} />
        </div>
        <div>
          <b>Who appears here?</b>
          <p>Only nominees with public voting results appear here.</p>
        </div>
      </div>
      {error && (
        <div className="empty-card">
          <EmptyState
            title="Nominee results are unavailable"
            text="Try again later, or explore published award categories."
          />
        </div>
      )}
      {isLoading ? (
        <div className="skeleton-row" />
      ) : data?.length ? (
        <div className="nominee-grid">
          {data.map((item) => (
            <article
              className="nominee-card"
              key={`${item.edition}-${item.nomination_id}`}
            >
              <div className="nominee-placeholder">
                {item.nominee_photo_path ? (
                  <img
                    src={`${api.defaults.baseURL}${item.nominee_photo_path}`}
                    alt={`Photo of ${item.nominee_full_name}`}
                  />
                ) : (
                  <>
                    <Award size={28} />
                    <span>TBIA NOMINEE</span>
                  </>
                )}
              </div>
              <div className="nominee-info">
                <p className="eyebrow">
                  {item.edition} · {item.category}
                </p>
                <h2>{item.nominee_full_name}</h2>
                <p className="nominee-reference">
                  NOMINATION {item.reference_no}
                </p>
                <div className="nominee-votes">
                  <span>Public vote result</span>
                  <b>{item.votes}</b>
                </div>
                <Link className="text-link" to="/vote">
                  Voting details <ArrowRight size={14} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <div className="empty-card">
            <EmptyState
              title="No public nominee results yet"
              text="As voting periods open and results become public, the visible candidates will be listed here."
            />
          </div>
        )
      )}
    </div>
  );
}
