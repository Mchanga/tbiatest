import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Award,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Handshake,
  Layers3,
  KeyRound,
  ScrollText,
  ShieldCheck,
  Trophy,
  Users,
  Vote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { api, unwrap } from "../../../lib/api";
import { Card, EmptyState, ErrorBanner } from "../../../components/ui";
import { useAuth } from "../../auth/AuthProvider";

type DashboardReport = {
  approvedBusinesses: number;
  nominationsByStatus: Array<{ status: string; count: number }>;
  voting: { votes: number; distinctVoters: number };
  paymentsByStatus: Array<{ status: string; count: number; amount: string }>;
  publishedSponsors: number;
  eventsByStatus: Array<{ status: string; count: number }>;
  judging: { activeJudges: number; assignments: number };
};

type DashboardRow = Record<string, unknown>;

type RoleProfile = {
  label: string;
  focus: string;
  icon: LucideIcon;
};

const roleProfiles: Record<string, RoleProfile> = {
  super_admin: {
    label: "Super Admin",
    focus: "System governance, access control and programme oversight.",
    icon: ShieldCheck,
  },
  website_admin: {
    label: "Website Admin",
    focus: "Public website content and digital experience.",
    icon: FileText,
  },
  awards_manager: {
    label: "Awards Manager",
    focus: "Editions, categories and the complete awards lifecycle.",
    icon: Award,
  },
  nomination_officer: {
    label: "Nomination Officer",
    focus: "Application review, verification and nominee support.",
    icon: Layers3,
  },
  judge: {
    label: "Judge",
    focus: "Your assigned evaluations and judging deadlines.",
    icon: ShieldCheck,
  },
  sponsorship_manager: {
    label: "Sponsorship Manager",
    focus: "Sponsor relationships, packages and partnership activity.",
    icon: Handshake,
  },
  finance_officer: {
    label: "Finance Officer",
    focus: "Payments, reconciliation and financial oversight.",
    icon: CircleDollarSign,
  },
  communications_manager: {
    label: "Communications Manager",
    focus: "Official announcements, content and communications.",
    icon: Activity,
  },
  registered_business: {
    label: "Registered Business",
    focus: "Your business profile, nominations and participation.",
    icon: BriefcaseBusiness,
  },
  registered_individual: {
    label: "Registered Individual",
    focus: "Your profile, nominations and awards participation.",
    icon: Users,
  },
  public_visitor: {
    label: "Public Visitor",
    focus: "Explore public award information and activities.",
    icon: Trophy,
  },
};

const quickActions: Array<{
  label: string;
  description: string;
  to: string;
  permission?: string;
  anyPermission?: string[];
  accountType?: string;
  icon: LucideIcon;
}> = [
  {
    label: "User management",
    description: "Accounts and access",
    to: "/app/users",
    permission: "users.view",
    icon: Users,
  },
  {
    label: "Roles & permissions",
    description: "Govern access across the platform",
    to: "/app/access",
    permission: "roles.view",
    icon: KeyRound,
  },
  {
    label: "Audit logs",
    description: "Review traceable system activity",
    to: "/app/audit-logs",
    permission: "audit_logs.view",
    icon: ScrollText,
  },
  {
    label: "Business verification",
    description: "Review business profiles",
    to: "/app/businesses",
    permission: "businesses.verify",
    icon: BriefcaseBusiness,
  },
  {
    label: "My business",
    description: "Profile and verification",
    to: "/app/my-business",
    accountType: "business",
    icon: BriefcaseBusiness,
  },
  {
    label: "Nominations",
    description: "Review submissions",
    to: "/app/nominations",
    permission: "nominations.view_all",
    icon: Layers3,
  },
  {
    label: "Submit a nomination",
    description: "Recognise an outstanding nominee",
    to: "/nominations",
    permission: "nominations.create",
    icon: Award,
  },
  {
    label: "Voting",
    description: "Vote or view current voting information",
    to: "/vote",
    anyPermission: ["voting.cast", "voting.view"],
    icon: Vote,
  },
  {
    label: "Awards & categories",
    description: "Explore editions and award categories",
    to: "/awards",
    permission: "awards.view",
    icon: Trophy,
  },
  {
    label: "Announce award winners",
    description: "Record and publish official award results",
    to: "/app/winners",
    permission: "winners.manage",
    icon: Trophy,
  },
  {
    label: "Public nominee directory",
    description: "Discover recognised businesses",
    to: "/nominees",
    permission: "public.content.view",
    icon: Users,
  },
  {
    label: "Public events",
    description: "View upcoming TBIA events",
    to: "/events",
    permission: "events.view",
    icon: CalendarDays,
  },
  {
    label: "Judging assignments",
    description: "Your authorised assignments",
    to: "/app/judging",
    anyPermission: ["judges.view_assigned", "judges.manage"],
    icon: ShieldCheck,
  },
  {
    label: "Voting",
    description: "Voting activity and controls",
    to: "/app/voting",
    permission: "voting.manage",
    icon: Vote,
  },
  {
    label: "Payments",
    description: "Visible payment records",
    to: "/app/payments",
    anyPermission: ["payments.view", "payments.view_own"],
    icon: CircleDollarSign,
  },
  {
    label: "Sponsorship",
    description: "Sponsors and applications",
    to: "/app/sponsorship",
    permission: "sponsors.manage",
    icon: Handshake,
  },
  {
    label: "Events",
    description: "Events and ticket operations",
    to: "/app/events",
    permission: "events.manage",
    icon: CalendarDays,
  },
  {
    label: "Website content",
    description: "Manage published content",
    to: "/app/content",
    permission: "cms.view",
    icon: FileText,
  },
  {
    label: "Reports",
    description: "Programme insights",
    to: "/app/reports",
    permission: "reports.view",
    icon: Activity,
  },
];

export function DashboardPage() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const roleSlugs = user?.role_slugs ?? [];
  const can = (permission: string) => permissions.includes(permission);
  const primaryRole =
    [
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
    ].find((role) => roleSlugs.includes(role)) ??
    (user?.account_type === "business"
      ? "registered_business"
      : user?.account_type
        ? "registered_individual"
        : "workspace");
  const role = roleProfiles[primaryRole] ?? {
    label: "TBIA Workspace",
    focus: "Your available tools are selected by your account permissions.",
    icon: Award,
  };
  const RoleIcon = role.icon;

  const report = useQuery({
    queryKey: ["dashboard-report"],
    queryFn: async () =>
      unwrap<DashboardReport>((await api.get("/reports/dashboard")).data),
    enabled: can("reports.view"),
  });
  const businesses = useQuery({
    queryKey: ["dashboard-my-businesses", user?.uid],
    queryFn: async () =>
      unwrap<DashboardRow[]>((await api.get("/businesses/mine")).data),
    enabled: user?.account_type === "business",
  });
  const nominationReview = useQuery({
    queryKey: ["dashboard-nomination-review"],
    queryFn: async () => {
      const statuses = [
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "pending_information",
      ];
      const results = await Promise.all(
        statuses.map(async (status) => {
          const response = await api.get("/nominations/review", {
            params: { page: 1, limit: 1, status },
          });
          return [
            status,
            Number(response.data.pagination?.total ?? 0),
          ] as const;
        }),
      );
      return Object.fromEntries(results) as Record<string, number>;
    },
    enabled: can("nominations.view_all") && !can("reports.view"),
  });
  const cmsPages = useQuery({
    queryKey: ["dashboard-cms-pages"],
    queryFn: async () => unwrap<DashboardRow[]>((await api.get("/cms")).data),
    enabled: can("cms.view") && !can("reports.view"),
  });
  const nominations = useQuery({
    queryKey: ["dashboard-my-nominations", user?.uid],
    queryFn: async () =>
      (
        await api.get("/nominations/mine", {
          params: { page: 1, limit: 1 },
        })
      ).data as {
        data: DashboardRow[];
        pagination: { total: number };
      },
    enabled: can("nominations.view_own"),
  });
  const payments = useQuery({
    queryKey: ["dashboard-my-payments", user?.uid],
    queryFn: async () =>
      unwrap<DashboardRow[]>((await api.get("/payments/mine")).data),
    enabled: can("payments.view_own"),
  });
  const assignments = useQuery({
    queryKey: ["dashboard-my-assignments", user?.uid],
    queryFn: async () =>
      unwrap<DashboardRow[]>((await api.get("/judging/assignments/mine")).data),
    enabled: can("judges.view_assigned"),
  });

  const totalNominations = report.data
    ? report.data.nominationsByStatus.reduce((sum, item) => sum + item.count, 0)
    : undefined;
  const successfulPayments = report.data
    ? (report.data.paymentsByStatus.find((item) => item.status === "successful")
        ?.count ?? 0)
    : undefined;
  const totalEvents = report.data
    ? report.data.eventsByStatus.reduce((sum, item) => sum + item.count, 0)
    : undefined;
  const stats = can("reports.view")
    ? [
        {
          label:
            primaryRole === "finance_officer"
              ? "Successful payments"
              : "Approved businesses",
          value:
            primaryRole === "finance_officer"
              ? successfulPayments
              : report.data?.approvedBusinesses,
          icon:
            primaryRole === "finance_officer"
              ? CircleDollarSign
              : BriefcaseBusiness,
        },
        {
          label: "Nominations",
          value: totalNominations,
          icon: Layers3,
        },
        {
          label:
            primaryRole === "sponsorship_manager"
              ? "Published sponsors"
              : "Judge assignments",
          value:
            primaryRole === "sponsorship_manager"
              ? report.data?.publishedSponsors
              : report.data?.judging.assignments,
          icon: primaryRole === "sponsorship_manager" ? Handshake : ShieldCheck,
        },
        {
          label:
            primaryRole === "website_admin" ||
            primaryRole === "communications_manager"
              ? "Events"
              : "Valid votes",
          value:
            primaryRole === "website_admin" ||
            primaryRole === "communications_manager"
              ? totalEvents
              : report.data?.voting.votes,
          icon:
            primaryRole === "website_admin" ||
            primaryRole === "communications_manager"
              ? CalendarDays
              : Vote,
        },
      ]
    : [
        ...(user?.account_type === "business"
          ? [
              {
                label: "Business profiles",
                value: businesses.data?.length,
                icon: BriefcaseBusiness,
              },
            ]
          : []),
        ...(can("nominations.view_own")
          ? [
              {
                label: "My nominations",
                value: nominations.data?.pagination.total,
                icon: Layers3,
              },
            ]
          : []),
        ...(can("judges.view_assigned")
          ? [
              {
                label: "My assignments",
                value: assignments.data?.length,
                icon: ShieldCheck,
              },
            ]
          : []),
        ...(can("payments.view_own")
          ? [
              {
                label: "My payments",
                value: payments.data?.length,
                icon: CircleDollarSign,
              },
            ]
          : []),
        ...(can("nominations.view_all") && nominationReview.data
          ? [
              {
                label: "Pending review",
                value:
                  (nominationReview.data.submitted ?? 0) +
                  (nominationReview.data.under_review ?? 0),
                icon: Layers3,
              },
              {
                label: "Approved nominations",
                value: nominationReview.data.approved ?? 0,
                icon: Award,
              },
              {
                label: "Needs attention",
                value:
                  (nominationReview.data.pending_information ?? 0) +
                  (nominationReview.data.rejected ?? 0),
                icon: Activity,
              },
            ]
          : []),
        ...(can("cms.view") && cmsPages.data
          ? [
              {
                label: "Website pages",
                value: cmsPages.data.length,
                icon: FileText,
              },
              {
                label: "Published pages",
                value: cmsPages.data.filter(
                  (page) => page.is_published === true,
                ).length,
                icon: FileText,
              },
            ]
          : []),
      ];

  const actions = quickActions.filter(
    (action) =>
      (action.permission ? can(action.permission) : true) &&
      (action.anyPermission ? action.anyPermission.some(can) : true) &&
      (action.accountType ? user?.account_type === action.accountType : true),
  );
  const moduleNames = [
    ...new Set(
      permissions
        .map((permission) => permission.split(".")[0])
        .map((module) => module.replaceAll("_", " ")),
    ),
  ];
  const showDataError =
    report.error ||
    businesses.error ||
    nominationReview.error ||
    cmsPages.error ||
    nominations.error ||
    payments.error ||
    assignments.error;

  return (
    <>
      <section className="dashboard-hero">
        <div className="dashboard-hero-mark">
          <RoleIcon size={22} />
        </div>
        <div className="dashboard-hero-copy">
          <div className="dashboard-role-label">
            <span className="live-dot" />
            {role.label}
            {roleSlugs.length > 1 && (
              <span className="dashboard-role-count">
                +{roleSlugs.length - 1} additional role
                {roleSlugs.length > 2 ? "s" : ""}
              </span>
            )}
          </div>
          <h1>Welcome back, {user?.full_name?.split(" ")[0] || "there"}.</h1>
          <p>{role.focus}</p>
        </div>
        <div className="dashboard-hero-date">
          <span>TBIA WORKSPACE</span>
          <b>
            {new Intl.DateTimeFormat("en-TZ", {
              weekday: "short",
              month: "short",
              day: "numeric",
            }).format(new Date())}
          </b>
        </div>
      </section>

      {showDataError && (
        <ErrorBanner message="Some dashboard data could not be loaded. Use the relevant workspace page to retry." />
      )}

      {stats.length > 0 && (
        <div className="stats-grid">
          {stats.map((item, index) => (
            <Card className="stat-card" key={item.label}>
              <div className="stat-top">
                <span>{item.label}</span>
                <item.icon size={17} />
              </div>
              <div className="stat-value">
                {item.value === undefined ? "—" : item.value.toLocaleString()}
              </div>
              <div className="stat-foot">
                <span className="stat-trend">
                  <ArrowUpRight size={14} />
                  Live data
                </span>
                <span>Authorised overview</span>
              </div>
              <span className={`stat-accent accent-${index % 4}`} />
            </Card>
          ))}
        </div>
      )}

      <div className="dashboard-grid role-dashboard-grid">
        <Card className="dashboard-main">
          <div className="card-heading">
            <div>
              <p className="eyebrow">YOUR PERMISSIONED WORKSPACE</p>
              <h2>Priority areas</h2>
            </div>
            <span className="api-health">
              {permissions.length} permissions active
            </span>
          </div>
          {actions.length ? (
            <div className="quick-grid">
              {actions.map((action) => (
                <Link to={action.to} key={action.to}>
                  <span className="quick-icon">
                    <action.icon />
                  </span>
                  <b>{action.label}</b>
                  <small>{action.description}</small>
                  <ArrowRight />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No workspace actions available"
              text="Your account currently has no module permissions. Contact a TBIA administrator if you believe this is incorrect."
            />
          )}
        </Card>

        <Card className="dashboard-note">
          <div className="note-orb">
            <ShieldCheck />
          </div>
          <p className="eyebrow">ACCESS & GOVERNANCE</p>
          <h3>Built around your role</h3>
          <p>
            Your role determines your responsibilities. Every available area is
            further limited by its assigned permission and protected by the
            server.
          </p>
          <div className="dashboard-modules">
            {moduleNames.length ? (
              moduleNames.map((module) => <span key={module}>{module}</span>)
            ) : (
              <span>No permissions assigned</span>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
