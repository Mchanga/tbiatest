import { useState } from "react";
import { ManagementWorkspace } from "../../../components/ManagementWorkspace";
import { RecordList } from "../../../components/RecordList";
import { Button, PageTitle } from "../../../components/ui";
import { api } from "../../../lib/api";

type SponsorshipTab = "applications" | "sponsors" | "packages";

const editionLookup = {
  endpoint: "/awards/editions",
  valueField: "id",
  valueType: "number" as const,
  labelFields: ["name", "year"],
  minSearchLength: 1,
};
const levelLookup = {
  endpoint: "/sponsorship/management/levels",
  valueField: "id",
  valueType: "number" as const,
  labelFields: ["name"],
  minSearchLength: 1,
};

export function SponsorshipAdminPage() {
  const [tab, setTab] = useState<SponsorshipTab>("applications");
  return (
    <div className="inner-page">
      <PageTitle
        eyebrow="PARTNERSHIPS"
        title="Sponsorship"
        description="Review enquiries and manage the public sponsor directory and partnership packages."
      />
      <div
        className="management-actions"
        role="tablist"
        aria-label="Sponsorship management"
      >
        {(["applications", "sponsors", "packages"] as const).map((value) => (
          <Button
            key={value}
            variant={tab === value ? "primary" : "secondary"}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {value === "applications"
              ? "Applications"
              : value === "sponsors"
                ? "Published sponsors"
                : "Packages"}
          </Button>
        ))}
      </div>
      {tab === "applications" && (
        <RecordList
          path="/sponsorship/applications"
          title="Sponsorship applications"
          description="Review partner applications and track follow-up."
          columns={[
            "reference_no",
            "organisation_name",
            "contact_person",
            "email",
            "proposed_contribution",
            "status",
            "created_at",
          ]}
        />
      )}
      {tab === "sponsors" && (
        <ManagementWorkspace
          path="/sponsorship/management/sponsors"
          title="Sponsor"
          description="Create and publish sponsor cards shown on the public homepage."
          columns={["name", "edition", "level", "is_published", "website_url"]}
          createEndpoint="/sponsorship/management/sponsors"
          editEndpoint={(id) => `/sponsorship/management/sponsors/${id}`}
          createPermission="sponsors.manage"
          editPermission="sponsors.manage"
          createFields={[
            {
              name: "edition_id",
              label: "Award edition",
              type: "lookup",
              required: true,
              lookup: editionLookup,
            },
            {
              name: "level_id",
              label: "Sponsorship level",
              type: "lookup",
              required: true,
              lookup: levelLookup,
            },
            {
              name: "name",
              label: "Sponsor name",
              required: true,
              maxLength: 190,
            },
            {
              name: "logo_path",
              label: "Sponsor logo",
              type: "image",
              imageUploadEndpoint: "/cms/media",
            },
            {
              name: "description",
              label: "Sponsor content",
              type: "textarea",
              maxLength: 10000,
            },
            {
              name: "website_url",
              label: "Website link",
              type: "url",
              maxLength: 255,
            },
            {
              name: "sort_order",
              label: "Display order",
              type: "number",
              min: 0,
              max: 32767,
            },
            {
              name: "is_published",
              label: "Publish sponsor",
              type: "checkbox",
            },
          ]}
          actions={[
            {
              label: () => "Unpublish",
              visible: (row) => row.is_published === true,
              run: async (row) => {
                if (
                  !window.confirm(
                    `Unpublish ${String(row.name)} from the public site?`,
                  )
                )
                  return false;
                await api.delete(`/sponsorship/management/sponsors/${row.id}`);
              },
            },
          ]}
        />
      )}
      {tab === "packages" && (
        <ManagementWorkspace
          path="/sponsorship/management/packages"
          title="Sponsorship package"
          description="Manage packages shown to prospective sponsors on the public sponsorship page."
          columns={[
            "title",
            "edition",
            "level",
            "price",
            "currency",
            "is_active",
          ]}
          createEndpoint="/sponsorship/management/packages"
          editEndpoint={(id) => `/sponsorship/management/packages/${id}`}
          createPermission="sponsorships.manage"
          editPermission="sponsorships.manage"
          createFields={[
            {
              name: "edition_id",
              label: "Award edition",
              type: "lookup",
              required: true,
              lookup: editionLookup,
            },
            {
              name: "level_id",
              label: "Sponsorship level",
              type: "lookup",
              required: true,
              lookup: levelLookup,
            },
            {
              name: "title",
              label: "Package name",
              required: true,
              maxLength: 190,
            },
            {
              name: "price",
              label: "Price",
              type: "number",
              required: true,
              min: 0,
              max: 1000000000,
              step: 0.01,
            },
            {
              name: "currency",
              label: "Currency",
              required: true,
              maxLength: 3,
              placeholder: "TZS",
            },
            {
              name: "slots_available",
              label: "Available slots (optional)",
              type: "number",
              min: 1,
            },
            {
              name: "benefits",
              label: "Benefits (JSON array)",
              type: "json",
              placeholder: '["Brand visibility", "Event access"]',
            },
            {
              name: "is_exclusive",
              label: "Exclusive package",
              type: "checkbox",
            },
            {
              name: "is_active",
              label: "Available to applicants",
              type: "checkbox",
            },
          ]}
          actions={[
            {
              label: () => "Deactivate",
              visible: (row) => row.is_active === true,
              run: async (row) => {
                if (
                  !window.confirm(
                    `Deactivate ${String(row.title)}? Existing applications will be retained.`,
                  )
                )
                  return false;
                await api.delete(`/sponsorship/management/packages/${row.id}`);
              },
            },
          ]}
        />
      )}
    </div>
  );
}
