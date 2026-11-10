import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../../../lib/api";
import { Button, Card, ErrorBanner, PageTitle } from "../../../components/ui";

type HomeContent = {
  hero_title: string;
  hero_intro: string;
  hero_image: string;
  categories_title: string;
  categories_intro: string;
  feature_image: string;
  impact_title: string;
  impact_description: string;
  cta_title: string;
  cta_description: string;
  sponsors_title: string;
  hero_primary_cta: string;
  hero_secondary_cta: string;
  hero_brand_label: string;
  hero_location: string;
  edition_label: string;
  categories_eyebrow: string;
  categories_link_label: string;
  category_list_label: string;
  category_all_label: string;
  impact_eyebrow: string;
  impact_cta: string;
  events_eyebrow: string;
  events_title: string;
  events_link_label: string;
  event_detail_label: string;
  sponsors_eyebrow: string;
  sponsors_link_label: string;
  cta_eyebrow: string;
  cta_primary: string;
  cta_secondary: string;
  scroll_note: string;
  categories_count_label: string;
  categories_catalog_label: string;
  categories_empty_title: string;
  categories_empty_text: string;
  category_stat_label: string;
  category_stat_caption: string;
  edition_stat_label: string;
  edition_stat_caption: string;
  event_location_fallback: string;
  events_empty_title: string;
  events_empty_text: string;
  sponsor_website_label: string;
  hero_image_alt: string;
  feature_image_alt: string;
};
type CmsPage = {
  id: number;
  slug: string;
  content: string | null;
  is_published: boolean;
};
type CmsImageKey = "hero_image" | "feature_image";
const defaults: HomeContent = {
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

const readContent = (content: string | null | undefined): HomeContent => {
  if (!content) return defaults;
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return defaults;
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof HomeContent)[]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string") result[key] = value;
    }
    return result;
  } catch {
    return defaults;
  }
};

export function HomeContentPage() {
  const queryClient = useQueryClient();
  const pages = useQuery({
    queryKey: ["cms-pages"],
    queryFn: async () => unwrap<CmsPage[]>((await api.get("/cms")).data),
  });
  const homePage = pages.data?.find((page) => page.slug === "home");
  const [content, setContent] = useState(defaults);
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<CmsImageKey | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!homePage) {
      setContent(defaults);
      setPublished(true);
      return;
    }
    setContent(readContent(homePage.content));
    setPublished(homePage.is_published);
  }, [homePage]);

  const update = (key: keyof HomeContent, value: string) =>
    setContent((current) => ({ ...current, [key]: value }));

  const uploadImage = async (key: CmsImageKey, file?: File) => {
    if (!file) return;
    setUploading(key);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api.post<{ data: { url: string } }>(
        "/cms/media",
        body,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      update(key, result.data.data.url);
      setMessage("Image uploaded. Save the homepage to publish this change.");
    } catch (requestError) {
      setError(
        (requestError as { response?: { data?: { message?: string } } })
          .response?.data?.message || "Image upload failed.",
      );
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    const payload = {
      title: "Homepage",
      slug: "home",
      content: JSON.stringify(content),
      is_published: published,
    };
    try {
      if (homePage) await api.patch(`/cms/${homePage.id}`, payload);
      else await api.post("/cms", payload);
      await queryClient.invalidateQueries({ queryKey: ["cms-pages"] });
      await queryClient.invalidateQueries({ queryKey: ["homepage-content"] });
      setMessage("Homepage content saved.");
    } catch (requestError) {
      setError(
        (requestError as { response?: { data?: { message?: string } } })
          .response?.data?.message || "Homepage content could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const mediaHref = (url: string) =>
    url ? `${api.defaults.baseURL}${url}` : "";
  const textArea = (key: keyof HomeContent, label: string, rows = 3) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <textarea
        rows={rows}
        value={content[key]}
        onChange={(event) => update(key, event.currentTarget.value)}
      />
    </label>
  );
  const imageField = (key: CmsImageKey, label: string) => (
    <div className="field" key={key}>
      <span>{label}</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={uploading !== null}
        onChange={(event) =>
          void uploadImage(key, event.currentTarget.files?.[0])
        }
      />
      {uploading === key && <small>Uploading image…</small>}
      {content[key] && (
        <img
          className="cms-image-preview"
          src={mediaHref(content[key])}
          alt={`${label} preview`}
        />
      )}
    </div>
  );

  return (
    <div className="inner-page">
      <PageTitle
        eyebrow="WEBSITE CONTENT"
        title="Homepage"
        description="Edit the public homepage copy and images. Events, award categories and published sponsors are managed in their own sections."
        action={
          <Button
            onClick={() => void save()}
            loading={saving || uploading !== null}
          >
            Save homepage
          </Button>
        }
      />
      {error && <ErrorBanner message={error} />}
      {message && <div className="success-banner">{message}</div>}
      {pages.isError && (
        <ErrorBanner message="Homepage settings could not be loaded." />
      )}
      <Card>
        <div className="form-stack">
          {textArea("hero_title", "Hero heading", 4)}
          {textArea("hero_intro", "Hero introduction")}
          {imageField("hero_image", "Hero image")}
          {textArea("categories_title", "Categories heading", 3)}
          {textArea("categories_intro", "Default category description")}
          {imageField("feature_image", "Awards feature image")}
          {textArea("impact_title", "Impact heading", 3)}
          {textArea("impact_description", "Impact description")}
          {textArea("cta_title", "Call-to-action heading", 3)}
          {textArea("cta_description", "Call-to-action description")}
          {textArea("sponsors_title", "Sponsors section heading", 2)}
          {textArea("hero_primary_cta", "Hero primary button")}
          {textArea("hero_secondary_cta", "Hero secondary link")}
          {textArea("hero_brand_label", "Hero image award label")}
          {textArea("hero_location", "Hero image location")}
          {textArea("edition_label", "Hero edition label")}
          {textArea("categories_eyebrow", "Categories section label")}
          {textArea("categories_link_label", "Categories header link")}
          {textArea("category_list_label", "Category list label")}
          {textArea("category_all_label", "Category list link")}
          {textArea("impact_eyebrow", "Impact section label")}
          {textArea("impact_cta", "Impact link")}
          {textArea("events_eyebrow", "Events section label")}
          {textArea("events_title", "Events heading", 3)}
          {textArea("events_link_label", "Events header link")}
          {textArea("event_detail_label", "Event card link")}
          {textArea("sponsors_eyebrow", "Sponsors section label")}
          {textArea("sponsors_link_label", "Sponsors header link")}
          {textArea("cta_eyebrow", "Final call-to-action label")}
          {textArea("cta_primary", "Final primary button")}
          {textArea("cta_secondary", "Final secondary link")}
          {textArea("scroll_note", "Footer scroll note")}
          {textArea("categories_count_label", "Category count label ({count})")}
          {textArea("categories_catalog_label", "Category catalog label")}
          {textArea("categories_empty_title", "Empty categories title")}
          {textArea("categories_empty_text", "Empty categories message")}
          {textArea("category_stat_label", "Category statistic label")}
          {textArea("category_stat_caption", "Category statistic caption")}
          {textArea("edition_stat_label", "Edition statistic label")}
          {textArea("edition_stat_caption", "Edition statistic caption")}
          {textArea("event_location_fallback", "Missing event location")}
          {textArea("events_empty_title", "Empty events title")}
          {textArea("events_empty_text", "Empty events message")}
          {textArea("sponsor_website_label", "Sponsor link label")}
          {textArea("hero_image_alt", "Hero image description")}
          {textArea("feature_image_alt", "Awards feature image description")}
          <label className="field">
            <span>Publish homepage changes</span>
            <input
              type="checkbox"
              checked={published}
              onChange={(event) => setPublished(event.currentTarget.checked)}
            />
          </label>
          <div>
            <Button
              onClick={() => void save()}
              loading={saving || uploading !== null}
            >
              Save homepage
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
