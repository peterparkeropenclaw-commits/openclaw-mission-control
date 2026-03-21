"use client";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { useAuth } from "@/auth/clerk";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

export default function BrainDumpPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  return (
    <DashboardPageLayout title="Brain Dump" description="Placeholder page for rapid notes and scratchpad capture." isAdmin={isAdmin} stickyHeader>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">
        Brain Dump placeholder — quick capture workspace coming soon.
      </div>
    </DashboardPageLayout>
  );
}
