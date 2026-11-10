import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  FileText,
  Gauge,
  Handshake,
  KeyRound,
  Layers3,
  LogOut,
  Settings2,
  ScrollText,
  ShieldCheck,
  Trophy,
  Users,
  Vote,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../features/auth/AuthProvider";
import { api } from "../lib/api";
import tbiaLogo from "../assets/tbia-logo.jpeg";

const groups = [
  {
    label: "Workspace",
    items: [
      { to: "/app", label: "Overview", icon: Gauge },
      {
        to: "/app/my-business",
        label: "My business",
        icon: BriefcaseBusiness,
        accountType: "business",
      },
      {
        to: "/app/users",
        label: "User management",
        icon: Users,
        permission: "users.view",
      },
      {
        to: "/app/access",
        label: "Roles & permissions",
        icon: KeyRound,
        permission: "roles.view",
      },
      {
        to: "/app/businesses",
        label: "Businesses",
        icon: BriefcaseBusiness,
        permission: "businesses.verify",
      },
      {
        to: "/app/nominations",
        label: "Nominations",
        icon: Layers3,
        permission: "nominations.view_all",
      },
    ],
  },
  {
    label: "Awards",
    items: [
      {
        to: "/app/judging",
        label: "Judging",
        icon: ShieldCheck,
        anyPermission: ["judges.manage", "judges.view_assigned"],
      },
      {
        to: "/app/voting",
        label: "Voting",
        icon: Vote,
        permission: "voting.manage",
      },
      {
        to: "/app/winners",
        label: "Winners",
        icon: Trophy,
        permission: "winners.manage",
      },
      {
        to: "/app/categories",
        label: "Award categories",
        icon: Layers3,
        permission: "categories.manage",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        to: "/app/payments",
        label: "Payments",
        icon: CircleDollarSign,
        permission: "payments.view_own",
      },
      {
        to: "/app/sponsorship",
        label: "Sponsorship",
        icon: Handshake,
        anyPermission: ["sponsors.manage", "sponsorships.manage"],
      },
      {
        to: "/app/events",
        label: "Events",
        icon: CalendarDays,
        permission: "events.manage",
      },
      {
        to: "/app/content",
        label: "Content",
        icon: FileText,
        permission: "cms.view",
      },
      {
        to: "/app/home-content",
        label: "Homepage",
        icon: FileText,
        permission: "cms.manage",
      },
      {
        to: "/app/reports",
        label: "Reports",
        icon: Activity,
        permission: "reports.view",
      },
      {
        to: "/app/audit-logs",
        label: "Audit logs",
        icon: ScrollText,
        permission: "audit_logs.view",
      },
    ],
  },
];
export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const health = useQuery({
    queryKey: ["api-health"],
    queryFn: async () => (await api.get("/health/live")).data,
    refetchInterval: 30_000,
  });
  const logout = async () => {
    try {
      await signOut();
    } finally {
      navigate("/");
    }
  };
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link to="/" className="brand sidebar-brand">
          <img
            className="brand-logo brand-logo-compact"
            src={tbiaLogo}
            alt=""
          />
          <span>
            <b>TBIA</b>
            <small>AWARDS PORTAL</small>
          </span>
        </Link>
        <div className="workspace-select">
          <img className="workspace-icon" src={tbiaLogo} alt="" />
          <span>
            <b>TBIA workspace</b>
          </span>
          <ChevronDown size={15} />
        </div>
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <span className="nav-label">{group.label}</span>
            {group.items
              .filter(
                (item) =>
                  (!item.permission ||
                    user?.permissions?.includes(item.permission)) &&
                  (!("anyPermission" in item) ||
                    (item.anyPermission ?? []).some((permission) =>
                      user?.permissions?.includes(permission),
                    )) &&
                  (!("accountType" in item) ||
                    user?.account_type === item.accountType),
              )
              .map((item) => (
                <NavLink
                  key={item.to}
                  end={item.to === "/app"}
                  to={item.to}
                  className={({ isActive }) =>
                    `side-link ${isActive ? "active" : ""}`
                  }
                >
                  <item.icon size={17} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
          </div>
        ))}
        <div className="sidebar-bottom">
          <NavLink to="/app/profile" className="side-link">
            <Settings2 size={17} />
            My profile
          </NavLink>
          <Link to="/" className="side-link">
            <ArrowLeft size={17} />
            Back to website
          </Link>
          <button className="side-link" onClick={() => void logout()}>
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <b>TBIA Portal</b>
          </div>
          <div className="topbar-actions">
            <span className={`live-dot ${health.isError ? "offline" : ""}`}>
              {health.isLoading
                ? "Connecting"
                : health.isError
                  ? "API unavailable"
                  : "API connected"}
            </span>
            <button className="icon-button" aria-label="Notifications">
              <Bell size={17} />
            </button>
            <div className="user-chip">
              <span className="avatar">
                {user?.full_name?.slice(0, 1) || "T"}
              </span>
              <span>
                <b>{user?.full_name || "Account"}</b>
                <small>{user?.account_type || "Member"}</small>
              </span>
            </div>
          </div>
        </header>
        <div className="admin-content">
          <Outlet />
        </div>
        <footer className="admin-foot">
          <span>TBIA administration</span>
          <span>Powered by Tanzania Business & Investment Awards</span>
        </footer>
      </div>
    </div>
  );
}
