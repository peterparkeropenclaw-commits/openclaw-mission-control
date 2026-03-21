"use client";

import { useQuery } from "@tanstack/react-query";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { useAuth } from "@/auth/clerk";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

type AttentionItem = { type: "flow" | "service" | "agent"; id: string; name: string; status: "degraded" | "down" | "misconfigured"; detail: string | null };
type AttentionResponse = { items: AttentionItem[]; count: number };

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const badgeClass = (status: AttentionItem["status"]) => status === "degraded" ? "bg-amber-100 text-amber-700" : status === "down" ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-700";
const typeClass = (type: AttentionItem["type"]) => type === "flow" ? "bg-violet-100 text-violet-700" : type === "service" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-700";

export default function AttentionPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const query = useQuery({
    queryKey: ["attention"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/status/attention`);
      if (!res.ok) throw new Error("Failed to load attention items");
      return res.json() as Promise<AttentionResponse>;
    },
    refetchInterval: 30_000,
  });

  return (
    <DashboardPageLayout title="Attention" description="Only degraded, down, or misconfigured items." isAdmin={isAdmin} stickyHeader>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {query.data?.count ? (
          <div className="space-y-2">
            {query.data.items.map((item) => (
              <div key={`${item.type}-${item.id}`} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeClass(item.type)}`}>{item.type}</span>
                    <span className="font-medium text-slate-900">{item.name}</span>
                  </div>
                  {item.detail ? <p className="mt-1 text-sm text-slate-500">{item.detail}</p> : null}
                </div>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(item.status)}`}>{item.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-emerald-700">All systems healthy — nothing needs attention</p>
        )}
      </div>
    </DashboardPageLayout>
  );
}
