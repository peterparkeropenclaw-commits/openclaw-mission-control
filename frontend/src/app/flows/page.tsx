"use client";

import { useQuery } from "@tanstack/react-query";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { useAuth } from "@/auth/clerk";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

type Status = "healthy" | "degraded" | "down" | "unknown" | "misconfigured";
type FlowStatus = { id: string; name: string; status: Status; last_checked_at?: string | null; last_error?: string | null };
const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const badgeClass = (status: Status) => status === "healthy" ? "bg-emerald-100 text-emerald-700" : status === "degraded" ? "bg-amber-100 text-amber-700" : status === "down" ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-700";

export default function FlowsPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const query = useQuery({
    queryKey: ["flows"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/status/flows`);
      if (!res.ok) throw new Error("Failed to load flows");
      return res.json() as Promise<FlowStatus[]>;
    },
    refetchInterval: 30_000,
  });

  return (
    <DashboardPageLayout title="Flows" description="Critical flow health view." isAdmin={isAdmin} stickyHeader>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
        <table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th>Name</th><th>Status</th><th>Last Checked</th></tr></thead><tbody>{(query.data ?? []).map((f) => <tr key={f.id} className="border-t border-slate-100"><td className="py-2">{f.name}</td><td><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(f.status)}`}>{f.status}</span></td><td>{f.last_checked_at ?? "—"}</td></tr>)}</tbody></table>
      </div>
    </DashboardPageLayout>
  );
}
