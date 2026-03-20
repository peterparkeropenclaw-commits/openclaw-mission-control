"use client";

import { useQuery } from "@tanstack/react-query";

type Status = "healthy" | "degraded" | "down" | "unknown" | "misconfigured";

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

const badgeClass = (status: Status) => {
  if (status === "healthy") return "bg-emerald-100 text-emerald-700";
  if (status === "degraded") return "bg-amber-100 text-amber-700";
  if (status === "down") return "bg-rose-100 text-rose-700";
  return "bg-slate-200 text-slate-700";
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json() as Promise<T>;
};

function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(status)}`}>{status}</span>;
}

export default function DashboardPage() {
  const queryOptions = { refetchInterval: 30_000 };

  const overviewQuery = useQuery({ queryKey: ["status", "overview"], queryFn: () => fetchJson<Overview>("/api/status/overview"), ...queryOptions });
  const agentsQuery = useQuery({ queryKey: ["status", "agents"], queryFn: () => fetchJson<AgentStatus[]>("/api/status/agents"), ...queryOptions });
  const servicesQuery = useQuery({ queryKey: ["status", "services"], queryFn: () => fetchJson<ServiceStatus[]>("/api/status/services"), ...queryOptions });
  const flowsQuery = useQuery({ queryKey: ["status", "flows"], queryFn: () => fetchJson<FlowStatus[]>("/api/status/flows"), ...queryOptions });

  const loading = overviewQuery.isLoading || agentsQuery.isLoading || servicesQuery.isLoading || flowsQuery.isLoading;

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Mission Control Status Dashboard</h1>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Overview</h2>
          {loading || !overviewQuery.data ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4 text-sm text-slate-700">
              <div>Overall: <StatusBadge status={overviewQuery.data.overall_status} /></div>
              <div>Agents: {overviewQuery.data.healthy_agents}/{overviewQuery.data.agent_count} healthy</div>
              <div>Services: {overviewQuery.data.healthy_services}/{overviewQuery.data.service_count} healthy</div>
              <div>Flows: {overviewQuery.data.healthy_flows}/{overviewQuery.data.flow_count} healthy</div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Agent health</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th>Name</th><th>Model</th><th>Channel</th><th>Status</th></tr></thead>
            <tbody>
              {(agentsQuery.data ?? []).map((agent) => (
                <tr key={agent.id} className="border-t border-slate-100"><td className="py-2">{agent.name}</td><td>{agent.model ?? "—"}</td><td>{agent.channel ?? "—"}</td><td><StatusBadge status={agent.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Service health</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th>Name</th><th>Status</th><th>Last Checked</th></tr></thead>
            <tbody>
              {(servicesQuery.data ?? []).map((service) => (
                <tr key={service.id} className="border-t border-slate-100"><td className="py-2">{service.name}</td><td><StatusBadge status={service.status} /></td><td>{service.last_checked_at ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Critical flows</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th>Name</th><th>Status</th><th>Last Checked</th></tr></thead>
            <tbody>
              {(flowsQuery.data ?? []).map((flow) => (
                <tr key={flow.id} className="border-t border-slate-100"><td className="py-2">{flow.name}</td><td><StatusBadge status={flow.status} /></td><td>{flow.last_checked_at ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
