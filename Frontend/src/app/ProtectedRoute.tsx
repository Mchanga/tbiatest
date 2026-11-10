import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";

export function ProtectedRoute({
  permission,
  anyPermission,
}: {
  permission?: string;
  anyPermission?: string[];
}) {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="app-loading">
        <span className="loader" /> Securing your session?
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  const hasPermission = permission
    ? user.permissions?.includes(permission)
    : anyPermission
      ? anyPermission.some((required) => user.permissions?.includes(required))
      : true;
  if (!hasPermission) {
    return (
      <main className="section wrap">
        <h1>Access unavailable</h1>
        <p>Your account does not have permission to open this page.</p>
      </main>
    );
  }
  return <Outlet />;
}
