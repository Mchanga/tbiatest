import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageTitle,
} from "../../../components/ui";
import { api } from "../../../lib/api";
import { useAuth } from "../../auth/AuthProvider";

type Role = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  is_staff: boolean;
  assigned_users: number;
  permission_slugs: string[];
};

type Permission = {
  id: number;
  slug: string;
  module: string;
  description: string | null;
};

type ApiError = { response?: { data?: { message?: string } } };

export function AccessManagementPage() {
  const { user } = useAuth();
  const canManageRoles = user?.permissions?.includes("roles.manage") ?? false;
  const canManagePermissions =
    user?.permissions?.includes("permissions.manage") ?? false;
  const canViewPermissions =
    user?.permissions?.includes("permissions.view") ?? false;
  const rolesQuery = useQuery({
    queryKey: ["access-roles"],
    queryFn: async () => (await api.get("/access/roles")).data.data as Role[],
  });
  const permissionsQuery = useQuery({
    queryKey: ["access-permissions"],
    enabled: canViewPermissions,
    queryFn: async () =>
      (await api.get("/access/permissions")).data.data as Permission[],
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<string[]>([]);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [newRoleSlug, setNewRoleSlug] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [editingDetails, setEditingDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const roles = rolesQuery.data ?? [];
  const permissions = permissionsQuery.data ?? [];
  const selectedRole = roles.find((role) => role.id === selectedId) ?? null;
  const groupedPermissions = useMemo(
    () =>
      permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
        (groups[permission.module] ??= []).push(permission);
        return groups;
      }, {}),
    [permissions],
  );

  useEffect(() => {
    if (!selectedRole) return;
    setPermissionDraft(selectedRole.permission_slugs ?? []);
    setRoleName(selectedRole.name);
    setRoleDescription(selectedRole.description ?? "");
    setEditingDetails(false);
  }, [selectedId, rolesQuery.data]);

  const saveRoleDetails = async () => {
    if (!selectedRole) return;
    setSaving(true);
    setErrorMessage("");
    try {
      await api.patch(`/access/roles/${selectedRole.id}`, {
        name: roleName,
        description: roleDescription || null,
      });
      setEditingDetails(false);
      await rolesQuery.refetch();
    } catch (error) {
      setErrorMessage(
        (error as ApiError).response?.data?.message ||
          "Role details could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const createRole = async () => {
    setSaving(true);
    setErrorMessage("");
    try {
      const response = await api.post("/access/roles", {
        slug: newRoleSlug.trim(),
        name: newRoleName.trim(),
        ...(newRoleDescription.trim()
          ? { description: newRoleDescription.trim() }
          : {}),
      });
      setNewRoleSlug("");
      setNewRoleName("");
      setNewRoleDescription("");
      const created = response.data.data as Role;
      await rolesQuery.refetch();
      setSelectedId(created.id);
    } catch (error) {
      setErrorMessage(
        (error as ApiError).response?.data?.message ||
          "Role could not be created.",
      );
    } finally {
      setSaving(false);
    }
  };

  const savePermissions = async () => {
    if (!selectedRole) return;
    setSaving(true);
    setErrorMessage("");
    try {
      await api.put(`/access/roles/${selectedRole.id}/permissions`, {
        permissionSlugs: permissionDraft,
      });
      await rolesQuery.refetch();
    } catch (error) {
      setErrorMessage(
        (error as ApiError).response?.data?.message ||
          "Role permissions could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (role: Role) => {
    if (
      !window.confirm(`Delete the ${role.name} role? This cannot be undone.`)
    ) {
      return;
    }
    setSaving(true);
    setErrorMessage("");
    try {
      await api.delete(`/access/roles/${role.id}`);
      if (selectedId === role.id) setSelectedId(null);
      await rolesQuery.refetch();
    } catch (error) {
      setErrorMessage(
        (error as ApiError).response?.data?.message ||
          "Role could not be deleted.",
      );
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (slug: string) => {
    setPermissionDraft((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug],
    );
  };

  return (
    <>
      <PageTitle
        eyebrow="SYSTEM GOVERNANCE"
        title="Roles & permissions"
        description="Define role responsibilities and control access using the platform's registered permissions."
      />
      {errorMessage && <ErrorBanner message={errorMessage} />}
      {(rolesQuery.error || (canViewPermissions && permissionsQuery.error)) && (
        <ErrorBanner message="Access data could not be loaded. This page requires the corresponding roles.view and permissions.view permissions." />
      )}
      <div className="access-management-grid">
        <Card className="access-role-list">
          <div className="card-heading">
            <div>
              <p className="eyebrow">ROLE DIRECTORY</p>
              <h2>System roles</h2>
            </div>
            <span className="api-health">{roles.length} roles</span>
          </div>
          {canManageRoles && (
            <details className="create-role">
              <summary>
                <Plus size={14} /> Create a role
              </summary>
              <div className="form-stack">
                <label className="field">
                  <span>Role slug</span>
                  <input
                    value={newRoleSlug}
                    placeholder="e.g. regional_manager"
                    onChange={(event) =>
                      setNewRoleSlug(
                        event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, ""),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Display name</span>
                  <input
                    value={newRoleName}
                    placeholder="Regional Manager"
                    onChange={(event) => setNewRoleName(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Description</span>
                  <textarea
                    rows={2}
                    value={newRoleDescription}
                    onChange={(event) =>
                      setNewRoleDescription(event.target.value)
                    }
                  />
                </label>
                <Button
                  loading={saving}
                  disabled={
                    newRoleSlug.length < 2 || newRoleName.trim().length < 2
                  }
                  onClick={() => void createRole()}
                >
                  Create role
                </Button>
              </div>
            </details>
          )}
          {rolesQuery.isLoading ? (
            <div className="skeleton-row" />
          ) : roles.length ? (
            <div className="access-role-items">
              {roles.map((role) => (
                <button
                  className={`access-role-item ${role.id === selectedId ? "selected" : ""}`}
                  key={role.id}
                  onClick={() => {
                    setSelectedId(role.id);
                    setErrorMessage("");
                  }}
                >
                  <span className="access-role-icon">
                    <ShieldCheck size={16} />
                  </span>
                  <span className="access-role-copy">
                    <b>{role.name}</b>
                    <small>
                      {role.slug} · {role.assigned_users} users
                    </small>
                  </span>
                  <span className="access-role-count">
                    {role.permission_slugs.length}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No roles found"
              text="The system role directory is currently empty."
            />
          )}
        </Card>

        <div className="access-role-detail">
          {selectedRole ? (
            <>
              <Card>
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">ROLE PROFILE</p>
                    <h2>{selectedRole.name}</h2>
                  </div>
                  <KeyRound size={18} />
                </div>
                <p className="access-role-slug">
                  {selectedRole.slug}
                  {selectedRole.is_staff && <span>Staff role</span>}
                </p>
                {editingDetails ? (
                  <div className="form-stack">
                    <label className="field">
                      <span>Display name</span>
                      <input
                        value={roleName}
                        onChange={(event) => setRoleName(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Description</span>
                      <textarea
                        rows={3}
                        value={roleDescription}
                        onChange={(event) =>
                          setRoleDescription(event.target.value)
                        }
                      />
                    </label>
                    <div className="row-actions">
                      <Button
                        variant="secondary"
                        onClick={() => setEditingDetails(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        loading={saving}
                        onClick={() => void saveRoleDetails()}
                      >
                        Save details
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="access-role-description">
                      {selectedRole.description || "No description provided."}
                    </p>
                    <div className="row-actions">
                      {canManageRoles &&
                        selectedRole.slug !== "super_admin" && (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() => setEditingDetails(true)}
                            >
                              Edit role
                            </Button>
                            <Button
                              variant="danger"
                              disabled={
                                saving || selectedRole.assigned_users > 0
                              }
                              title={
                                selectedRole.assigned_users > 0
                                  ? "Reassign users before deleting this role"
                                  : "Delete role"
                              }
                              onClick={() => void deleteRole(selectedRole)}
                            >
                              <Trash2 size={14} /> Delete
                            </Button>
                          </>
                        )}
                    </div>
                  </>
                )}
              </Card>

              <Card className="permission-matrix-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">LEAST-PRIVILEGE ACCESS</p>
                    <h2>Permission assignments</h2>
                  </div>
                  <span className="api-health">
                    {permissionDraft.length} assigned
                  </span>
                </div>
                {!canViewPermissions ? (
                  <div className="permission-locked">
                    Permission definitions require the permissions.view access.
                  </div>
                ) : selectedRole.slug === "super_admin" ? (
                  <div className="permission-locked">
                    <ShieldCheck size={17} />
                    Super Admin retains all registered permissions to protect
                    system access.
                  </div>
                ) : (
                  <>
                    <p className="permission-matrix-help">
                      Permissions are defined by the backend and enforced by API
                      middleware. Assign only the access this role needs.
                    </p>
                    <div className="permission-module-list">
                      {Object.entries(groupedPermissions).map(
                        ([module, modulePermissions]) => (
                          <section className="permission-module" key={module}>
                            <h3>
                              {module.replaceAll("_", " ")}
                              <span>
                                {
                                  modulePermissions.filter((permission) =>
                                    permissionDraft.includes(permission.slug),
                                  ).length
                                }{" "}
                                / {modulePermissions.length}
                              </span>
                            </h3>
                            <div className="permission-options">
                              {modulePermissions.map((permission) => (
                                <label
                                  className="permission-option"
                                  key={permission.id}
                                >
                                  <input
                                    type="checkbox"
                                    checked={permissionDraft.includes(
                                      permission.slug,
                                    )}
                                    disabled={!canManagePermissions || saving}
                                    onChange={() =>
                                      togglePermission(permission.slug)
                                    }
                                  />
                                  <span>
                                    <b>{permission.slug}</b>
                                    <small>
                                      {permission.description ||
                                        "No description"}
                                    </small>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </section>
                        ),
                      )}
                    </div>
                    {canManagePermissions && (
                      <div className="permission-save">
                        <Button
                          loading={saving}
                          onClick={() => void savePermissions()}
                        >
                          <Save size={15} /> Save permissions
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </>
          ) : (
            <Card className="access-empty">
              <EmptyState
                title="Select a role"
                text="Choose a role to review its assigned permissions and users."
              />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
