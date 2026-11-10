import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Building2, MapPin, Search } from "lucide-react";
import { useState } from "react";
import { api, unwrap } from "../../lib/api";
import { EmptyState, PageTitle, Status } from "../../components/ui";

type Business = {
  id: number;
  organisation_name: string;
  sector?: string;
  region?: string;
  description?: string;
  verification_status?: string;
};
export function BusinessesPage() {
  const [region, setRegion] = useState("");
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["businesses", region],
    queryFn: async () =>
      unwrap<Business[]>(
        (
          await api.get("/businesses", {
            params: { page: 1, limit: 24, ...(region ? { region } : {}) },
          })
        ).data,
      ),
  });
  return (
    <div className="wrap inner-page">
      <PageTitle
        eyebrow="TANZANIAN ENTERPRISE"
        title="Meet the builders."
        description="Explore registered businesses and founders across Tanzania."
      />
      <div className="list-tools">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search region"
            placeholder="Filter by region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        </label>
        <span>{data.length} businesses</span>
      </div>
      {isLoading ? (
        <div className="skeleton-row" />
      ) : error ? (
        <div className="empty-card">
          <EmptyState
            title="Businesses are unavailable"
            text="Please try again when the API connection is restored."
          />
        </div>
      ) : data.length ? (
        <div className="business-grid">
          {data.map((b) => (
            <article className="business-card" key={b.id}>
              <div className="business-monogram">
                <Building2 size={22} />
              </div>
              <div className="business-card-meta">
                <Status>{b.verification_status || "Registered"}</Status>
                <span>TBIA BUSINESS</span>
              </div>
              <h3>{b.organisation_name}</h3>
              <p>{b.description || b.sector || "Tanzanian business"}</p>
              <div className="business-region">
                <MapPin size={14} />
                {b.region || "Tanzania"}
              </div>
              <span className="text-link">
                Registered with TBIA <ArrowUpRight size={14} />
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-card">
          <EmptyState
            title="No businesses to show yet"
            text="Public business profiles will appear here as businesses are registered."
          />
        </div>
      )}
    </div>
  );
}
