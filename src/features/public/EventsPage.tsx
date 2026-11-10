import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../lib/api";
import { EmptyState, PageTitle } from "../../components/ui";

export function EventsPage() {
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["public-events"],
    queryFn: async () =>
      unwrap<
        Array<{
          id: number;
          title: string;
          venue?: string;
          starts_at: string;
          description?: string;
        }>
      >((await api.get("/events")).data),
  });
  return (
    <div className="wrap inner-page">
      <PageTitle
        eyebrow="TBIA COMMUNITY"
        title="Events & gatherings"
        description="Meet the people shaping Tanzania’s business and investment landscape."
      />
      {error && (
        <div className="empty-card">
          <EmptyState
            title="Events are unavailable"
            text="Please come back later."
          />
        </div>
      )}
      {isLoading ? (
        <div className="skeleton-row" />
      ) : data.length ? (
        <div className="event-grid">
          {data.map((item) => (
            <article className="event-card card" key={item.id}>
              <span className="eyebrow">
                {new Date(item.starts_at).toLocaleDateString("en-TZ", {
                  weekday: "short",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <h3>{item.title}</h3>
              <p>
                {item.description ||
                  "Join the TBIA community for an evening of ideas, recognition and connection."}
              </p>
              <span className="business-region">
                {item.venue || "Venue to be announced"}
              </span>
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <div className="empty-card">
            <EmptyState
              title="The next gathering is taking shape"
              text="Published TBIA events will appear here."
            />
          </div>
        )
      )}
    </div>
  );
}
