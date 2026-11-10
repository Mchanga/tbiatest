import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../../../lib/api";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  PageTitle,
  SelectField,
} from "../../../components/ui";
import { LookupField } from "../../../components/ManagementWorkspace";

export function NominationCreatePage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formInstance, setFormInstance] = useState(0);
  const [nomineeSelection, setNomineeSelection] = useState<
    "business" | "user" | ""
  >("");
  const [businessResetToken, setBusinessResetToken] = useState(0);
  const [userResetToken, setUserResetToken] = useState(0);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    setMessage("");
    setError("");
    setSaving(true);
    const form = new FormData(formElement);
    const categoryId = String(form.get("edition_category_id") ?? "");
    const businessId = String(form.get("nominee_business_id") ?? "");
    const userId = String(form.get("nominee_user_id") ?? "");
    const nomineePhoto = form.get("nominee_photo");
    if (!categoryId || Number.isNaN(Number(categoryId))) {
      setError("Select an award category from the search results.");
      setSaving(false);
      return;
    }
    if (Boolean(businessId) === Boolean(userId)) {
      setError(
        "Select either a business or an individual nominee from the search results.",
      );
      setSaving(false);
      return;
    }
    let nomineePhotoPath: string | undefined;
    if (nomineePhoto instanceof File && nomineePhoto.size > 0) {
      const imageData = new FormData();
      imageData.append("file", nomineePhoto);
      try {
        const upload = await api.post<{ data: { url: string } }>(
          "/cms/media",
          imageData,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
        nomineePhotoPath = upload.data.data.url;
      } catch (uploadError) {
        setError(
          (uploadError as { response?: { data?: { message?: string } } })
            .response?.data?.message || "The photo could not be uploaded.",
        );
        setSaving(false);
        return;
      }
    }
    const payload = {
      edition_category_id: Number(categoryId),
      nomination_kind: form.get("nomination_kind"),
      ...(businessId ? { nominee_business_id: Number(businessId) } : {}),
      ...(userId ? { nominee_user_id: Number(userId) } : {}),
      nominee_full_name: form.get("nominee_full_name"),
      nominee_organisation: form.get("nominee_organisation") || undefined,
      nominee_email: form.get("nominee_email") || undefined,
      nominee_photo_path: nomineePhotoPath,
      reason_for_nomination: form.get("reason_for_nomination"),
      achievements: form.get("achievements") || undefined,
      consent_accepted: form.get("consent_accepted") === "on",
      status: "submitted",
    };
    try {
      await api.post("/nominations", payload);
      setMessage("Nomination submitted. You can track it in your account.");
      setFormInstance((current) => current + 1);
      setNomineeSelection("");
      setBusinessResetToken(0);
      setUserResetToken(0);
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ||
          "Could not submit nomination. Check the required fields and your permissions.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="wrap inner-page">
      <PageTitle
        eyebrow="RECOGNISE EXCELLENCE"
        title="Make a nomination"
        description="Put forward a Tanzanian business or entrepreneur whose work deserves to be seen."
      />
      <Card className="nomination-form-card">
        {message && <div className="success-banner">{message}</div>}
        {error && <ErrorBanner message={error} />}
        <form className="form-stack" key={formInstance} onSubmit={submit}>
          <div className="form-two">
            <LookupField
              label="Award category"
              name="edition_category_id"
              required
              lookup={{
                endpoint: "/awards/edition-categories",
                valueField: "edition_category_id",
                valueType: "number",
                labelFields: ["edition_name", "category_name"],
                staticParams: { purpose: "nomination" },
              }}
            />
            <SelectField
              label="Nomination type"
              name="nomination_kind"
              required
            >
              <option value="business">Business</option>
              <option value="entrepreneur">Entrepreneur</option>
              <option value="company">Company</option>
              <option value="institution">Institution</option>
              <option value="investor">Investor</option>
              <option value="self">Self nomination</option>
            </SelectField>
          </div>
          <label className="field">
            <span>Nominee photo (optional, up to 10 MB)</span>
            <input
              type="file"
              name="nominee_photo"
              accept="image/png,image/jpeg,image/webp"
            />
          </label>
          <LookupField
            label="Search for a business"
            name="nominee_business_id"
            lookup={{
              endpoint: "/businesses",
              valueField: "id",
              valueType: "number",
              labelFields: ["organisation_name", "region"],
              minSearchLength: 2,
            }}
            resetToken={businessResetToken}
            onSelect={(value) => {
              if (value) setNomineeSelection("business");
              else
                setNomineeSelection((current) =>
                  current === "business" ? "" : current,
                );
              if (value) setUserResetToken((current) => current + 1);
            }}
          />
          <LookupField
            label="Search for a person"
            name="nominee_user_id"
            lookup={{
              endpoint: "/nominations/nominee-users",
              valueField: "id",
              valueType: "number",
              labelFields: ["full_name", "account_type"],
              minSearchLength: 2,
            }}
            resetToken={userResetToken}
            onSelect={(value) => {
              if (value) setNomineeSelection("user");
              else
                setNomineeSelection((current) =>
                  current === "user" ? "" : current,
                );
              if (value) setBusinessResetToken((current) => current + 1);
            }}
          />
          <small>
            Choose one nominee only.{" "}
            {nomineeSelection
              ? `${nomineeSelection === "business" ? "Business" : "Individual"} selected.`
              : ""}
          </small>
          <Field
            label="Nominee name"
            name="nominee_full_name"
            required
            minLength={2}
            maxLength={200}
            placeholder="Person or business name"
          />
          <div className="form-two">
            <Field
              label="Business or organisation"
              name="nominee_organisation"
              maxLength={200}
              placeholder="Organisation name"
            />
            <Field
              label="Email (optional)"
              name="nominee_email"
              type="email"
              placeholder="contact@business.co.tz"
            />
          </div>
          <label className="field">
            <span>
              Why should this nominee receive an award? (at least 20 characters)
            </span>
            <textarea
              name="reason_for_nomination"
              minLength={20}
              maxLength={10000}
              required
              rows={5}
            />
          </label>
          <label className="field">
            <span>Key achievements</span>
            <textarea name="achievements" maxLength={10000} rows={4} />
          </label>
          <label className="check-label">
            <input type="checkbox" name="consent_accepted" required /> I confirm
            I have permission to submit this nomination.
          </label>
          <Button type="submit" loading={saving}>
            Submit nomination
          </Button>
        </form>
      </Card>
    </div>
  );
}
