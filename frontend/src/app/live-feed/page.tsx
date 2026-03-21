"use client";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { useAuth } from "@/auth/clerk";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

export default function LiveFeedPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  return (
    <DashboardPageLayout title="Live Feed" description="Placeholder page for live operational feed." isAdmin={isAdmin} stickyHeader signedOut={{ message: "Sign in to view the live feed.", forceRedirectUrl: "/live-feed", signUpForceRedirectUrl: "/live-feed" }}>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">
        Live Feed placeholder — streaming operational events will appear here in a future version.
      </div>
    </DashboardPageLayout>
  );
}
