"use client";

import { useQuery } from "@tanstack/react-query";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { useAuth } from "@/auth/clerk";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

type Status = "healthy" | "degraded" | "down" | "unknown";
type AgentStatus = {
  id: string;
  name: string;
  role: string;
  status: Status;
  last_heartbeat_at?: string | null;
  last_task_outcome?: string | null;
};

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

const badgeClass = (status: Status) =>
  status === "healthy"
    ? "bg-emerald-100 text-emerald-700"
    : status === "degraded"
      ? "bg-amber-100 text-amber-700"
      : status === "down"
        ? "bg-rose-100 text-rose-700"
        : "bg-slate-200 text-slate-700";

export default function AgentsPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const query = useQuery({
    queryKey: ["agents-status"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/status/agents`);
      if (!res.ok) throw new Error("Failed to load agents");
      return res.json() as Promise<AgentStatus[]>;
    },
    refetchInterval: 15_000,
  });

  return (
    <DashboardPageLayout
      title="Agents"
      description="Live agent health view."
      isAdmin={isAdmin}
      stickyHeader
    >
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Last Heartbeat</th>
              <th className="py-2">Last Task</th>
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="py-2 pr-4 font-medium">{a.name}</td>
                <td className="py-2 pr-4 text-slate-500">{a.role}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(a.status)}`}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="py-2 pr-4 text-slate-500">
                  {a.last_heartbeat_at ?? "—"}
                </td>
                <td className="py-2 text-slate-500">
                  {a.last_task_outcome ?? "—"}
                </td>
              </tr>
            ))}
            {query.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  No agents reporting yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {query.error && (
          <p className="mt-4 text-sm text-red-500">
            {(query.error as Error).message}
          </p>
        )}
      </div>
    </DashboardPageLayout>
  );
}
