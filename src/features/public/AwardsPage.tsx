import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Award, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api, unwrap } from "../../lib/api";
import { EmptyState, PageTitle } from "../../components/ui";

type Edition = {
  id: number;
  name?: string;
  title?: string;
  year?: number;
  status?: string;
  description?: string;
};
type Category = {
  id: number;
  name: string;
  description?: string;
  edition_id?: number;
};
export function AwardsPage() {
  const editions = useQuery({
    queryKey: ["editions"],
    queryFn: async () =>
      unwrap<Edition[]>((await api.get("/awards/editions")).data),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () =>
      unwrap<Category[]>((await api.get("/awards/categories")).data),
  });
  return (
    <div className="wrap inner-page">
      <PageTitle
        eyebrow="THE TBIA AWARDS"
        title="Awards & categories"
        description="A platform for the people and enterprises moving Tanzania forward."
        action={
          <Link to="/nominations" className="button button-primary">
            Make a nomination <ArrowUpRight size={16} />
          </Link>
        }
      />
      <section className="edition-banner">
        <div>
          <p className="eyebrow">CURRENT EDITION</p>
          <h2>
            {editions.data?.find((e) => e.status === "active")?.name ||
              editions.data?.[0]?.name ||
              editions.data?.[0]?.title ||
              "TBIA Awards"}
          </h2>
          <p>
            {editions.data?.find((e) => e.status === "active")?.description ||
              "Discover the awards recognising bold leadership, sustainable growth and business impact."}
          </p>
        </div>
        <span className="edition-year">
          {editions.data?.find((e) => e.status === "active")?.year ||
            editions.data?.[0]?.year ||
            new Date().getFullYear()}
        </span>
      </section>
      <div className="subsection-heading">
        <div>
          <p className="eyebrow">THE PROGRAMME</p>
          <h2>Choose your arena.</h2>
        </div>
        <span>{categories.data?.length ?? 0} categories</span>
      </div>
      {categories.data?.length ? (
        <div className="category-grid">
          {categories.data.map((cat, i) => (
            <article className="category-tile" key={cat.id}>
              <div className="category-tile-top">
                <span>0{i + 1}</span>
                <Award size={20} />
              </div>
              <h3>{cat.name}</h3>
              <p>
                {cat.description ||
                  "Recognising achievement and positive impact in Tanzania."}
              </p>
              <Link to="/nominations" aria-label={`Nominate for ${cat.name}`}>
                <ChevronRight size={18} />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-card">
          {categories.isLoading ? (
            "Loading categories…"
          ) : (
            <EmptyState
              title="Categories are being prepared"
              text="Published award categories will be listed here as soon as the current edition is configured."
            />
          )}
        </div>
      )}
    </div>
  );
}
