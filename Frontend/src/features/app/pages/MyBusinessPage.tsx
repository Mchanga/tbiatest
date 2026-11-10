import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  PageTitle,
} from "../../../components/ui";
import { api, unwrap } from "../../../lib/api";

type Business = {
  id: string;
  organisation_name: string;
  verification_status: string;
  region: string | null;
  created_at: string;
  sector: string | null;
  registration_number: string | null;
  tin: string | null;
  website: string | null;
  description: string | null;
  country: string;
  district_city: string | null;
  year_established: number | null;
  employees_count: number | null;
};

export function MyBusinessPage() {
  const [organisationName, setOrganisationName] = useState("");
  const [sector, setSector] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [tin, setTin] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState("Tanzania");
  const [region, setRegion] = useState("");
  const [districtCity, setDistrictCity] = useState("");
  const [yearEstablished, setYearEstablished] = useState("");
  const [employeesCount, setEmployeesCount] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingBusiness, setViewingBusiness] = useState<Business | null>(null);
  const [saving, setSaving] = useState(false);
  const businesses = useQuery({
    queryKey: ["my-businesses"],
    queryFn: async () =>
      unwrap<Business[]>((await api.get("/businesses/mine")).data),
  });

  const resetForm = () => {
    setOrganisationName("");
    setSector("");
    setRegistrationNumber("");
    setTin("");
    setWebsite("");
    setDescription("");
    setCountry("Tanzania");
    setRegion("");
    setDistrictCity("");
    setYearEstablished("");
    setEmployeesCount("");
    setEditingId(null);
  };

  const editBusiness = (business: Business) => {
    setEditingId(business.id);
    setOrganisationName(business.organisation_name);
    setSector(business.sector ?? "");
    setRegistrationNumber(business.registration_number ?? "");
    setTin(business.tin ?? "");
    setWebsite(business.website ?? "");
    setDescription(business.description ?? "");
    setCountry(business.country ?? "Tanzania");
    setRegion(business.region ?? "");
    setDistrictCity(business.district_city ?? "");
    setYearEstablished(
      business.year_established ? String(business.year_established) : "",
    );
    setEmployeesCount(
      business.employees_count === null ? "" : String(business.employees_count),
    );
    setErrorMessage("");
    setSuccessMessage("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const payload = {
        organisation_name: organisationName,
        ...(sector ? { sector } : {}),
        ...(registrationNumber
          ? { registration_number: registrationNumber }
          : {}),
        ...(tin ? { tin } : {}),
        ...(website ? { website } : {}),
        ...(description ? { description } : {}),
        ...(country ? { country } : {}),
        ...(region ? { region } : {}),
        ...(districtCity ? { district_city: districtCity } : {}),
        ...(yearEstablished
          ? { year_established: Number(yearEstablished) }
          : {}),
        ...(employeesCount ? { employees_count: Number(employeesCount) } : {}),
      };
      if (editingId) {
        await api.patch(`/businesses/${editingId}`, payload);
        setSuccessMessage(
          "Business profile updated. An approved profile returns to pending verification after an edit.",
        );
      } else {
        await api.post("/businesses", payload);
        setSuccessMessage("Business profile submitted for verification.");
      }
      resetForm();
      await businesses.refetch();
    } catch (error) {
      setErrorMessage(
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Business profile could not be submitted.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="BUSINESS ACCOUNT"
        title="My businesses"
        description="Submit your organisation profile for TBIA verification."
      />
      {businesses.error && (
        <ErrorBanner message="Your business profiles could not be loaded. Please try again." />
      )}
      {businesses.data?.map((business) => (
        <Card className="business-submission-card" key={business.id}>
          <div>
            <p className="eyebrow">VERIFICATION STATUS</p>
            <h2>{business.organisation_name}</h2>
            <p>
              {business.region || "Region not provided"} · Submitted{" "}
              {new Date(business.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="management-actions">
            <span className="status">{business.verification_status}</span>
            <Button
              variant="secondary"
              onClick={() => setViewingBusiness(business)}
            >
              View
            </Button>
            <Button variant="secondary" onClick={() => editBusiness(business)}>
              Edit
            </Button>
          </div>
        </Card>
      ))}
      {viewingBusiness && (
        <Card className="management-editor">
          <div className="card-heading">
            <h2>{viewingBusiness.organisation_name}</h2>
            <Button variant="ghost" onClick={() => setViewingBusiness(null)}>
              Close
            </Button>
          </div>
          <dl className="management-details">
            {Object.entries(viewingBusiness).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll("_", " ")}</dt>
                <dd>
                  {value === null || value === undefined ? "—" : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
      <Card>
        <h2>
          {editingId ? "Edit business profile" : "Submit a business profile"}
        </h2>
        <p>
          Submitted profiles will appear in the business verification dashboard
          with a pending status.
        </p>
        {errorMessage && <ErrorBanner message={errorMessage} />}
        {successMessage && (
          <div className="success-banner">{successMessage}</div>
        )}
        <form className="form-stack business-profile-form" onSubmit={submit}>
          <Field
            label="Organisation name"
            required
            value={organisationName}
            onChange={(event) => setOrganisationName(event.target.value)}
          />
          <Field
            label="Sector"
            value={sector}
            onChange={(event) => setSector(event.target.value)}
          />
          <Field
            label="Registration number"
            value={registrationNumber}
            onChange={(event) => setRegistrationNumber(event.target.value)}
          />
          <Field
            label="TIN"
            value={tin}
            onChange={(event) => setTin(event.target.value)}
          />
          <Field
            label="Website"
            type="url"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
          <Field
            label="Country"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          />
          <Field
            label="Region"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
          />
          <Field
            label="District / city"
            value={districtCity}
            onChange={(event) => setDistrictCity(event.target.value)}
          />
          <Field
            label="Year established"
            type="number"
            min="1800"
            max="2100"
            value={yearEstablished}
            onChange={(event) => setYearEstablished(event.target.value)}
          />
          <Field
            label="Number of employees"
            type="number"
            min="0"
            value={employeesCount}
            onChange={(event) => setEmployeesCount(event.target.value)}
          />
          <label className="field business-profile-wide">
            <span>Description</span>
            <textarea
              rows={4}
              maxLength={10000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="business-profile-wide">
            <Button
              type="submit"
              loading={saving}
              disabled={!organisationName.trim()}
            >
              {editingId ? "Save business changes" : "Submit for verification"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel edit
              </Button>
            )}
          </div>
        </form>
      </Card>
    </>
  );
}
