"use client";

import { useQuery } from "@tanstack/react-query";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { apiFetch } from "@/lib/api-fetch";
import { useAuth } from "@/auth/clerk";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

type Status = "healthy" | "degraded" | "down" | "unknown" | "misconfigured";
type Outcome = "completed" | "failed" | "blocked" | null;
type AgentActivity = {
  id: string;
  name: string;
  status: Status;
  last_heartbeat_at?: string | null;
  current_task_id?: string | null;
  current_task_title?: string | null;
  last_task_id?: string | null;
  last_task_title?: string | null;
  last_task_outcome?: Outcome;
  last_updated_at?: string | null;
};

const statusClass = (status: Status) =>
  status === "healthy"
    ? "bg-emerald-100 text-emerald-700"
    : status === "degraded"
      ? "bg-amber-100 text-amber-700"
      : status === "down"
        ? "bg-rose-100 text-rose-700"
        : "bg-slate-200 text-slate-700";
const outcomeClass = (status: Outcome) =>
  status === "completed"
    ? "bg-emerald-100 text-emerald-700"
    : status === "failed"
      ? "bg-rose-100 text-rose-700"
      : status === "blocked"
        ? "bg-slate-200 text-slate-700"
        : "bg-slate-100 text-slate-500";

function relativeTime(value?: string | null) {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function AgentsPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const query = useQuery({
    queryKey: ["agent-activity"],
    queryFn: async () => (await apiFetch("/api/status/agent-activity")) as AgentActivity[],
    refetchInterval: 15000,
  });

  return (
    <DashboardPageLayout
      title="Agents"
      description="Real-time per-agent heartbeat and task visibility."
      isAdmin={isAdmin}
      stickyHeader
      signedOut={{ message: "Sign in to view agents.", forceRedirectUrl: "/agents" }}
    >
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Last Heartbeat</th>
              <th className="py-2 pr-4">Current Task</th>
              <th className="py-2 pr-4">Last Task Outcome</th>
              <th className="py-2">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="py-2 pr-4 font-medium text-slate-900">{a.name}</td>
                <td className="py-2 pr-4">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(a.status)}`}>{a.status}</span>
                </td>
                <td className="py-2 pr-4 text-slate-500">{relativeTime(a.last_heartbeat_at)}</td>
                <td className="py-2 pr-4 text-slate-700">{a.current_task_title || "Idle"}</td>
                <td className="py-2 pr-4">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${outcomeClass(a.last_task_outcome ?? null)}`}>{a.last_task_outcome || "—"}</span>
                </td>
                <td className="py-2 text-slate-500">{relativeTime(a.last_updated_at)}</td>
              </tr>
            ))}
            {query.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">No agent activity yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        {query.error && <p className="mt-4 text-sm text-red-500">{(query.error as Error).message}</p>}
      </div>
    </DashboardPageLayout>
  );
}
