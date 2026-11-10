import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Handshake } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, unwrap } from "../../lib/api";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  PageTitle,
  SelectField,
} from "../../components/ui";

type Package = {
  id: number;
  edition_id: number;
  edition: string;
  level: string;
  title: string;
  price: string;
  currency: string;
  benefits: string[];
};
export function SponsorshipPage() {
  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["sponsorship-packages"],
    queryFn: async () =>
      unwrap<Package[]>((await api.get("/sponsorship/packages")).data),
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage("");
    setError("");
    setSaving(true);
    const packageId = String(data.get("package_id") || "");
    const chosen = packages.find((item) => String(item.id) === packageId);
    const payload = {
      ...(chosen
        ? { edition_id: chosen.edition_id, package_id: chosen.id }
        : {}),
      organisation_name: data.get("organisation_name"),
      contact_person: data.get("contact_person"),
      job_title: data.get("job_title") || undefined,
      email: data.get("email"),
      phone: data.get("phone"),
      website: data.get("website") || undefined,
      proposed_contribution: data.get("proposed_contribution") || undefined,
      partnership_objectives: data.get("partnership_objectives") || undefined,
      comments: data.get("comments") || undefined,
    };
    try {
      const result = await api.post("/sponsorship/applications", payload);
      setMessage(
        `Thank you. Your application reference is ${result.data?.data?.reference_no || "received"}.`,
      );
      form.reset();
    } catch (e) {
      setError(
        (e as { response?: { data?: { message?: string } } }).response?.data
          ?.message ||
          "The application could not be sent. Please review the form and try again.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="wrap inner-page">
      <PageTitle
        eyebrow="PARTNER WITH PURPOSE"
        title="Let’s build something lasting."
        description="Put your organisation alongside the people and ideas shaping Tanzania’s future."
      />
      <div className="sponsor-intro">
        <div className="sponsor-icon">
          <Handshake />
        </div>
        <div>
          <h2>
            Make an impact that
            <br />
            <em>travels further.</em>
          </h2>
          <p>
            Connect your brand with ambitious enterprises, influential leaders
            and the next wave of Tanzanian growth.
          </p>
        </div>
      </div>
      <div className="subsection-heading">
        <div>
          <p className="eyebrow">PARTNERSHIP OPPORTUNITIES</p>
          <h2>Available packages.</h2>
        </div>
      </div>
      {isLoading ? (
        <div className="skeleton-row" />
      ) : packages.length ? (
        <div className="package-grid">
          {packages.map((item) => (
            <Card className="package-card" key={item.id}>
              <span className="eyebrow">
                {item.edition} · {item.level}
              </span>
              <h3>{item.title}</h3>
              <strong>
                {item.currency} {Number(item.price).toLocaleString()}
              </strong>
              <ul>
                {(Array.isArray(item.benefits) ? item.benefits : [])
                  .slice(0, 5)
                  .map((benefit, i) => (
                    <li key={i}>{benefit}</li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <div className="empty-card">
          <EmptyState
            title="Packages are being prepared"
            text="You can still share your partnership interest and the TBIA team will follow up."
          />
        </div>
      )}
      <Card className="sponsor-form-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">SPONSORSHIP ENQUIRY</p>
            <h2>Tell us about your partnership.</h2>
          </div>
        </div>
        {message && <div className="success-banner">{message}</div>}
        {error && <ErrorBanner message={error} />}
        <form className="form-stack" onSubmit={submit}>
          <div className="form-two">
            <Field
              label="Organisation"
              name="organisation_name"
              required
              minLength={2}
              maxLength={190}
            />
            <Field
              label="Contact person"
              name="contact_person"
              required
              minLength={2}
              maxLength={150}
            />
          </div>
          <div className="form-two">
            <Field label="Email" name="email" type="email" required />
            <Field
              label="Phone"
              name="phone"
              type="tel"
              required
              minLength={7}
            />
          </div>
          <div className="form-two">
            <Field
              label="Job title (optional)"
              name="job_title"
              maxLength={120}
            />
            <Field
              label="Website (optional)"
              name="website"
              type="url"
              placeholder="https://"
            />
          </div>
          <SelectField label="Package (optional)" name="package_id">
            <option value="">Let’s discuss options</option>
            {packages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {item.edition}
              </option>
            ))}
          </SelectField>
          <Field
            label="Proposed contribution (optional)"
            name="proposed_contribution"
            maxLength={255}
            placeholder="Funding, services, venue or other support"
          />
          <label className="field">
            <span>Partnership objectives (optional)</span>
            <textarea
              name="partnership_objectives"
              rows={4}
              maxLength={10000}
            />
          </label>
          <label className="field">
            <span>Anything else? (optional)</span>
            <textarea name="comments" rows={3} maxLength={10000} />
          </label>
          <Button type="submit" loading={saving}>
            Send partnership enquiry <ArrowRight size={15} />
          </Button>
        </form>
      </Card>
    </div>
  );
}
