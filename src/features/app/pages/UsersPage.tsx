import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Button,
  EmptyState,
  ErrorBanner,
  PageTitle,
} from "../../../components/ui";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../auth/AuthProvider";

type Row = Record<string, unknown>;
type UserEditDraft = {
  full_name: string;
  phone: string;
  country: string;
  region: string;
  district_city: string;
  address: string;
  bio: string;
  linkedin_url: string;
  preferred_language: "en" | "sw";
};

export function UsersPage() {
  const { user } = useAuth();
  const canManageUsers = user?.permissions?.includes("users.manage") ?? false;
  const canManageRoles = user?.permissions?.includes("roles.manage") ?? false;
  const canDeleteUsers = user?.permissions?.includes("users.delete") ?? false;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);
  const [viewed, setViewed] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editDraft, setEditDraft] = useState<UserEditDraft>({
    full_name: "",
    phone: "",
    country: "",
    region: "",
    district_city: "",
    address: "",
    bio: "",
    linkedin_url: "",
    preferred_language: "en",
  });
  const [roleDraft, setRoleDraft] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["users", search, status, page],
    queryFn: async () => {
      const response = await api.get("/users", {
        params: {
          page,
          limit: 20,
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
        },
      });
      return response.data as {
        data: Row[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          pages: number;
        };
      };
    },
  });
  const users = data?.data ?? [];
  const pagination = data?.pagination;
  const roles = [
    "super_admin",
    "website_admin",
    "awards_manager",
    "nomination_officer",
    "judge",
    "sponsorship_manager",
    "finance_officer",
    "communications_manager",
    "registered_business",
    "registered_individual",
    "public_visitor",
  ];
  const updateStatus = async (uid: string, status: string) => {
    setActionError("");
    setSaving(true);
    try {
      await api.patch(`/users/${uid}/status`, { status });
      await refetch();
    } catch (e) {
      setActionError(
        (e as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Status update failed.",
      );
    } finally {
      setSaving(false);
    }
  };
  const openView = async (u: Row) => {
    setActionError("");
    try {
      const response = await api.get(`/users/${String(u.uid)}`);
      setViewed(response.data.data as Row);
    } catch (e) {
      setActionError(
        (e as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Could not load user details.",
      );
    }
  };
  const openEdit = async (u: Row) => {
    setActionError("");
    try {
      const response = await api.get(`/users/${String(u.uid)}`);
      const profile = response.data.data as Row;
      setEditing(profile);
      setEditDraft({
        full_name: String(profile.full_name ?? ""),
        phone: String(profile.phone ?? ""),
        country: String(profile.country ?? ""),
        region: String(profile.region ?? ""),
        district_city: String(profile.district_city ?? ""),
        address: String(profile.address ?? ""),
        bio: String(profile.bio ?? ""),
        linkedin_url: String(profile.linkedin_url ?? ""),
        preferred_language: profile.preferred_language === "sw" ? "sw" : "en",
      });
    } catch (e) {
      setActionError(
        (e as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Could not load user details for editing.",
      );
    }
  };
  const saveUser = async () => {
    if (!editing) return;
    setSaving(true);
    setActionError("");
    try {
      await api.patch(`/users/${String(editing.uid)}`, {
        full_name: editDraft.full_name,
        phone: editDraft.phone.trim() || null,
        country: editDraft.country.trim() || null,
        region: editDraft.region.trim() || null,
        district_city: editDraft.district_city.trim() || null,
        address: editDraft.address.trim() || null,
        bio: editDraft.bio.trim() || null,
        linkedin_url: editDraft.linkedin_url.trim() || null,
        preferred_language: editDraft.preferred_language,
      });
      setEditing(null);
      await refetch();
    } catch (e) {
      setActionError(
        (e as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "User details could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  };
  const deleteUser = async (u: Row) => {
    if (
      !window.confirm(
        `Delete the account for ${String(u.full_name ?? u.email ?? "this user")}?`,
      )
    ) {
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      await api.delete(`/users/${String(u.uid)}`);
      if (users.length === 1 && page > 1) setPage(page - 1);
      else await refetch();
    } catch (e) {
      setActionError(
        (e as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "User account could not be deleted.",
      );
    } finally {
      setSaving(false);
    }
  };
  const openRoles = (u: Row) => {
    setSelected(u);
    setRoleDraft(
      Array.isArray(u.role_slugs)
        ? (u.role_slugs as string[])
        : u.role_slug
          ? [String(u.role_slug)]
          : [],
    );
    setActionError("");
  };
  const saveRoles = async () => {
    if (!selected) return;
    setSaving(true);
    setActionError("");
    try {
      await api.put(`/users/${String(selected.uid)}/roles`, {
        roleSlugs: roleDraft,
      });
      setSelected(null);
      await refetch();
    } catch (e) {
      setActionError(
        (e as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Role update failed. Check your roles.manage access.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="ACCESS & IDENTITY"
        title="User management"
        description="Review registered accounts, update their access status and assign system roles."
      />
      <div className="list-tools">
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="Search name or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          className="filter-select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {["active", "pending", "suspended", "deactivated"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span>{pagination?.total ?? 0} accounts</span>
      </div>
      {actionError && <ErrorBanner message={actionError} />}
      {error && (
        <ErrorBanner message="Could not load users. This view requires the users.view permission." />
      )}
      {isLoading ? (
        <div className="skeleton-row" />
      ) : users.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Account type</th>
                <th>Role(s)</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const uid = String(u.uid ?? i);
                return (
                  <tr key={uid}>
                    <td>
                      <div className="person-cell">
                        <span className="avatar">
                          {String(u.full_name ?? "?").slice(0, 1)}
                        </span>
                        <span>
                          <b>{String(u.full_name ?? "—")}</b>
                          <small>{String(u.email ?? "")}</small>
                        </span>
                      </div>
                    </td>
                    <td>{String(u.account_type ?? "—")}</td>
                    <td>
                      {Array.isArray(u.role_slugs)
                        ? (u.role_slugs as string[]).join(", ")
                        : String(u.role_name ?? "—")}
                    </td>
                    <td>
                      {canManageUsers ? (
                        <select
                          className="filter-select status-select"
                          value={String(u.status ?? "pending")}
                          disabled={saving}
                          onChange={(e) =>
                            void updateStatus(uid, e.target.value)
                          }
                        >
                          {[
                            "pending",
                            "active",
                            "suspended",
                            "deactivated",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        String(u.status ?? "—")
                      )}
                    </td>
                    <td>
                      {u.created_at
                        ? new Date(String(u.created_at)).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button
                          variant="ghost"
                          aria-label={`View ${String(u.full_name ?? "user")}`}
                          onClick={() => void openView(u)}
                        >
                          <Eye size={15} /> View
                        </Button>
                        {canManageUsers && (
                          <>
                            <Button
                              variant="ghost"
                              aria-label={`Edit ${String(u.full_name ?? "user")}`}
                              onClick={() => openEdit(u)}
                            >
                              <Pencil size={15} /> Edit
                            </Button>
                          </>
                        )}
                        {canDeleteUsers && (
                          <Button
                            variant="danger"
                            aria-label={`Delete ${String(u.full_name ?? "user")}`}
                            disabled={saving}
                            onClick={() => void deleteUser(u)}
                          >
                            <Trash2 size={15} /> Delete
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          disabled={!canManageRoles || saving}
                          title={
                            canManageRoles
                              ? "Manage user roles"
                              : "You need the roles.manage permission"
                          }
                          onClick={() => openRoles(u)}
                        >
                          Roles
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        !error && (
          <div className="empty-card">
            <EmptyState
              title="No matching accounts"
              text="Try another search, or accounts will appear here as people register."
            />
          </div>
        )
      )}
      {pagination && pagination.pages > 1 && (
        <div className="pagination-controls" aria-label="User list pagination">
          <span>
            Showing {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total}
          </span>
          <div className="row-actions">
            <Button
              variant="secondary"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft size={16} /> Previous
            </Button>
            <span>
              Page {pagination.page} of {pagination.pages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= pagination.pages || isLoading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}
      {error && (
        <Button variant="secondary" onClick={() => void refetch()}>
          Try again
        </Button>
      )}

      {selected && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <section
            className="role-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-title"
          >
            <button
              className="modal-close"
              onClick={() => setSelected(null)}
              aria-label="Close"
            >
              ×
            </button>
            <p className="eyebrow">ACCESS CONTROL</p>
            <h2 id="role-title">Assign roles</h2>
            <p className="role-modal-user">
              {String(selected.full_name)} · {String(selected.email)}
            </p>
            <div className="role-checklist">
              {roles.map((role) => (
                <label key={role} className="check-label">
                  <input
                    type="checkbox"
                    checked={roleDraft.includes(role)}
                    onChange={(e) =>
                      setRoleDraft(
                        e.target.checked
                          ? [...roleDraft, role]
                          : roleDraft.filter((item) => item !== role),
                      )
                    }
                  />
                  <code>{role}</code>
                </label>
              ))}
            </div>
            {actionError && <ErrorBanner message={actionError} />}
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button
                loading={saving}
                disabled={!roleDraft.length}
                onClick={() => void saveRoles()}
              >
                Save roles
              </Button>
            </div>
          </section>
        </div>
      )}
      {viewed && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setViewed(null);
          }}
        >
          <section
            className="role-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-user-title"
          >
            <button
              className="modal-close"
              onClick={() => setViewed(null)}
              aria-label="Close"
            >
              ×
            </button>
            <p className="eyebrow">ACCOUNT DETAILS</p>
            <h2 id="view-user-title">{String(viewed.full_name ?? "User")}</h2>
            <dl className="user-details">
              <dt>Email</dt>
              <dd>{String(viewed.email ?? "—")}</dd>
              <dt>Phone</dt>
              <dd>{String(viewed.phone ?? "—")}</dd>
              <dt>Account type</dt>
              <dd>{String(viewed.account_type ?? "—")}</dd>
              <dt>Status</dt>
              <dd>{String(viewed.status ?? "—")}</dd>
              <dt>Roles</dt>
              <dd>
                {Array.isArray(viewed.role_slugs)
                  ? (viewed.role_slugs as string[]).join(", ")
                  : String(viewed.role_name ?? "—")}
              </dd>
              <dt>Country</dt>
              <dd>{String(viewed.country ?? "—")}</dd>
              <dt>Region / city</dt>
              <dd>
                {[viewed.region, viewed.district_city]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </dd>
              <dt>Address</dt>
              <dd>{String(viewed.address ?? "—")}</dd>
              <dt>Bio</dt>
              <dd>{String(viewed.bio ?? "—")}</dd>
              <dt>LinkedIn</dt>
              <dd>{String(viewed.linkedin_url ?? "—")}</dd>
              <dt>Language</dt>
              <dd>{String(viewed.preferred_language ?? "en")}</dd>
              <dt>Verified</dt>
              <dd>{viewed.is_verified ? "Yes" : "No"}</dd>
              <dt>Joined</dt>
              <dd>
                {viewed.created_at
                  ? new Date(String(viewed.created_at)).toLocaleString()
                  : "—"}
              </dd>
            </dl>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setViewed(null)}>
                Close
              </Button>
            </div>
          </section>
        </div>
      )}
      {editing && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <section
            className="role-modal edit-user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-title"
          >
            <button
              className="modal-close"
              onClick={() => setEditing(null)}
              aria-label="Close"
            >
              ×
            </button>
            <p className="eyebrow">USER MANAGEMENT</p>
            <h2 id="edit-user-title">Edit account</h2>
            <p className="role-modal-user">{String(editing.email ?? "")}</p>
            <div className="user-edit-fields">
              <label className="field">
                <span>Full name</span>
                <input
                  value={editDraft.full_name}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, full_name: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  type="tel"
                  value={editDraft.phone}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, phone: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Country</span>
                <input
                  value={editDraft.country}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, country: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Region</span>
                <input
                  value={editDraft.region}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, region: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>District / city</span>
                <input
                  value={editDraft.district_city}
                  onChange={(e) =>
                    setEditDraft({
                      ...editDraft,
                      district_city: e.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                <span>LinkedIn URL</span>
                <input
                  type="url"
                  value={editDraft.linkedin_url}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, linkedin_url: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Preferred language</span>
                <select
                  value={editDraft.preferred_language}
                  onChange={(e) =>
                    setEditDraft({
                      ...editDraft,
                      preferred_language: e.target.value === "sw" ? "sw" : "en",
                    })
                  }
                >
                  <option value="en">English</option>
                  <option value="sw">Kiswahili</option>
                </select>
              </label>
              <div className="user-edit-wide">
                <dl className="user-details">
                  <dt>Account type</dt>
                  <dd>{String(editing.account_type ?? "—")}</dd>
                  <dt>Status</dt>
                  <dd>
                    {String(editing.status ?? "—")} (change with Save status)
                  </dd>
                  <dt>Roles</dt>
                  <dd>
                    {Array.isArray(editing.role_slugs)
                      ? (editing.role_slugs as string[]).join(", ")
                      : String(editing.role_name ?? "—")}
                    {" (change with Roles)"}
                  </dd>
                  <dt>Verified</dt>
                  <dd>{editing.is_verified ? "Yes" : "No"}</dd>
                </dl>
              </div>
              <label className="field user-edit-wide">
                <span>Address</span>
                <textarea
                  rows={2}
                  value={editDraft.address}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, address: e.target.value })
                  }
                />
              </label>
              <label className="field user-edit-wide">
                <span>Bio</span>
                <textarea
                  rows={3}
                  value={editDraft.bio}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, bio: e.target.value })
                  }
                />
              </label>
            </div>
            {actionError && <ErrorBanner message={actionError} />}
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                loading={saving}
                disabled={editDraft.full_name.trim().length < 2}
                onClick={() => void saveUser()}
              >
                Save changes
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
