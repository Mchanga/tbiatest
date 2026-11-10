import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  Button,
  EmptyState,
  ErrorBanner,
  PageTitle,
} from "../../../components/ui";
import { api } from "../../../lib/api";

type AuditLog = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  request_id: string | null;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
};

type AuditResult = {
  data: AuditLog[];
  pagination: { page: number; limit: number; total: number; pages: number };
};

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = useQuery({
    queryKey: ["audit-logs", page, search, action, entityType, from, to],
    queryFn: async () => {
      const response = await api.get("/access/audit-logs", {
        params: {
          page,
          limit: 25,
          ...(search ? { search } : {}),
          ...(action ? { action } : {}),
          ...(entityType ? { entity_type: entityType } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
      });
      return response.data as AuditResult;
    },
  });
  const logs = query.data?.data ?? [];
  const pagination = query.data?.pagination;
  const resetFilters = () => {
    setPage(1);
    setSearch("");
    setAction("");
    setEntityType("");
    setFrom("");
    setTo("");
  };

  return (
    <>
      <PageTitle
        eyebrow="SYSTEM GOVERNANCE"
        title="Audit logs"
        description="Review a traceable record of administrative and account activity."
      />
      <div className="list-tools audit-filters">
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="Search actor or record ID"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <input
          className="filter-select"
          aria-label="Filter by action"
          placeholder="Action"
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
        />
        <input
          className="filter-select"
          aria-label="Filter by entity type"
          placeholder="Entity type"
          value={entityType}
          onChange={(event) => {
            setEntityType(event.target.value);
            setPage(1);
          }}
        />
        <label className="audit-date-filter">
          <span>From</span>
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="audit-date-filter">
          <span>To</span>
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <Button variant="ghost" onClick={resetFilters}>
          Clear
        </Button>
      </div>
      {query.error && (
        <ErrorBanner message="Audit logs could not be loaded. This page requires audit_logs.view." />
      )}
      {query.isLoading ? (
        <div className="skeleton-row" />
      ) : logs.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Request</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>
                    <b>{log.actor_name || "System"}</b>
                    <small className="audit-actor-email">
                      {log.actor_email || "System event"}
                    </small>
                  </td>
                  <td>
                    <code>{log.action}</code>
                  </td>
                  <td>
                    {log.entity_type || "—"}
                    {log.entity_id ? ` #${log.entity_id}` : ""}
                  </td>
                  <td>
                    <code>{log.request_id || "—"}</code>
                  </td>
                  <td>
                    <details className="audit-change-details">
                      <summary>View</summary>
                      <pre>
                        {JSON.stringify(
                          {
                            before: log.old_values,
                            after: log.new_values,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !query.error && (
          <div className="empty-card">
            <EmptyState
              title="No activity found"
              text="Try changing the filters or date range."
            />
          </div>
        )
      )}
      {pagination && pagination.pages > 1 && (
        <div className="pagination-controls">
          <span>{pagination.total.toLocaleString()} audit records</span>
          <div className="row-actions">
            <Button
              variant="secondary"
              disabled={page <= 1 || query.isLoading}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <span>
              Page {pagination.page} of {pagination.pages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= pagination.pages || query.isLoading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
