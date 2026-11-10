import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../lib/api";
import { useAuth } from "../features/auth/AuthProvider";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  PageTitle,
  SelectField,
} from "./ui";

type Row = Record<string, unknown>;

export type ManagementField = {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "url"
    | "number"
    | "datetime-local"
    | "textarea"
    | "checkbox"
    | "json"
    | "select"
    | "lookup"
    | "image";
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
  options?: Array<{ value: string; label: string }>;
  lookup?: LookupSource;
  imageUploadEndpoint?: string;
  placeholder?: string;
};

export type LookupSource = {
  endpoint: string;
  valueField: string;
  valueType?: "number" | "string";
  labelFields: string[];
  minSearchLength?: number;
  queryParam?: string;
  staticParams?: Record<string, string | number | boolean>;
};

export function LookupField({
  name,
  label,
  required,
  lookup,
  placeholder,
  onSelect,
  resetToken,
}: {
  name: string;
  label: string;
  required?: boolean;
  lookup: LookupSource;
  placeholder?: string;
  onSelect?: (value: string, row: Row | null) => void;
  resetToken?: number;
}) {
  const [search, setSearch] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    setSearch("");
    setSelectedValue("");
    setSelectedLabel("");
    setFocused(false);
  }, [resetToken]);
  const minLength = lookup.minSearchLength ?? 1;
  const labelsFor = (row: Row) =>
    lookup.labelFields
      .map((field) => row[field])
      .filter(
        (value) =>
          value !== null && value !== undefined && String(value).trim(),
      )
      .map(String)
      .join(" · ");
  const results = useQuery({
    queryKey: ["lookup", lookup.endpoint, lookup.staticParams, search],
    enabled: focused && search.trim().length >= minLength,
    queryFn: async () => {
      const response = (
        await api.get(lookup.endpoint, {
          params: {
            ...lookup.staticParams,
            [lookup.queryParam ?? "search"]: search.trim(),
          },
        })
      ).data;
      const data = unwrap<unknown>(response);
      if (Array.isArray(data)) return data as Row[];
      if (typeof data === "object" && data !== null && "data" in data) {
        const rows = (data as { data?: unknown }).data;
        if (Array.isArray(rows)) return rows as Row[];
      }
      return [];
    },
  });
  const matchingResults = (results.data ?? []).filter((row) =>
    `${labelsFor(row)} ${String(row[lookup.valueField] ?? "")}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  return (
    <label className="field lookup-field">
      <span>{label}</span>
      <input
        type="text"
        required={required}
        autoComplete="off"
        value={focused ? search : selectedLabel}
        placeholder={placeholder ?? `Search ${label.toLowerCase()}`}
        onFocus={() => {
          setFocused(true);
          setSearch("");
        }}
        onChange={(event) => {
          setSearch(event.currentTarget.value);
          setSelectedValue("");
          setSelectedLabel("");
          onSelect?.("", null);
        }}
        onBlur={() => {
          window.setTimeout(() => setFocused(false), 150);
        }}
      />
      <input type="hidden" name={name} value={selectedValue} />
      {focused && search.trim().length < minLength && (
        <small>
          Enter at least {minLength} character{minLength === 1 ? "" : "s"} to
          search.
        </small>
      )}
      {focused && results.isLoading && <small>Searching…</small>}
      {focused && results.error && (
        <small className="field-error">Could not load matching records.</small>
      )}
      {focused && matchingResults.length > 0 && (
        <div className="lookup-results" role="listbox">
          {matchingResults.map((row, index) => {
            const value = String(row[lookup.valueField] ?? "");
            const display = labelsFor(row) || "Unnamed record";
            return (
              <button
                type="button"
                role="option"
                aria-selected={selectedValue === value}
                key={`${value}-${index}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setSelectedValue(value);
                  setSelectedLabel(display);
                  setSearch("");
                  setFocused(false);
                  onSelect?.(value, row);
                }}
              >
                {display}
              </button>
            );
          })}
        </div>
      )}
      {focused &&
        matchingResults.length === 0 &&
        search.trim().length >= minLength && (
          <small>No matching records found.</small>
        )}
      {!focused && selectedLabel && <small>Selected: {selectedLabel}</small>}
    </label>
  );
}

type ManagementAction = {
  label: (row: Row) => string;
  visible?: (row: Row) => boolean;
  run: (row: Row) => Promise<boolean | void>;
};

type PageResponse = {
  data: Row[];
  pagination?: {
    page: number;
    pages?: number;
    totalPages?: number;
    total: number;
  };
};

export function ManagementWorkspace({
  title,
  description,
  path,
  columns,
  createEndpoint,
  editEndpoint,
  createPermission,
  editPermission,
  createFields = [],
  editFields,
  exclusiveFields = [],
  actions = [],
}: {
  title: string;
  description: string;
  path: string;
  columns: string[];
  createEndpoint?: string;
  editEndpoint?: (id: string) => string;
  createPermission?: string;
  editPermission?: string;
  createFields?: ManagementField[];
  editFields?: ManagementField[];
  exclusiveFields?: string[][];
  actions?: ManagementAction[];
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"create" | "edit" | "details" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formInstance, setFormInstance] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [lookupResetTokens, setLookupResetTokens] = useState<
    Record<string, number>
  >({});
  const hasPermission = (permission?: string) =>
    !permission || Boolean(user?.permissions?.includes(permission));
  const canCreate = Boolean(createEndpoint) && hasPermission(createPermission);
  const canEdit = Boolean(editEndpoint) && hasPermission(editPermission);
  const queryPath = `${path}${path.includes("?") ? "&" : "?"}page=${page}&limit=25&search=${encodeURIComponent(search)}`;
  const { data, isLoading, error } = useQuery({
    queryKey: ["management", path, page, search],
    queryFn: async () => {
      const response = (await api.get(queryPath)).data as
        | PageResponse
        | Row[]
        | { data: Row[]; pagination?: PageResponse["pagination"] };
      if (Array.isArray(response))
        return { data: response } satisfies PageResponse;
      return "success" in response
        ? { data: response.data, pagination: response.pagination }
        : response;
    },
  });
  const rows = data?.data ?? [];
  const pagination = data?.pagination;
  const pageCount = pagination?.pages ?? pagination?.totalPages ?? 1;
  const selected = rows.find((row) => String(row.id) === selectedId);
  const fields = mode === "edit" ? (editFields ?? createFields) : createFields;

  const closeEditor = () => {
    setMode(null);
    setSelectedId(null);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const fieldValue = (value: unknown, type: ManagementField["type"]) => {
    if (value === null || value === undefined) return "";
    if (type === "datetime-local") {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) return "";
      const pad = (part: number) => String(part).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    if (type === "json") {
      return typeof value === "string" ? value : JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload: Row = {};
    for (const field of fields) {
      if (field.type === "image") {
        const selectedFile = formData.get(field.name);
        if (selectedFile instanceof File && selectedFile.size > 0) {
          if (!field.imageUploadEndpoint) {
            setErrorMessage(`${field.label} upload is not configured.`);
            return;
          }
          const uploadData = new FormData();
          uploadData.append("file", selectedFile);
          try {
            const uploaded = await api.post<{ data: { url: string } }>(
              field.imageUploadEndpoint,
              uploadData,
              { headers: { "Content-Type": "multipart/form-data" } },
            );
            payload[field.name] = uploaded.data.data.url;
          } catch (requestError) {
            const message = (
              requestError as { response?: { data?: { message?: string } } }
            ).response?.data?.message;
            setErrorMessage(message || `${field.label} could not be uploaded.`);
            return;
          }
        }
        continue;
      }
      if (field.type === "checkbox") {
        const element = form.elements.namedItem(field.name);
        payload[field.name] =
          element instanceof HTMLInputElement && element.checked;
        continue;
      }
      const value = String(formData.get(field.name) ?? "").trim();
      if (field.required && !value) {
        setErrorMessage(`Select a value for ${field.label}.`);
        return;
      }
      if (!value) continue;
      try {
        if (field.type === "number") payload[field.name] = Number(value);
        else if (
          field.type === "lookup" &&
          field.lookup?.valueType === "number"
        )
          payload[field.name] = Number(value);
        else if (field.type === "datetime-local")
          payload[field.name] = new Date(value).toISOString();
        else if (field.type === "json") payload[field.name] = JSON.parse(value);
        else payload[field.name] = value;
      } catch {
        setErrorMessage(`${field.label} must contain valid JSON.`);
        return;
      }
    }
    for (const group of exclusiveFields) {
      const selectedCount = group.filter((name) =>
        Boolean(String(formData.get(name) ?? "").trim()),
      ).length;
      if (selectedCount !== 1) {
        setErrorMessage(
          "Select exactly one nominee from the available search results.",
        );
        return;
      }
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      if (mode === "edit" && selectedId && editEndpoint) {
        await api.patch(editEndpoint(selectedId), payload);
        setSuccessMessage(`${title} record updated.`);
      } else if (mode === "create" && createEndpoint) {
        await api.post(createEndpoint, payload);
        setSuccessMessage(`${title} record created.`);
        setFormInstance((current) => current + 1);
      }
      await queryClient.invalidateQueries({ queryKey: ["management", path] });
    } catch (requestError) {
      const message = (
        requestError as { response?: { data?: { message?: string } } }
      ).response?.data?.message;
      setErrorMessage(
        message || `Could not save this ${title.toLowerCase()} record.`,
      );
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: ManagementAction, row: Row) => {
    setErrorMessage("");
    setSuccessMessage("");
    try {
      if ((await action.run(row)) === false) return;
      setSuccessMessage(`${title} action completed.`);
      await queryClient.invalidateQueries({ queryKey: ["management", path] });
    } catch (requestError) {
      const message = (
        requestError as { response?: { data?: { message?: string } } }
      ).response?.data?.message;
      setErrorMessage(
        message || `Could not update this ${title.toLowerCase()} record.`,
      );
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="TBIA PORTAL"
        title={title}
        description={description}
        action={
          canCreate ? (
            <Button
              onClick={() => {
                setSelectedId(null);
                setMode("create");
                setErrorMessage("");
                setSuccessMessage("");
              }}
            >
              Create {title}
            </Button>
          ) : undefined
        }
      />
      {error && (
        <ErrorBanner
          message={`Could not load ${title.toLowerCase()} records. Check your access or try again.`}
        />
      )}
      {errorMessage && <ErrorBanner message={errorMessage} />}
      {successMessage && <div className="success-banner">{successMessage}</div>}
      <div className="management-toolbar">
        <Field
          label={`Search ${title.toLowerCase()}`}
          value={search}
          onChange={(event) => {
            setPage(1);
            setSearch(event.currentTarget.value);
          }}
          placeholder="Search records"
        />
        {pagination && (
          <span>
            {pagination.total} records · page {page} of {pageCount}
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="skeleton-row" />
      ) : rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column.replaceAll("_", " ")}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row.id ?? row.reference_no ?? index)}>
                  {columns.map((column) => (
                    <td key={column}>
                      {typeof row[column] === "object" && row[column] !== null
                        ? JSON.stringify(row[column])
                        : String(row[column] ?? "—")}
                    </td>
                  ))}
                  <td>
                    <div className="management-actions">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelectedId(String(row.id));
                          setMode("details");
                          setErrorMessage("");
                        }}
                      >
                        View
                      </Button>
                      {canEdit && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelectedId(String(row.id));
                            setMode("edit");
                            setErrorMessage("");
                            setSuccessMessage("");
                          }}
                        >
                          Edit
                        </Button>
                      )}
                      {actions
                        .filter(
                          (action) => !action.visible || action.visible(row),
                        )
                        .map((action) => (
                          <Button
                            key={action.label(row)}
                            variant="secondary"
                            onClick={() => void runAction(action, row)}
                          >
                            {action.label(row)}
                          </Button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && (
          <div className="empty-card">
            <EmptyState
              title={`No ${title.toLowerCase()} records`}
              text={
                canCreate
                  ? `Create the first ${title.toLowerCase()} record to get started.`
                  : "Records will appear here when available."
              }
            />
          </div>
        )
      )}
      {pagination && pageCount > 1 && (
        <div className="management-pagination">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={page >= pageCount}
            onClick={() =>
              setPage((current) => Math.min(pageCount, current + 1))
            }
          >
            Next
          </Button>
        </div>
      )}
      {mode && (
        <Card className="management-editor">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                {mode === "details" ? "RECORD DETAILS" : "MANAGE RECORD"}
              </p>
              <h2>
                {mode === "details"
                  ? `View ${title.toLowerCase()}`
                  : `${mode === "create" ? "Create" : "Edit"} ${title.toLowerCase()}`}
              </h2>
            </div>
            <Button variant="ghost" onClick={closeEditor}>
              Close
            </Button>
          </div>
          {mode === "details" && selected ? (
            <dl className="management-details">
              {Object.entries(selected).map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replaceAll("_", " ")}</dt>
                  <dd>
                    {value === null || value === undefined
                      ? "—"
                      : typeof value === "object"
                        ? JSON.stringify(value, null, 2)
                        : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <form
              className="form-stack"
              key={`${mode}-${selectedId ?? "new"}-${formInstance}`}
              onSubmit={submit}
            >
              {fields.map((field) => {
                const initialValue =
                  mode === "edit" && selected
                    ? fieldValue(selected[field.name], field.type)
                    : "";
                if (field.type === "textarea" || field.type === "json") {
                  return (
                    <label className="field" key={field.name}>
                      <span>{field.label}</span>
                      <textarea
                        name={field.name}
                        defaultValue={initialValue}
                        required={field.required}
                        minLength={field.minLength}
                        maxLength={field.maxLength}
                        rows={field.type === "json" ? 5 : 4}
                        placeholder={field.placeholder}
                      />
                    </label>
                  );
                }
                if (field.type === "checkbox") {
                  return (
                    <label className="check-label" key={field.name}>
                      <input
                        type="checkbox"
                        name={field.name}
                        defaultChecked={initialValue === "true"}
                      />
                      {field.label}
                    </label>
                  );
                }
                if (field.type === "image") {
                  return (
                    <label className="field" key={field.name}>
                      <span>{field.label}</span>
                      {initialValue && (
                        <img
                          className="cms-image-preview"
                          src={`${api.defaults.baseURL}${initialValue}`}
                          alt={`${field.label} preview`}
                        />
                      )}
                      <input
                        type="file"
                        name={field.name}
                        accept="image/png,image/jpeg,image/webp"
                      />
                    </label>
                  );
                }
                if (field.type === "select") {
                  return (
                    <SelectField
                      key={field.name}
                      label={field.label}
                      name={field.name}
                      required={field.required}
                      defaultValue={initialValue}
                    >
                      <option value="">Select…</option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </SelectField>
                  );
                }
                if (field.type === "lookup" && field.lookup) {
                  const exclusiveGroup = exclusiveFields.find((group) =>
                    group.includes(field.name),
                  );
                  return (
                    <LookupField
                      key={field.name}
                      name={field.name}
                      label={field.label}
                      required={field.required}
                      lookup={field.lookup}
                      placeholder={field.placeholder}
                      resetToken={lookupResetTokens[field.name] ?? 0}
                      onSelect={(value) => {
                        if (!value || !exclusiveGroup) return;
                        setLookupResetTokens((current) => {
                          const next = { ...current };
                          for (const otherField of exclusiveGroup) {
                            if (otherField !== field.name) {
                              next[otherField] = (next[otherField] ?? 0) + 1;
                            }
                          }
                          return next;
                        });
                      }}
                    />
                  );
                }
                return (
                  <Field
                    key={field.name}
                    label={field.label}
                    name={field.name}
                    type={field.type ?? "text"}
                    required={field.required}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    minLength={field.minLength}
                    maxLength={field.maxLength}
                    placeholder={field.placeholder}
                    defaultValue={initialValue}
                  />
                );
              })}
              <div className="management-actions">
                <Button type="submit" loading={saving}>
                  {mode === "create" ? "Create record" : "Save changes"}
                </Button>
                <Button type="button" variant="secondary" onClick={closeEditor}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </>
  );
}
