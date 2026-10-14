import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/States";

/**
 * Temporary module placeholders — replaced by the full module implementations
 * (see src/pages/*). Kept so the shell compiles and routes resolve.
 */
function Stub({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <EmptyState title="Module loading" description="This module is being built." />
    </div>
  );
}

export function MembersPage() {
  return <Stub title="Members" description="Member directory and membership management." />;
}

export function MemberDetailPage() {
  return <Stub title="Member profile" description="Member details, QR card, history and payments." />;
}

export function AttendancePage() {
  return <Stub title="QR Attendance" description="Scan member QR codes and record check-ins." />;
}

export function AttendanceHistoryPage() {
  return <Stub title="Attendance history" description="Searchable check-in records with filters and export." />;
}

export function PlansPage() {
  return <Stub title="Membership plans" description="Plan pricing, durations and benefits." />;
}

export function PaymentsPage() {
  return <Stub title="Payments & fees" description="Record payments, track dues and print receipts." />;
}

export function StaffPage() {
  return <Stub title="Trainers & staff" description="Staff directory and roles." />;
}

export function ClassesPage() {
  return <Stub title="Classes & schedule" description="Group classes, capacity and enrolments." />;
}

export function ReportsPage() {
  return <Stub title="Reports & analytics" description="Attendance, revenue and membership insights." />;
}

export function NotificationsPage() {
  return <Stub title="Notifications" description="Expiry alerts, pending dues and check-in events." />;
}

export function SettingsPage() {
  return <Stub title="Settings" description="Gym profile, check-in policy and reminder preferences." />;
}

