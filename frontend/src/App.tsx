import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, RequireAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { StaffPage } from "@/pages/staff/StaffPage";
import { ClassesPage } from "@/pages/classes/ClassesPage";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { NotificationsPage } from "@/pages/notifications/NotificationsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { PlansPage } from "@/pages/plans/PlansPage";
import { PaymentsPage } from "@/pages/payments/PaymentsPage";
import { MembersPage } from "@/pages/members/MembersPage";
import { MemberDetailPage } from "@/pages/members/MemberDetailPage";
import { AttendancePage } from "@/pages/attendance/AttendancePage";
import { AttendanceHistoryPage } from "@/pages/attendance/AttendanceHistoryPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/members/:memberId" element={<MemberDetailPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/attendance/history" element={<AttendanceHistoryPage />} />
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
    </AuthProvider>
  );
}
