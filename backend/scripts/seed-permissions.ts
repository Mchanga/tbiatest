import "dotenv/config";
import pool from "../src/config/database.js";

const permissions = [
  {
    slug: "dashboard.view",
    module: "dashboard",
    description: "View dashboard",
  },

  { slug: "users.view", module: "users", description: "View users" },
  { slug: "users.manage", module: "users", description: "Manage users" },
  { slug: "users.delete", module: "users", description: "Delete users" },
  {
    slug: "users.verify",
    module: "users",
    description: "Verify user accounts",
  },

  { slug: "roles.view", module: "roles", description: "View roles" },
  { slug: "roles.manage", module: "roles", description: "Manage roles" },
  {
    slug: "permissions.view",
    module: "permissions",
    description: "View permissions",
  },
  {
    slug: "permissions.manage",
    module: "permissions",
    description: "Manage permissions",
  },

  {
    slug: "profiles.view_own",
    module: "profiles",
    description: "View own profile",
  },
  {
    slug: "profiles.manage_own",
    module: "profiles",
    description: "Manage own profile",
  },
  {
    slug: "profiles.manage_all",
    module: "profiles",
    description: "Manage all profiles",
  },
  {
    slug: "businesses.verify",
    module: "businesses",
    description: "Verify business profiles",
  },

  { slug: "cms.view", module: "cms", description: "View CMS content" },
  { slug: "cms.manage", module: "cms", description: "Manage website content" },
  {
    slug: "leadership.manage",
    module: "leadership",
    description: "Manage leadership profiles",
  },
  { slug: "news.manage", module: "news", description: "Manage news" },
  { slug: "gallery.manage", module: "gallery", description: "Manage gallery" },
  {
    slug: "downloads.manage",
    module: "downloads",
    description: "Manage downloads",
  },
  {
    slug: "enquiries.manage",
    module: "enquiries",
    description: "Manage contact enquiries",
  },
  {
    slug: "newsletter.manage",
    module: "newsletter",
    description: "Manage newsletter",
  },

  { slug: "awards.view", module: "awards", description: "View awards" },
  {
    slug: "awards.manage",
    module: "awards",
    description: "Manage award editions",
  },
  {
    slug: "categories.manage",
    module: "categories",
    description: "Manage award categories",
  },

  {
    slug: "nominations.create",
    module: "nominations",
    description: "Create nominations",
  },
  {
    slug: "nominations.view_own",
    module: "nominations",
    description: "View own nominations",
  },
  {
    slug: "nominations.view_all",
    module: "nominations",
    description: "View all nominations",
  },
  {
    slug: "nominations.review",
    module: "nominations",
    description: "Review nominations",
  },
  {
    slug: "nominations.request_information",
    module: "nominations",
    description: "Request additional information",
  },
  {
    slug: "nominations.change_status",
    module: "nominations",
    description: "Change nomination status",
  },
  {
    slug: "nominations.assign_judges",
    module: "nominations",
    description: "Assign judges to nominations",
  },

  { slug: "judges.view", module: "judges", description: "View judges" },
  {
    slug: "judges.manage",
    module: "judges",
    description: "Manage judges and assignments",
  },
  {
    slug: "judges.view_assigned",
    module: "judges",
    description: "View assigned nominations",
  },
  {
    slug: "evaluations.view",
    module: "evaluations",
    description: "View evaluation results",
  },
  {
    slug: "evaluations.submit",
    module: "evaluations",
    description: "Submit judge scores",
  },
  {
    slug: "evaluations.manage",
    module: "evaluations",
    description: "Manage evaluations",
  },
  {
    slug: "conflicts.declare",
    module: "evaluations",
    description: "Declare conflict of interest",
  },

  {
    slug: "voting.view",
    module: "voting",
    description: "View voting information",
  },
  { slug: "voting.cast", module: "voting", description: "Cast a vote" },
  {
    slug: "voting.manage",
    module: "voting",
    description: "Manage voting periods and results",
  },

  { slug: "sponsors.view", module: "sponsors", description: "View sponsors" },
  {
    slug: "sponsors.manage",
    module: "sponsors",
    description: "Manage sponsors",
  },
  {
    slug: "sponsorships.manage",
    module: "sponsors",
    description: "Manage sponsorship packages and agreements",
  },

  {
    slug: "payments.view_own",
    module: "payments",
    description: "View own payments",
  },
  {
    slug: "payments.view",
    module: "payments",
    description: "View all payments",
  },
  {
    slug: "payments.manage",
    module: "payments",
    description: "Manage payments",
  },
  {
    slug: "finance.view",
    module: "finance",
    description: "View financial reports",
  },
  {
    slug: "finance.manage",
    module: "finance",
    description: "Manage financial operations",
  },

  { slug: "events.view", module: "events", description: "View events" },
  { slug: "events.manage", module: "events", description: "Manage events" },
  { slug: "tickets.manage", module: "tickets", description: "Manage tickets" },
  {
    slug: "tickets.checkin",
    module: "tickets",
    description: "Validate ticket check-ins",
  },

  { slug: "winners.view", module: "winners", description: "View winners" },
  { slug: "winners.manage", module: "winners", description: "Manage winners" },
  {
    slug: "certificates.view_own",
    module: "certificates",
    description: "View own certificates",
  },
  {
    slug: "certificates.manage",
    module: "certificates",
    description: "Manage certificates",
  },

  {
    slug: "notifications.view_own",
    module: "notifications",
    description: "View own notifications",
  },
  {
    slug: "messages.view_own",
    module: "messages",
    description: "View own messages",
  },
  {
    slug: "communications.manage",
    module: "communications",
    description: "Manage communications",
  },

  {
    slug: "reports.view",
    module: "reports",
    description: "View system reports",
  },
  {
    slug: "settings.manage",
    module: "settings",
    description: "Manage system settings",
  },
  { slug: "audit_logs.view", module: "audit", description: "View audit logs" },

  {
    slug: "public.content.view",
    module: "public",
    description: "View public website content",
  },
  {
    slug: "public.contact.submit",
    module: "public",
    description: "Submit contact enquiries",
  },
  {
    slug: "public.newsletter.subscribe",
    module: "public",
    description: "Subscribe to newsletter",
  },
];

const rolePermissions = {
  super_admin: permissions.map((p) => p.slug),

  website_admin: [
    "dashboard.view",
    "users.view",
    "users.verify",
    "profiles.manage_all",
    "cms.view",
    "cms.manage",
    "categories.manage",
    "events.manage",
    "sponsors.manage",
    "sponsorships.manage",
    "leadership.manage",
    "news.manage",
    "gallery.manage",
    "downloads.manage",
    "enquiries.manage",
    "newsletter.manage",
    "awards.view",
    "nominations.view_all",
    "events.view",
    "reports.view",
  ],

  awards_manager: [
    "dashboard.view",
    "awards.view",
    "awards.manage",
    "categories.manage",
    "nominations.view_all",
    "nominations.review",
    "nominations.request_information",
    "nominations.change_status",
    "nominations.assign_judges",
    "judges.view",
    "judges.manage",
    "evaluations.view",
    "evaluations.manage",
    "winners.view",
    "winners.manage",
    "certificates.manage",
    "reports.view",
  ],

  nomination_officer: [
    "dashboard.view",
    "profiles.manage_all",
    "nominations.view_all",
    "nominations.review",
    "nominations.request_information",
    "nominations.change_status",
  ],

  judge: [
    "dashboard.view",
    "judges.view_assigned",
    "evaluations.submit",
    "conflicts.declare",
  ],

  sponsorship_manager: [
    "dashboard.view",
    "sponsors.view",
    "sponsors.manage",
    "sponsorships.manage",
    "payments.view",
    "reports.view",
  ],

  finance_officer: [
    "dashboard.view",
    "payments.view",
    "payments.manage",
    "finance.view",
    "finance.manage",
    "reports.view",
  ],

  communications_manager: [
    "dashboard.view",
    "cms.view",
    "cms.manage",
    "categories.manage",
    "events.manage",
    "sponsors.manage",
    "sponsorships.manage",
    "leadership.manage",
    "news.manage",
    "gallery.manage",
    "downloads.manage",
    "newsletter.manage",
    "communications.manage",
    "enquiries.manage",
  ],

  registered_business: [
    "profiles.view_own",
    "profiles.manage_own",
    "nominations.create",
    "nominations.view_own",
    "payments.view_own",
    "certificates.view_own",
    "notifications.view_own",
    "messages.view_own",
    "voting.cast",
  ],

  registered_individual: [
    "profiles.view_own",
    "profiles.manage_own",
    "nominations.create",
    "nominations.view_own",
    "payments.view_own",
    "certificates.view_own",
    "notifications.view_own",
    "messages.view_own",
    "voting.cast",
  ],

  public_visitor: [
    "public.content.view",
    "public.contact.submit",
    "public.newsletter.subscribe",
    "awards.view",
    "sponsors.view",
    "events.view",
    "winners.view",
    "voting.view",
  ],
} as const;

async function seedPermissions(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const roleSlugs = Object.keys(rolePermissions);

    const roleResult = await client.query<{ slug: string }>(
      "SELECT slug FROM roles WHERE slug = ANY($1::varchar[])",
      [roleSlugs],
    );
    const existingRoles = new Set(roleResult.rows.map((row) => row.slug));
    const missingRoles = roleSlugs.filter((slug) => !existingRoles.has(slug));

    if (missingRoles.length > 0) {
      throw new Error(`Missing roles in database: ${missingRoles.join(", ")}`);
    }

    const permissionValues: unknown[] = [];
    const permissionRows = permissions.map((permission, index) => {
      const offset = index * 3;
      permissionValues.push(
        permission.slug,
        permission.module,
        permission.description,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
    });

    await client.query(
      `INSERT INTO permissions (slug, module, description)
       VALUES ${permissionRows.join(", ")}
       ON CONFLICT (slug) DO UPDATE SET
         module = EXCLUDED.module,
         description = EXCLUDED.description`,
      permissionValues,
    );

    const mappings = Object.entries(rolePermissions).flatMap(
      ([roleSlug, permissionSlugs]) =>
        permissionSlugs.map((permissionSlug) => ({
          role_slug: roleSlug,
          permission_slug: permissionSlug,
        })),
    );

    const mappingJson = JSON.stringify(mappings);

    await client.query(
      `WITH desired AS (
         SELECT r.id AS role_id, p.id AS permission_id
         FROM jsonb_to_recordset($1::jsonb) AS x(role_slug text, permission_slug text)
         INNER JOIN roles r ON r.slug = x.role_slug
         INNER JOIN permissions p ON p.slug = x.permission_slug
       )
       DELETE FROM role_permissions rp USING roles r
       WHERE rp.role_id = r.id
         AND r.slug = ANY($2::varchar[])
         AND NOT EXISTS (
           SELECT 1 FROM desired d
           WHERE d.role_id = rp.role_id AND d.permission_id = rp.permission_id
         )`,
      [mappingJson, roleSlugs],
    );

    const result = await client.query(
      `WITH desired AS (
         SELECT r.id AS role_id, p.id AS permission_id
         FROM jsonb_to_recordset($1::jsonb) AS x(role_slug text, permission_slug text)
         INNER JOIN roles r ON r.slug = x.role_slug
         INNER JOIN permissions p ON p.slug = x.permission_slug
       )
       INSERT INTO role_permissions (role_id, permission_id)
       SELECT role_id, permission_id FROM desired
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [mappingJson],
    );
    await client.query("COMMIT");

    console.log("----------------------------------");
    console.log("TBIA PERMISSIONS SEEDED SUCCESSFULLY");
    console.log("----------------------------------");
    console.log("Permissions:", permissions.length);
    console.log("Roles:", roleSlugs.length);
    console.log("Mappings added:", result.rowCount);
    console.log("----------------------------------");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Permission seeding failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void seedPermissions();
