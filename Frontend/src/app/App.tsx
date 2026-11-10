import { Route, Routes } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { SiteLayout } from "../layouts/SiteLayout";
import { AwardsPage } from "../features/public/AwardsPage";
import { BusinessesPage } from "../features/public/BusinessesPage";
import { EventsPage } from "../features/public/EventsPage";
import { HomePage } from "../features/public/HomePage";
import { NomineesPage } from "../features/public/NomineesPage";
import { SponsorshipPage } from "../features/public/SponsorshipPage";
import { VotingPage } from "../features/public/VotingPage";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { ForgotPasswordPage } from "../features/auth/ForgotPasswordPage";
import { EmailVerificationPage } from "../features/auth/EmailVerificationPage";
import { ProtectedRoute } from "./ProtectedRoute";
import { NotFoundPage } from "./NotFoundPage";
import { BusinessAdminPage } from "../features/app/pages/BusinessAdminPage";
import { AccessManagementPage } from "../features/app/pages/AccessManagementPage";
import { AuditLogsPage } from "../features/app/pages/AuditLogsPage";
import { MyBusinessPage } from "../features/app/pages/MyBusinessPage";
import { ContentPage } from "../features/app/pages/ContentPage";
import { DashboardPage } from "../features/app/pages/DashboardPage";
import { EventsAdminPage } from "../features/app/pages/EventsAdminPage";
import { JudgingPage } from "../features/app/pages/JudgingPage";
import { NominationAdminPage } from "../features/app/pages/NominationAdminPage";
import { NominationCreatePage } from "../features/app/pages/NominationCreatePage";
import { PaymentsPage } from "../features/app/pages/PaymentsPage";
import { ProfilePage } from "../features/app/pages/ProfilePage";
import { ReportsPage } from "../features/app/pages/ReportsPage";
import { SponsorshipAdminPage } from "../features/app/pages/SponsorshipAdminPage";
import { UsersPage } from "../features/app/pages/UsersPage";
import { VotingAdminPage } from "../features/app/pages/VotingAdminPage";
import { WinnersPage } from "../features/app/pages/WinnersPage";
import { HomeContentPage } from "../features/app/pages/HomeContentPage";
import { CategoriesAdminPage } from "../features/app/pages/CategoriesAdminPage";
import { WinnersPublicPage } from "../features/public/WinnersPublicPage";

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="awards" element={<AwardsPage />} />
        <Route path="winners" element={<WinnersPublicPage />} />
        <Route path="nominees" element={<NomineesPage />} />
        <Route path="businesses" element={<BusinessesPage />} />
        <Route path="vote" element={<VotingPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="sponsorship" element={<SponsorshipPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="verify-email" element={<EmailVerificationPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="nominations" element={<NominationCreatePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="my-business" element={<MyBusinessPage />} />
          <Route element={<ProtectedRoute permission="users.view" />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
          <Route path="profile" element={<ProfilePage />} />
          <Route element={<ProtectedRoute permission="roles.view" />}>
            <Route path="access" element={<AccessManagementPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="audit_logs.view" />}>
            <Route path="audit-logs" element={<AuditLogsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="businesses.verify" />}>
            <Route path="businesses" element={<BusinessAdminPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="nominations.view_all" />}>
            <Route path="nominations" element={<NominationAdminPage />} />
          </Route>
          <Route
            element={
              <ProtectedRoute
                anyPermission={["judges.manage", "judges.view_assigned"]}
              />
            }
          >
            <Route path="judging" element={<JudgingPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="voting.manage" />}>
            <Route path="voting" element={<VotingAdminPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="winners.manage" />}>
            <Route path="winners" element={<WinnersPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="categories.manage" />}>
            <Route path="categories" element={<CategoriesAdminPage />} />
          </Route>
          <Route
            element={
              <ProtectedRoute
                anyPermission={["payments.view", "payments.view_own"]}
              />
            }
          >
            <Route path="payments" element={<PaymentsPage />} />
          </Route>
          <Route
            element={
              <ProtectedRoute
                anyPermission={["sponsors.manage", "sponsorships.manage"]}
              />
            }
          >
            <Route path="sponsorship" element={<SponsorshipAdminPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="events.manage" />}>
            <Route path="events" element={<EventsAdminPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="cms.view" />}>
            <Route path="content" element={<ContentPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="cms.manage" />}>
            <Route path="home-content" element={<HomeContentPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="reports.view" />}>
            <Route path="reports" element={<ReportsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
