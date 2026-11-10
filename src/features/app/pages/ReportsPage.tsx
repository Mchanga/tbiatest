import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, ErrorBanner, PageTitle } from "../../../components/ui";
import { api, unwrap } from "../../../lib/api";

export function ReportsPage() {
  const [report, setReport] = useState("dashboard");
  const { data, isLoading, error } = useQuery({
    queryKey: ["report", report],
    queryFn: async () =>
      unwrap<unknown>((await api.get(`/reports/${report}`)).data),
  });
  return (
    <>
      <PageTitle
        eyebrow="PROGRAMME INSIGHTS"
        title="Reports & analytics"
        description="Operational snapshots provided by the live TBIA reporting API."
      />
      <div className="report-tabs">
        {["dashboard", "nominations", "voting"].map((tab) => (
          <button
            className={report === tab ? "selected" : ""}
            key={tab}
            onClick={() => setReport(tab)}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      {error && (
        <ErrorBanner message="Reports require the reports.view permission." />
      )}
      {isLoading ? (
        <div className="skeleton-row" />
      ) : (
        <Card className="report-card">
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </Card>
      )}
    </>
  );
}
