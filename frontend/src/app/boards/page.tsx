"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { useAuth } from "@/auth/clerk";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

type TaskStatus = "new" | "assigned" | "in_progress" | "review" | "completed" | "failed" | "blocked";
type TaskPriority = "low" | "medium" | "high" | "critical";

type DispatchTask = {
  id: string;
  title: string;
  owner: string;
  type: string;
  priority: TaskPriority;
  status: TaskStatus;
  source: string;
  context: string | null;
  trigger: string | null;
  result_summary: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  assigned_at: string | null;
  completed_at: string | null;
};

type TaskListResponse = DispatchTask[] | { items?: DispatchTask[]; tasks?: DispatchTask[] };

const STATUS_BADGE: Record<TaskStatus, string> = {
  new: "bg-slate-100 text-slate-600",
  assigned: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  review: "bg-purple-100 text-purple-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  blocked: "bg-red-200 text-red-800",
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-500",
  medium: "bg-sky-100 text-sky-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-rose-100 text-rose-700 font-bold",
};

const OWNERS = ["ops_director", "builder", "reviewer", "research_commercial", "growth_content", "peter"];
const TYPES = ["bugfix", "infra", "research", "growth", "review", "config", "feasibility"];
const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];
const STATUSES: TaskStatus[] = ["new", "assigned", "in_progress", "review", "completed", "failed", "blocked"];
const SOURCES = ["manual", "ops_director", "brain_dump", "system"];

function fmtDate(s: string) {
  return new Date(s).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label.replace("_", " ")}</span>;
}

export default function TasksPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const queryClient = useQueryClient();

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [fTitle, setFTitle] = useState("");
  const [fType, setFType] = useState("config");
  const [fPriority, setFPriority] = useState<TaskPriority>("high");
  const [fOwner, setFOwner] = useState("builder");
  const [fContext, setFContext] = useState("");
  const [fCriteria, setFCriteria] = useState("");
  const [fSource, setFSource] = useState("manual");
  const [fTrigger, setFTrigger] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);

  const queryKey = ["dispatch-tasks", filterStatus, filterOwner, filterPriority];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterOwner) params.set("owner", filterOwner);
      if (filterPriority) params.set("priority", filterPriority);
      const url = `${apiBase}/api/v1/api/tasks${params.toString() ? "?" + params.toString() : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load tasks");
      const data: TaskListResponse = await res.json();
      if (Array.isArray(data)) return data;
      return (data as { items?: DispatchTask[]; tasks?: DispatchTask[] }).items ?? (data as { tasks?: DispatchTask[] }).tasks ?? [];
    },
    refetchInterval: 15_000,
  });

  const tasks: DispatchTask[] = query.data ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/api/v1/api/tasks/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fTitle.trim(),
          type: fType,
          priority: fPriority,
          owner: fOwner,
          context: fContext.trim() || null,
          acceptance_criteria: fCriteria.trim()
            ? fCriteria.split("\n").map((s) => s.trim()).filter(Boolean)
            : [],
          source: fSource,
          trigger: fTrigger.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`Failed to create task: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      setFTitle(""); setFContext(""); setFCriteria(""); setFTrigger("");
      setFType("config"); setFPriority("high"); setFOwner("builder"); setFSource("manual");
      setFormError(""); setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["dispatch-tasks"] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const handleCreate = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!fTitle.trim()) return;
    setFormError("");
    createMutation.mutate();
  };

  const selectCls = "rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white";

  return (
    <DashboardPageLayout
      title="Dispatch Tasks"
      description="Operator surface for autonomous task dispatch and execution."
      isAdmin={isAdmin}
      stickyHeader
      signedOut={{
        message: "Sign in to view dispatch tasks.",
        forceRedirectUrl: "/boards",
        signUpForceRedirectUrl: "/boards",
      }}
      headerActions={
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {showForm ? "Cancel" : "+ Create task"}
        </button>
      }
    >
      {/* Create form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New dispatch task</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Title *</label>
                <input
                  type="text" value={fTitle} onChange={(e) => setFTitle(e.target.value)}
                  placeholder="What needs to be done?" required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Owner *</label>
                <select value={fOwner} onChange={(e) => setFOwner(e.target.value)} className={`w-full ${selectCls}`}>
                  {OWNERS.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Type *</label>
                <select value={fType} onChange={(e) => setFType(e.target.value)} className={`w-full ${selectCls}`}>
                  {TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Priority *</label>
                <select value={fPriority} onChange={(e) => setFPriority(e.target.value as TaskPriority)} className={`w-full ${selectCls}`}>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Source *</label>
                <select value={fSource} onChange={(e) => setFSource(e.target.value)} className={`w-full ${selectCls}`}>
                  {SOURCES.map((s) => <option key={s}>{s.replace("_", " ")}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Context</label>
                <textarea
                  value={fContext} onChange={(e) => setFContext(e.target.value)}
                  placeholder="Background, links, or relevant detail..." rows={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Acceptance criteria (one per line)</label>
                <textarea
                  value={fCriteria} onChange={(e) => setFCriteria(e.target.value)}
                  placeholder={"Task passes smoke test\nNo 404s in logs"} rows={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Trigger</label>
                <input
                  type="text" value={fTrigger} onChange={(e) => setFTrigger(e.target.value)}
                  placeholder="manual_test, cron, etc."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
            </div>
            {formError && <p className="text-xs text-rose-500">{formError}</p>}
            {formSuccess && <p className="text-xs text-emerald-600">✓ Task created and dispatched.</p>}
            <button
              type="submit" disabled={createMutation.isPending || !fTitle.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating…" : "Create task"}
            </button>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectCls}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s}>{s.replace("_", " ")}</option>)}
        </select>
        <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} className={selectCls}>
          <option value="">All owners</option>
          {OWNERS.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={selectCls}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["dispatch-tasks"] })}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          ↻ Refresh
        </button>
        {(filterStatus || filterOwner || filterPriority) && (
          <button
            onClick={() => { setFilterStatus(""); setFilterOwner(""); setFilterPriority(""); }}
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Task table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-100">
            <tr>
              <th className="py-3 px-4">Title</th>
              <th className="py-3 px-4">Owner</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Priority</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Source</th>
              <th className="py-3 px-4">Created</th>
              <th className="py-3 px-4">Updated</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-4 max-w-xs">
                  <div className="font-medium text-slate-800">{t.title}</div>
                  {t.context && (
                    <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[240px]">{t.context}</div>
                  )}
                  {t.result_summary && (
                    <div className="text-xs text-emerald-600 mt-0.5 truncate max-w-[240px]">✓ {t.result_summary}</div>
                  )}
                  {t.error_message && (
                    <div className="text-xs text-rose-500 mt-0.5 truncate max-w-[240px]">✗ {t.error_message}</div>
                  )}
                </td>
                <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{t.owner.replace("_", " ")}</td>
                <td className="py-3 px-4 text-slate-500">{t.type}</td>
                <td className="py-3 px-4">
                  <Badge label={t.priority} cls={PRIORITY_BADGE[t.priority] ?? "bg-slate-100 text-slate-500"} />
                </td>
                <td className="py-3 px-4">
                  <Badge label={t.status} cls={STATUS_BADGE[t.status] ?? "bg-slate-100 text-slate-600"} />
                </td>
                <td className="py-3 px-4 text-slate-500">{t.source.replace("_", " ")}</td>
                <td className="py-3 px-4 text-slate-400 text-xs whitespace-nowrap">{fmtDate(t.created_at)}</td>
                <td className="py-3 px-4 text-slate-400 text-xs whitespace-nowrap">{fmtDate(t.updated_at)}</td>
              </tr>
            ))}
            {tasks.length === 0 && !query.isLoading && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  No dispatch tasks yet.
                </td>
              </tr>
            )}
            {query.isLoading && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">Loading…</td>
              </tr>
            )}
          </tbody>
        </table>
        {query.error && (
          <p className="p-4 text-sm text-rose-500">{(query.error as Error).message}</p>
        )}
      </div>
    </DashboardPageLayout>
  );
}
