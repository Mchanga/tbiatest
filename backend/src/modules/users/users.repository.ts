import pool from "../../config/database.js";
import {
  insertAuditLog,
  type AuditRequestContext,
} from "../../services/audit.service.js";
import type {
  UpdateOwnProfileInput,
  UpdateUserInput,
} from "./users.validation.js";

export interface UserProfileRecord {
  uid: string;
  full_name: string;
  email: string;
  phone: string | null;
  account_type: string | null;
  status: string;
  is_verified: boolean;
  role_slug: string;
  role_name: string;
  role_slugs: string[];
  created_at: Date;
  photo_path: string | null;
  country: string;
  region: string | null;
  district_city: string | null;
  address: string | null;
  bio: string | null;
  linkedin_url: string | null;
  preferred_language: "en" | "sw";
}

export interface UserListRecord {
  uid: string;
  full_name: string;
  email: string;
  phone: string | null;
  account_type: string | null;
  status: string;
  is_verified: boolean;
  role_slug: string;
  role_name: string;
  role_slugs: string[];
  created_at: Date;
}

const profileSelect = `
  SELECT u.uid, u.full_name, u.email, u.phone, u.account_type, u.status,u.preferred_language,
         u.is_verified, u.created_at, r.slug AS role_slug, r.name AS role_name,
           ARRAY(SELECT assigned_role.slug FROM user_roles ur
             INNER JOIN roles assigned_role ON assigned_role.id = ur.role_id
             WHERE ur.user_id = u.id ORDER BY assigned_role.slug) AS role_slugs,
         up.photo_path, up.country, up.region, up.district_city, up.address,
         up.bio, up.linkedin_url
  FROM users u
  INNER JOIN roles r ON r.id = u.role_id
  LEFT JOIN user_profiles up ON up.user_id = u.id
`;

const userError = (
  message: string,
  statusCode: number,
): Error & { statusCode: number } =>
  Object.assign(new Error(message), { statusCode });

export const getUserProfile = async (
  uid: string,
): Promise<UserProfileRecord | null> => {
  const result = await pool.query<UserProfileRecord>(
    `${profileSelect} WHERE u.uid = $1 AND u.deleted_at IS NULL LIMIT 1`,
    [uid],
  );
  return result.rows[0] ?? null;
};

export const listUsers = async (filters: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  role?: string;
}): Promise<{ data: UserListRecord[]; total: number }> => {
  const conditions = ["u.deleted_at IS NULL"];
  const values: unknown[] = [];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    const position = values.length;
    conditions.push(
      `(u.full_name ILIKE $${position} OR u.email::text ILIKE $${position} OR u.phone ILIKE $${position})`,
    );
  }

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`u.status = $${values.length}`);
  }

  if (filters.role) {
    values.push(filters.role);
    conditions.push(
      `EXISTS (SELECT 1 FROM user_roles filter_ur
       INNER JOIN roles filter_role ON filter_role.id = filter_ur.role_id
       WHERE filter_ur.user_id = u.id AND filter_role.slug = $${values.length})`,
    );
  }

  const where = conditions.join(" AND ");
  const count = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM users u INNER JOIN roles r ON r.id = u.role_id WHERE ${where}`,
    values,
  );

  const queryValues = [
    ...values,
    filters.limit,
    (filters.page - 1) * filters.limit,
  ];
  const rows = await pool.query<UserListRecord>(
    `SELECT u.uid, u.full_name, u.email, u.phone, u.account_type, u.status,
          u.is_verified, u.created_at, r.slug AS role_slug, r.name AS role_name,
          ARRAY(SELECT assigned_role.slug FROM user_roles ur
          INNER JOIN roles assigned_role ON assigned_role.id = ur.role_id
          WHERE ur.user_id = u.id ORDER BY assigned_role.slug) AS role_slugs
     FROM users u
     INNER JOIN roles r ON r.id = u.role_id
     WHERE ${where}
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`,
    queryValues,
  );

  return { data: rows.rows, total: Number(count.rows[0].total) };
};

export const updateOwnProfile = async (
  uid: string,
  changes: UpdateOwnProfileInput,
  auditContext: AuditRequestContext,
): Promise<UserProfileRecord | null> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE uid = $1 AND deleted_at IS NULL FOR UPDATE",
      [uid],
    );

    if (user.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }

    const userId = user.rows[0].id;
    await client.query(
      `UPDATE users SET full_name = COALESCE($2, full_name),
         phone = COALESCE($3, phone), preferred_language = COALESCE($4, preferred_language), updated_at = NOW()
       WHERE id = $1`,
      [
        userId,
        changes.full_name ?? null,
        changes.phone ?? null,
        changes.preferred_language ?? null,
      ],
    );
    await client.query(
      "INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [userId],
    );
    await client.query(
      `UPDATE user_profiles SET
         country = COALESCE($2, country),
         region = COALESCE($3, region),
         district_city = COALESCE($4, district_city),
         address = COALESCE($5, address),
         bio = COALESCE($6, bio),
         linkedin_url = COALESCE($7, linkedin_url)
       WHERE user_id = $1`,
      [
        userId,
        changes.country ?? null,
        changes.region ?? null,
        changes.district_city ?? null,
        changes.address ?? null,
        changes.bio ?? null,
        changes.linkedin_url ?? null,
      ],
    );
    await insertAuditLog(client, {
      ...auditContext,
      actorUid: uid,
      action: "users.profile_updated",
      entityType: "users",
      entityId: userId,
      newValues: changes as Record<string, unknown>,
    });

    const profile = await client.query<UserProfileRecord>(
      `${profileSelect} WHERE u.id = $1 AND u.deleted_at IS NULL LIMIT 1`,
      [userId],
    );
    await client.query("COMMIT");
    return profile.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateManagedUser = async (
  uid: string,
  changes: UpdateUserInput,
  actorUid: string,
  auditContext: AuditRequestContext,
): Promise<UserProfileRecord | null> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{
      id: string;
      full_name: string;
      phone: string | null;
      country: string | null;
      region: string | null;
      district_city: string | null;
      address: string | null;
      bio: string | null;
      linkedin_url: string | null;
      preferred_language: "en" | "sw";
    }>(
      `SELECT u.id, u.full_name, u.phone, u.preferred_language,
         up.country, up.region, up.district_city, up.address, up.bio, up.linkedin_url
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.uid = $1 AND u.deleted_at IS NULL
       FOR UPDATE OF u`,
      [uid],
    );
    if (user.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }

    const userId = user.rows[0].id;
    await client.query(
      `UPDATE users SET
         full_name = CASE WHEN $2::boolean THEN $3 ELSE full_name END,
         phone = CASE WHEN $4::boolean THEN $5 ELSE phone END,
         preferred_language = CASE WHEN $6::boolean THEN $7 ELSE preferred_language END,
         updated_at = NOW()
       WHERE id = $1`,
      [
        userId,
        changes.full_name !== undefined,
        changes.full_name ?? null,
        changes.phone !== undefined,
        changes.phone ?? null,
        changes.preferred_language !== undefined,
        changes.preferred_language ?? null,
      ],
    );
    await client.query(
      "INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [userId],
    );
    await client.query(
      `UPDATE user_profiles SET
         country = CASE WHEN $2::boolean THEN $3 ELSE country END,
         region = CASE WHEN $4::boolean THEN $5 ELSE region END,
         district_city = CASE WHEN $6::boolean THEN $7 ELSE district_city END,
         address = CASE WHEN $8::boolean THEN $9 ELSE address END,
         bio = CASE WHEN $10::boolean THEN $11 ELSE bio END,
         linkedin_url = CASE WHEN $12::boolean THEN $13 ELSE linkedin_url END
       WHERE user_id = $1`,
      [
        userId,
        changes.country !== undefined,
        changes.country ?? null,
        changes.region !== undefined,
        changes.region ?? null,
        changes.district_city !== undefined,
        changes.district_city ?? null,
        changes.address !== undefined,
        changes.address ?? null,
        changes.bio !== undefined,
        changes.bio ?? null,
        changes.linkedin_url !== undefined,
        changes.linkedin_url ?? null,
      ],
    );
    await insertAuditLog(client, {
      ...auditContext,
      actorUid,
      action: "users.profile_updated",
      entityType: "users",
      entityId: user.rows[0].id,
      oldValues: {
        full_name: user.rows[0].full_name,
        phone: user.rows[0].phone,
        country: user.rows[0].country,
        region: user.rows[0].region,
        district_city: user.rows[0].district_city,
        address: user.rows[0].address,
        bio: user.rows[0].bio,
        linkedin_url: user.rows[0].linkedin_url,
        preferred_language: user.rows[0].preferred_language,
      },
      newValues: {
        full_name: changes.full_name ?? user.rows[0].full_name,
        phone: changes.phone === undefined ? user.rows[0].phone : changes.phone,
        country:
          changes.country === undefined
            ? user.rows[0].country
            : changes.country,
        region:
          changes.region === undefined ? user.rows[0].region : changes.region,
        district_city:
          changes.district_city === undefined
            ? user.rows[0].district_city
            : changes.district_city,
        address:
          changes.address === undefined
            ? user.rows[0].address
            : changes.address,
        bio: changes.bio === undefined ? user.rows[0].bio : changes.bio,
        linkedin_url:
          changes.linkedin_url === undefined
            ? user.rows[0].linkedin_url
            : changes.linkedin_url,
        preferred_language:
          changes.preferred_language ?? user.rows[0].preferred_language,
      },
    });
    const profile = await client.query<UserProfileRecord>(
      `${profileSelect} WHERE u.id = $1 AND u.deleted_at IS NULL LIMIT 1`,
      [user.rows[0].id],
    );
    await client.query("COMMIT");
    return profile.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateUserStatus = async (
  uid: string,
  status: string,
  actorUid: string,
  auditContext: AuditRequestContext,
): Promise<boolean> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query<{
      id: string;
      status: string;
      is_super_admin: boolean;
    }>(
      `SELECT u.id, u.status, EXISTS (
         SELECT 1 FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id AND r.slug = 'super_admin'
       ) AS is_super_admin
       FROM users u
       WHERE u.uid = $1 AND u.deleted_at IS NULL FOR UPDATE OF u`,
      [uid],
    );

    if (target.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }

    if (actorUid === uid && status !== "active") {
      throw userError("You cannot suspend or deactivate your own account", 403);
    }

    if (target.rows[0].is_super_admin && status !== "active") {
      const activeAdmins = await client.query<{ count: string }>(
        `SELECT COUNT(DISTINCT u.id) AS count FROM users u
         INNER JOIN user_roles ur ON ur.user_id = u.id
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE r.slug = 'super_admin' AND u.status = 'active'
           AND u.is_verified = TRUE AND u.deleted_at IS NULL`,
        [],
      );
      if (Number(activeAdmins.rows[0].count) <= 1) {
        throw userError(
          "The last active super admin cannot be suspended or deactivated",
          409,
        );
      }
    }

    await client.query(
      "UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1",
      [target.rows[0].id, status],
    );
    if (status !== "active") {
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1",
        [target.rows[0].id],
      );
    }
    await insertAuditLog(client, {
      ...auditContext,
      actorUid,
      action: "users.status_changed",
      entityType: "users",
      entityId: target.rows[0].id,
      oldValues: { status: target.rows[0].status },
      newValues: { status },
    });
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const softDeleteUser = async (
  uid: string,
  actorUid: string,
  auditContext: AuditRequestContext,
): Promise<boolean> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query<{
      id: string;
      status: string;
      is_super_admin: boolean;
    }>(
      `SELECT u.id, u.status, EXISTS (
         SELECT 1 FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id AND r.slug = 'super_admin'
       ) AS is_super_admin
       FROM users u
       WHERE u.uid = $1 AND u.deleted_at IS NULL FOR UPDATE OF u`,
      [uid],
    );

    if (target.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }
    if (actorUid === uid) {
      throw userError("You cannot delete your own account", 403);
    }
    if (target.rows[0].is_super_admin) {
      throw userError("Super admin accounts cannot be deleted", 409);
    }

    await client.query(
      `UPDATE users SET status = 'deactivated', deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [target.rows[0].id],
    );
    await client.query(
      "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1",
      [target.rows[0].id],
    );
    await insertAuditLog(client, {
      ...auditContext,
      actorUid,
      action: "users.deleted",
      entityType: "users",
      entityId: target.rows[0].id,
      oldValues: { status: target.rows[0].status },
      newValues: { status: "deactivated", deleted: true },
    });
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const assignUserRoles = async (
  uid: string,
  roleSlugs: string[],
  actorUid: string,
  actorRoleIds: number[],
  auditContext: AuditRequestContext,
): Promise<string[] | null> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const target = await client.query<{ id: string; status: string }>(
      "SELECT id, status FROM users WHERE uid = $1 AND deleted_at IS NULL FOR UPDATE",
      [uid],
    );
    if (target.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }

    const requestedRoles = await client.query<{ id: number; slug: string }>(
      "SELECT id, slug FROM roles WHERE slug = ANY($1::varchar[])",
      [roleSlugs],
    );
    if (requestedRoles.rowCount !== roleSlugs.length) {
      throw userError("One or more role slugs are invalid", 400);
    }

    const superAdminRole = requestedRoles.rows.find(
      (role) => role.slug === "super_admin",
    );
    if (superAdminRole) {
      if (!actorRoleIds.includes(superAdminRole.id)) {
        throw userError(
          "Only a super admin can assign the super_admin role",
          403,
        );
      }
    }

    const currentRoles = await client.query<{ slug: string }>(
      `SELECT r.slug FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 ORDER BY r.slug`,
      [target.rows[0].id],
    );
    const wasSuperAdmin = currentRoles.rows.some(
      (role) => role.slug === "super_admin",
    );
    const keepsSuperAdmin = roleSlugs.includes("super_admin");

    if (
      wasSuperAdmin &&
      !keepsSuperAdmin &&
      target.rows[0].status === "active"
    ) {
      const activeAdmins = await client.query<{ count: string }>(
        `SELECT COUNT(DISTINCT u.id) AS count
         FROM users u
         WHERE u.status = 'active' AND u.is_verified = TRUE AND u.deleted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id AND r.slug = 'super_admin'
           )
           AND u.id <> $1`,
        [target.rows[0].id],
      );
      if (Number(activeAdmins.rows[0].count) === 0) {
        throw userError(
          "The last active super admin cannot lose that role",
          409,
        );
      }
    }

    const actor = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE uid = $1 AND deleted_at IS NULL",
      [actorUid],
    );
    if (actor.rowCount !== 1) {
      throw userError("Audit actor was not found", 401);
    }

    await client.query("DELETE FROM user_roles WHERE user_id = $1", [
      target.rows[0].id,
    ]);
    for (const role of requestedRoles.rows) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id, assigned_by)
         VALUES ($1, $2, $3)`,
        [target.rows[0].id, role.id, actor.rows[0].id],
      );
    }
    await client.query(
      "UPDATE users SET role_id = $2, updated_at = NOW() WHERE id = $1",
      [target.rows[0].id, requestedRoles.rows[0].id],
    );
    await insertAuditLog(client, {
      ...auditContext,
      actorUid,
      action: "users.roles_changed",
      entityType: "users",
      entityId: target.rows[0].id,
      oldValues: { roleSlugs: currentRoles.rows.map((role) => role.slug) },
      newValues: { roleSlugs: requestedRoles.rows.map((role) => role.slug) },
    });

    await client.query("COMMIT");
    return requestedRoles.rows.map((role) => role.slug);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
