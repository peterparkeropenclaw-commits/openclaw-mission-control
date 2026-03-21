"use client";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { useAuth } from "@/auth/clerk";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

const authMode = process.env.NEXT_PUBLIC_AUTH_MODE || "unknown";
const backendUrl = process.env.NEXT_PUBLIC_API_URL || "not set";
const appVersion = "v1";

export default function ConfigurationPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  return (
    <DashboardPageLayout title="Configuration" description="Runtime client configuration." isAdmin={isAdmin} stickyHeader>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          <div className="flex justify-between gap-3 px-3 py-2 text-sm"><span className="text-slate-500">Auth mode</span><span className="font-medium text-slate-800">{authMode}</span></div>
          <div className="flex justify-between gap-3 px-3 py-2 text-sm"><span className="text-slate-500">Backend URL</span><span className="font-medium text-slate-800 break-all text-right">{backendUrl}</span></div>
          <div className="flex justify-between gap-3 px-3 py-2 text-sm"><span className="text-slate-500">App version</span><span className="font-medium text-slate-800">{appVersion}</span></div>
        </div>
      </div>
    </DashboardPageLayout>
  );
}
