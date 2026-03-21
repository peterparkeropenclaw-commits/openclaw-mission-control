"use client";

export const dynamic = "force-dynamic";

import { useQuery } from "@tanstack/react-query";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { useAuth } from "@/auth/clerk";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { apiFetch } from "@/lib/api-fetch";

type Status = "healthy" | "degraded" | "down" | "unknown" | "misconfigured";
type OpsMode = "normal" | "product_stability" | "infra_recovery" | "unknown";

type AgentStatus = {
  id: string;
  name: string;
  status: Status;
  model?: string | null;
  channel?: string | null;
  last_heartbeat_at?: string | null;
  last_error?: string | null;
};

type ServiceStatus = {
  id: string;
  name: string;
  status: Status;
  last_checked_at?: string | null;
  last_error?: string | null;
};

type FlowStatus = {
  id: string;
  name: string;
  status: Status;
  last_checked_at?: string | null;
  last_error?: string | null;
};

type Overview = {
  overall_status: Status;
  agent_count: number;
  healthy_agents: number;
  service_count: number;
  healthy_services: number;
  flow_count: number;
  healthy_flows: number;
};

type OpsModeResponse = { mode: OpsMode; reason: string; computed_at: string };
type AttentionItem = { type: "flow" | "service" | "agent"; id: string; name: string; status: "degraded" | "down" | "misconfigured"; detail: string | null };
type AttentionResponse = { items: AttentionItem[]; count: number };

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const statusClass = (status: Status) => {
  if (status === "healthy") return "bg-emerald-100 text-emerald-700";
  if (status === "degraded") return "bg-amber-100 text-amber-700";
  if (status === "down") return "bg-rose-100 text-rose-700";
  return "bg-slate-200 text-slate-700";
};
const modeClass = (mode: OpsMode) => {
  if (mode === "normal") return "bg-emerald-100 text-emerald-700";
  if (mode === "product_stability") return "bg-amber-100 text-amber-700";
  if (mode === "infra_recovery") return "bg-rose-100 text-rose-700";
  return "bg-slate-200 text-slate-700";
};
const typeClass = (type: AttentionItem["type"]) => type === "flow" ? "bg-violet-100 text-violet-700" : type === "service" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-700";

async function fetchJson<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

function Badge({ status }: { status: Status }) { return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(status)}`}>{status}</span>; }

export default function DashboardPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const refresh = { refetchInterval: 30_000 };
  const opsMode = useQuery({ queryKey: ["ops-mode"], queryFn: () => fetchJson<OpsModeResponse>("/api/status/ops-mode"), ...refresh });
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => fetchJson<Overview>("/api/status/overview"), ...refresh });
  const attention = useQuery({ queryKey: ["attention"], queryFn: () => fetchJson<AttentionResponse>("/api/status/attention"), ...refresh });
  const agents = useQuery({ queryKey: ["agents"], queryFn: () => fetchJson<AgentStatus[]>("/api/status/agents"), ...refresh });
  const services = useQuery({ queryKey: ["services"], queryFn: () => fetchJson<ServiceStatus[]>("/api/status/services"), ...refresh });
  const flows = useQuery({ queryKey: ["flows"], queryFn: () => fetchJson<FlowStatus[]>("/api/status/flows"), ...refresh });

  return (
    <DashboardPageLayout
      title="Dashboard"
      description="Mission Control status overview."
      isAdmin={isAdmin}
      stickyHeader
      signedOut={{
        message: "Sign in to view the dashboard.",
        forceRedirectUrl: "/dashboard",
        signUpForceRedirectUrl: "/dashboard",
      }}
    >
      <div className="space-y-4">

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Ops Director mode</h2>
          {opsMode.data ? (
            <div className="space-y-2 text-sm text-slate-700">
              <div>Current mode: <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${modeClass(opsMode.data.mode)}`}>{opsMode.data.mode}</span></div>
              <p>{opsMode.data.reason}</p>
            </div>
          ) : <p className="text-sm text-slate-500">Loading...</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Overview</h2>
          {overview.data ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4 text-sm text-slate-700">
              <div>Overall: <Badge status={overview.data.overall_status} /></div>
              <div>Agents: {overview.data.healthy_agents}/{overview.data.agent_count} healthy</div>
              <div>Services: {overview.data.healthy_services}/{overview.data.service_count} healthy</div>
              <div>Flows: {overview.data.healthy_flows}/{overview.data.flow_count} healthy</div>
            </div>
          ) : <p className="text-sm text-slate-500">Loading...</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">What needs attention</h2>
          {attention.data?.count ? (
            <div className="space-y-2">
              {attention.data.items.map((item) => (
                <div key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeClass(item.type)}`}>{item.type}</span><span className="font-medium text-slate-800">{item.name}</span></div>
                  <Badge status={item.status} />
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-emerald-700">All systems healthy — nothing needs attention</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Agent health</h2>
          <table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th>Name</th><th>Model</th><th>Channel</th><th>Status</th></tr></thead><tbody>{(agents.data ?? []).map((a) => <tr key={a.id} className="border-t border-slate-100"><td className="py-2">{a.name}</td><td>{a.model ?? "—"}</td><td>{a.channel ?? "—"}</td><td><Badge status={a.status} /></td></tr>)}</tbody></table>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Service health</h2>
          <table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th>Name</th><th>Status</th><th>Last Checked</th></tr></thead><tbody>{(services.data ?? []).map((s) => <tr key={s.id} className="border-t border-slate-100"><td className="py-2">{s.name}</td><td><Badge status={s.status} /></td><td>{s.last_checked_at ?? "—"}</td></tr>)}</tbody></table>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Critical flows</h2>
          <table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th>Name</th><th>Status</th><th>Last Checked</th></tr></thead><tbody>{(flows.data ?? []).map((f) => <tr key={f.id} className="border-t border-slate-100"><td className="py-2">{f.name}</td><td><Badge status={f.status} /></td><td>{f.last_checked_at ?? "—"}</td></tr>)}</tbody></table>
        </section>
      </div>
    </DashboardPageLayout>
  );
}
