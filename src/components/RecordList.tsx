import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../lib/api";
import { EmptyState, ErrorBanner, PageTitle } from "./ui";

type Row = Record<string, unknown>;

export function RecordList({
  path,
  title,
  description,
  columns,
}: {
  path: string;
  title: string;
  description: string;
  columns: string[];
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["records", path],
    queryFn: async () => unwrap<Row[]>((await api.get(path)).data),
  });
  return (
    <>
      <PageTitle
        eyebrow="TBIA PORTAL"
        title={title}
        description={description}
      />
      {error && (
        <ErrorBanner message="This information is unavailable for your account, or the service is temporarily offline." />
      )}
      {isLoading ? (
        <div className="skeleton-row" />
      ) : data?.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col.replaceAll("_", " ")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={String(row.id ?? row.reference_no ?? i)}>
                  {columns.map((col) => (
                    <td key={col}>{String(row[col] ?? "—")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && (
          <div className="empty-card">
            <EmptyState
              title="No records yet"
              text="Records from the awards programme will appear here when available."
            />
          </div>
        )
      )}
    </>
  );
}
