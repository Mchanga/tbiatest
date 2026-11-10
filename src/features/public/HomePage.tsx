import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Award,
  Building2,
  CalendarDays,
  ChevronRight,
  MapPin,
  Trophy,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, unwrap } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";
import heroImage from "../../assets/hero/award.webp";
import heroImage2 from "../../assets/hero/images.jpg";

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
  nominee_count?: number;
  nomination_count?: number;
};
type HomeCopy = {
  hero_title?: string;
  hero_intro?: string;
  hero_image?: string;
  categories_title?: string;
  categories_intro?: string;
  feature_image?: string;
  impact_title?: string;
  impact_description?: string;
  cta_title?: string;
  cta_description?: string;
  sponsors_title?: string;
  hero_primary_cta?: string;
  hero_secondary_cta?: string;
  hero_brand_label?: string;
  hero_location?: string;
  edition_label?: string;
  categories_eyebrow?: string;
  categories_link_label?: string;
  category_list_label?: string;
  category_all_label?: string;
  impact_eyebrow?: string;
  impact_cta?: string;
  events_eyebrow?: string;
  events_title?: string;
  events_link_label?: string;
  event_detail_label?: string;
  sponsors_eyebrow?: string;
  sponsors_link_label?: string;
  cta_eyebrow?: string;
  cta_primary?: string;
  cta_secondary?: string;
  scroll_note?: string;
  categories_count_label?: string;
  categories_catalog_label?: string;
  categories_empty_title?: string;
  categories_empty_text?: string;
  category_stat_label?: string;
  category_stat_caption?: string;
  edition_stat_label?: string;
  edition_stat_caption?: string;
  event_location_fallback?: string;
  events_empty_title?: string;
  events_empty_text?: string;
  sponsor_website_label?: string;
  hero_image_alt?: string;
  feature_image_alt?: string;
};
type Sponsor = {
  id: number;
  name: string;
  logo_path?: string | null;
  description?: string | null;
  website_url?: string | null;
  level?: string;
};
type FeaturedWinner = {
  id: number;
  edition: string;
  category: string;
  winner_name: string;
  company_name?: string | null;
  photo_path?: string | null;
  award_description?: string | null;
};
const defaultHomeCopy: Required<HomeCopy> = {
  hero_title: "Celebrating the\nAward brand's\nof tomorrow.",
  hero_intro:
    "The people. The ideas. The businesses moving Tanzania forward. Discover this year’s awards and be part of the story.",
  hero_image: "",
  categories_title: "Select an awards category,\ngets its moment.",
  categories_intro: "Celebrating distinction in Tanzania",
  feature_image: "",
  impact_title: "Recognition that\nmoves business.",
  impact_description:
    "TBIA connects bold ideas with the recognition, visibility and relationships to take them further.",
  cta_title: "Do work worth\nbeing recognised.",
  cta_description:
    "Join the businesses, entrepreneurs and investors building the future of Tanzania.",
  sponsors_title: "Our partners",
  hero_primary_cta: "Explore the awards",
  hero_secondary_cta: "Join the community",
  hero_brand_label: "TANZANIA BUSINESS & INVESTMENT AWARDS",
  hero_location: "TANZANIA",
  edition_label: "THE AWARDS EDITION",
  categories_eyebrow: "THE AWARDS",
  categories_link_label: "View all awards",
  category_list_label: "AWARD CATEGORIES",
  category_all_label: "Explore all categories",
  impact_eyebrow: "MORE THAN AN AWARD",
  impact_cta: "Be part of it",
  events_eyebrow: "WHAT’S HAPPENING",
  events_title: "Gather. Connect.\nMove forward.",
  events_link_label: "All events",
  event_detail_label: "Event details",
  sponsors_eyebrow: "PARTNERS IN PROGRESS",
  sponsors_link_label: "Partner with TBIA",
  cta_eyebrow: "YOUR NEXT CHAPTER STARTS HERE",
  cta_primary: "Create your account",
  cta_secondary: "Make a nomination",
  scroll_note: "Celebrating excellence, innovation and impact.",
  categories_count_label: "{count} CATEGORIES",
  categories_catalog_label: "LIVE CATALOG",
  categories_empty_title: "Categories are being prepared",
  categories_empty_text:
    "Award categories will appear here when published by the TBIA team.",
  category_stat_label: "award categories",
  category_stat_caption: "OPEN TO TANZANIAN ENTERPRISE",
  edition_stat_label: "award editions",
  edition_stat_caption: "A LEGACY IN THE MAKING",
  event_location_fallback: "Location to be announced",
  events_empty_title: "The next gathering is taking shape",
  events_empty_text:
    "Published TBIA events will be announced here. Check back soon.",
  sponsor_website_label: "Visit website",
  hero_image_alt: "Tanzania Business and Investment Awards trophy",
  feature_image_alt: "TBIA award trophy",
};

const readHomeCopy = (content?: string | null): Required<HomeCopy> => {
  if (!content) return defaultHomeCopy;
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return defaultHomeCopy;
    const result = { ...defaultHomeCopy };
    for (const key of Object.keys(defaultHomeCopy) as (keyof HomeCopy)[]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string") result[key] = value;
    }
    return result;
  } catch {
    return defaultHomeCopy;
  }
};
export function HomePage() {
  const homepage = useQuery({
    queryKey: ["homepage-content"],
    queryFn: async () =>
      unwrap<{ content: string | null }>(
        (await api.get("/cms/public/home")).data,
      ),
  });
  const copy = readHomeCopy(homepage.data?.content);
  const sponsors = useQuery({
    queryKey: ["public-sponsors"],
    queryFn: async () =>
      unwrap<Sponsor[]>((await api.get("/sponsorship/public")).data),
  });
  const winners = useQuery({
    queryKey: ["announced-winners"],
    queryFn: async () =>
      unwrap<FeaturedWinner[]>((await api.get("/winners")).data),
  });
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
  const events = useQuery({
    queryKey: ["events"],
    queryFn: async () =>
      unwrap<
        Array<{ id: number; title: string; venue?: string; starts_at: string }>
      >((await api.get("/events")).data),
  });
  const edition =
    editions.data?.find((x) => x.status === "active") ?? editions.data?.[0];
  const mediaHref = (url: string) =>
    url.startsWith("/") ? `${api.defaults.baseURL}${url}` : url;
  const headingLines = (value: string) =>
    value.split("\n").map((line, index) => (
      <span key={`${line}-${index}`}>
        {index > 0 && <br />}
        {line}
      </span>
    ));
  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          <h1>{headingLines(copy.hero_title)}</h1>
          <p className="hero-intro">{copy.hero_intro}</p>
          <div className="hero-actions">
            <Link to="/awards" className="button button-primary button-large">
              {copy.hero_primary_cta} <ArrowUpRight size={17} />
            </Link>
            <Link to="/register" className="text-link">
              {copy.hero_secondary_cta} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-caption">
            <div className="avatar-stack"></div>
          </div>
        </div>
        <div className="hero-art">
          <img
            src={copy.hero_image ? mediaHref(copy.hero_image) : heroImage}
            alt={copy.hero_image_alt}
            className="hero-image"
          />
          <div className="hero-image-overlay" />
          <div className="hero-image-caption">
            <div className="hero-image-caption-topline">
              <span className="hero-image-label">
                <Award size={14} />
                {copy.hero_brand_label}
              </span>
              <span className="hero-image-location">{copy.hero_location}</span>
            </div>
            <div className="hero-image-edition">
              <h2>{edition?.year || new Date().getFullYear()}</h2>
              <div>
                <span className="hero-image-edition-label">
                  {copy.edition_label}
                </span>
                <p> {copy.impact_description}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section wrap">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{copy.categories_eyebrow}</p>
            <h2>{headingLines(copy.categories_title)}</h2>
          </div>
          <Link className="text-link" to="/awards">
            {copy.categories_link_label} <ArrowRight size={15} />
          </Link>
        </div>
        <div className="award-overview">
          <div className="award-feature">
            <span className="feature-number">
              01 / {String(categories.data?.length || 12).padStart(2, "0")}
            </span>
            <img
              className="award-feature-image"
              src={
                copy.feature_image ? mediaHref(copy.feature_image) : heroImage2
              }
              alt={copy.feature_image_alt}
            />
            <div className="feature-icon">
              <Trophy size={30} />
            </div>
            <p className="eyebrow">
              {edition?.name ||
                edition?.title ||
                `${new Date().getFullYear()} EDITION`}
            </p>
          </div>
          <div className="category-list">
            <div className="category-list-head">
              <span>{copy.category_list_label}</span>
              <span>
                {categories.data?.length
                  ? copy.categories_count_label.replace(
                      "{count}",
                      String(categories.data.length),
                    )
                  : copy.categories_catalog_label}
              </span>
            </div>
            {categories.data?.slice(0, 5).map((item, i) => (
              <Link className="category-row" key={item.id} to="/awards">
                <span className="category-index">0{i + 1}</span>
                <span>
                  <b>{item.name}</b>
                  <small>{item.description || copy.categories_intro}</small>
                </span>
                <ChevronRight size={18} />
              </Link>
            ))}
            {!categories.data?.length && (
              <EmptyState
                title={copy.categories_empty_title}
                text={copy.categories_empty_text}
              />
            )}
            <Link className="category-all" to="/awards">
              {copy.category_all_label} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
      {winners.data?.length ? (
        <section className="section wrap">
          <div className="section-heading">
            <div>
              <p className="eyebrow">RECOGNISING EXCELLENCE</p>
              <h2>Meet our award winners.</h2>
            </div>
            <Link className="text-link" to="/winners">
              All winners <ArrowRight size={15} />
            </Link>
          </div>
          <div className="winner-grid winner-grid-featured">
            {winners.data.slice(0, 3).map((winner) => (
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
                      <Trophy size={22} />
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
                  {winner.award_description && (
                    <p>{winner.award_description}</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
      <section className="impact-section">
        <div className="wrap impact-grid">
          <div className="impact-intro">
            <p className="eyebrow">{copy.impact_eyebrow}</p>
            <h2>{headingLines(copy.impact_title)}</h2>
            <p>{copy.impact_description}</p>
            <Link to="/register" className="text-link">
              {copy.impact_cta} <ArrowRight size={15} />
            </Link>
          </div>
          <div className="impact-stat">
            <Building2 />
            <strong>{categories.data?.length ?? "—"}</strong>
            <span>{copy.category_stat_label}</span>
            <small>{copy.category_stat_caption}</small>
          </div>
          <div className="impact-stat">
            <Award />
            <strong>{editions.data?.length ?? "—"}</strong>
            <span>{copy.edition_stat_label}</span>
            <small>{copy.edition_stat_caption}</small>
          </div>
        </div>
      </section>
      {sponsors.data?.length ? (
        <section className="section wrap">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy.sponsors_eyebrow}</p>
              <h2>{copy.sponsors_title}</h2>
            </div>
            <Link className="text-link" to="/sponsorship">
              {copy.sponsors_link_label} <ArrowRight size={15} />
            </Link>
          </div>
          <div className="sponsor-grid">
            {sponsors.data.map((sponsor) => (
              <Card className="home-sponsor-card" key={sponsor.id}>
                {sponsor.logo_path && (
                  <img
                    src={mediaHref(sponsor.logo_path)}
                    alt={`${sponsor.name} logo`}
                  />
                )}
                <p className="eyebrow">{sponsor.level || "TBIA PARTNER"}</p>
                <h3>{sponsor.name}</h3>
                {sponsor.description && <p>{sponsor.description}</p>}
                {sponsor.website_url && (
                  <a
                    className="text-link"
                    href={sponsor.website_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {copy.sponsor_website_label} <ArrowUpRight size={15} />
                  </a>
                )}
              </Card>
            ))}
          </div>
        </section>
      ) : null}
      <section className="section wrap">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{copy.events_eyebrow}</p>
            <h2>{headingLines(copy.events_title)}</h2>
          </div>
          <Link className="text-link" to="/events">
            {copy.events_link_label} <ArrowRight size={15} />
          </Link>
        </div>
        {events.isLoading ? (
          <div className="skeleton-row" />
        ) : events.data?.length ? (
          <div className="event-grid">
            {events.data.slice(0, 3).map((event) => (
              <Card key={event.id} className="event-card">
                <div className="event-date">
                  <CalendarDays size={19} />
                  <span>
                    {new Date(event.starts_at).toLocaleDateString("en-TZ", {
                      month: "short",
                      day: "2-digit",
                    })}
                  </span>
                </div>
                <h3>{event.title}</h3>
                <p>
                  <MapPin size={14} />
                  {event.venue || copy.event_location_fallback}
                </p>
                <Link to="/events" className="text-link">
                  {copy.event_detail_label} <ArrowUpRight size={15} />
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <div className="empty-card">
            <EmptyState
              title={copy.events_empty_title}
              text={copy.events_empty_text}
            />
          </div>
        )}
      </section>
      <section className="cta-section wrap">
        <div>
          <p className="eyebrow">{copy.cta_eyebrow}</p>
          <h2>{headingLines(copy.cta_title)}</h2>
          <p>{copy.cta_description}</p>
          <div className="hero-actions">
            <Link className="button button-light button-large" to="/register">
              {copy.cta_primary} <ArrowRight size={16} />
            </Link>
            <Link className="cta-secondary" to="/nominations">
              {copy.cta_secondary} <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </section>
      <div className="scroll-note wrap">
        <ArrowDown size={14} /> {copy.scroll_note}
      </div>
    </>
  );
}
