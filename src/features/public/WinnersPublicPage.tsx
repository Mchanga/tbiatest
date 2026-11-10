import { useQuery } from "@tanstack/react-query";
import { Award, CalendarDays, Trophy } from "lucide-react";
import { api, unwrap } from "../../lib/api";
import { Card, EmptyState, ErrorBanner, PageTitle } from "../../components/ui";

type AnnouncedWinner = {
  id: number;
  edition: string;
  category: string;
  winner_name: string;
  company_name?: string | null;
  photo_path?: string | null;
  award_description?: string | null;
  achievement_summary?: string | null;
  award_reference?: string | null;
  announced_at?: string | null;
};

export function WinnersPublicPage() {
  const winners = useQuery({
    queryKey: ["announced-winners"],
    queryFn: async () =>
      unwrap<AnnouncedWinner[]>((await api.get("/winners")).data),
  });

  return (
    <div className="wrap inner-page">
      <PageTitle
        eyebrow="TBIA AWARDS"
        title="Celebrating our winners."
        description="Meet the people and organisations recognised for their excellence, innovation and impact."
      />
      {winners.error && (
        <ErrorBanner message="Award winners could not be loaded. Please try again later." />
      )}
      {winners.isLoading ? (
        <div className="skeleton-row" />
      ) : winners.data?.length ? (
        <div className="winner-grid">
          {winners.data.map((winner) => (
            <Card className="winner-card" key={winner.id}>
              <div className="winner-card-mark">
                {winner.photo_path ? (
                  <img
                    className="winner-photo"
                    src={`${api.defaults.baseURL}${winner.photo_path}`}
                    alt={`Photo of ${winner.winner_name}`}
                  />
                ) : (
                  <>
                    <Trophy size={25} />
                    <span>TBIA WINNER</span>
                  </>
                )}
              </div>
              <div className="winner-card-content">
                <p className="eyebrow">
                  {winner.edition} · {winner.category}
                </p>
                <h2>{winner.winner_name}</h2>
                {winner.company_name && (
                  <p className="winner-company">{winner.company_name}</p>
                )}
                {winner.award_description && <p>{winner.award_description}</p>}
                {winner.achievement_summary && (
                  <p className="winner-achievement">
                    {winner.achievement_summary}
                  </p>
                )}
                <div className="winner-card-footer">
                  {winner.award_reference && (
                    <span>{winner.award_reference}</span>
                  )}
                  {winner.announced_at && (
                    <span>
                      <CalendarDays size={13} />
                      {new Date(winner.announced_at).toLocaleDateString(
                        "en-TZ",
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </span>
                  )}
                  {!winner.award_description && !winner.achievement_summary && (
                    <Award size={15} aria-label="Award winner" />
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        !winners.error && (
          <div className="empty-card">
            <EmptyState
              title="Winners are yet to be announced"
              text="When TBIA publishes the award results, the winners will be celebrated here."
            />
          </div>
        )
      )}
    </div>
  );
}
