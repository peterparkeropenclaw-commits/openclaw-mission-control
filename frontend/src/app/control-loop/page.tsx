"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { useAuth } from "@/auth/clerk";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

type Task = {
  id: string;
  title: string;
  type: string;
  priority: string;
  owner: string;
  status: string;
  context?: string | null;
  acceptance_criteria?: string[] | null;
  result_summary?: string | null;
  error_message?: string | null;
  source: string;
  trigger?: string | null;
  created_at: string;
  updated_at: string;
};

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const statusClass = (status: string) => status === "failed" ? "bg-rose-100 text-rose-700" : status === "review" ? "bg-amber-100 text-amber-700" : status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700";
const priorityClass = (priority: string) => priority === "critical" ? "bg-rose-100 text-rose-700" : priority === "high" ? "bg-orange-100 text-orange-700" : priority === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-slate-200 text-slate-700";

async function fetchTasks(query: string) {
  const res = await fetch(`${apiBase}/api/v1/api/tasks${query}`);
  if (!res.ok) throw new Error(`Failed to load ${query}`);
  return res.json() as Promise<Task[]>;
}

function Panel({ title, tasks, onSelect }: { title: string; tasks: Task[]; onSelect: (task: Task) => void }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-hidden">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500"><tr><th>Title</th><th>Owner</th><th>Status</th><th>Priority</th><th>Updated</th></tr></thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} onClick={() => onSelect(task)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                <td className="py-2 pr-3 font-medium text-slate-900">{task.title}</td>
                <td className="pr-3 text-slate-600">{task.owner}</td>
                <td className="pr-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(task.status)}`}>{task.status}</span></td>
                <td className="pr-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${priorityClass(task.priority)}`}>{task.priority}</span></td>
                <td className="text-slate-500">{new Date(task.updated_at).toLocaleString()}</td>
              </tr>
            ))}
            {!tasks.length ? <tr><td className="py-3 text-slate-400" colSpan={5}>No tasks</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ControlLoopPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const refresh = { refetchInterval: 15_000 };
  const failed = useQuery({ queryKey: ["control-loop", "failed"], queryFn: () => fetchTasks("?status=failed"), ...refresh });
  const escalated = useQuery({ queryKey: ["control-loop", "escalated"], queryFn: () => fetchTasks("?owner=peter&source=auto_escalation"), ...refresh });
  const retrying = useQuery({ queryKey: ["control-loop", "retrying"], queryFn: () => fetchTasks("?source=system&trigger=retry_failed_task"), ...refresh });
  const review = useQuery({ queryKey: ["control-loop", "review"], queryFn: () => fetchTasks("?status=review"), ...refresh });
  const completed = useQuery({ queryKey: ["control-loop", "completed"], queryFn: () => fetchTasks("?status=completed&limit=10"), ...refresh });

  const panels = useMemo(() => [
    { title: "Failed", data: failed.data ?? [] },
    { title: "Escalated", data: escalated.data ?? [] },
    { title: "Retrying", data: retrying.data ?? [] },
    { title: "In Review", data: review.data ?? [] },
    { title: "Recently Completed", data: completed.data ?? [] },
  ], [failed.data, escalated.data, retrying.data, review.data, completed.data]);

  return (
    <DashboardPageLayout
      title="Control Loop"
      description="Live dispatch visibility across failure, escalation, retry, review and completion states."
      isAdmin={isAdmin}
      stickyHeader
      signedOut={{ message: "Sign in to view control loop.", forceRedirectUrl: "/control-loop", signUpForceRedirectUrl: "/control-loop" }}
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {panels.map((panel) => <Panel key={panel.title} title={panel.title} tasks={panel.data} onSelect={setSelectedTask} />)}
        </div>
        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Task detail</h2>
          {selectedTask ? (
            <div className="space-y-3 text-sm">
              <div><div className="text-slate-500">Title</div><div className="font-medium text-slate-900">{selectedTask.title}</div></div>
              <div className="flex gap-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(selectedTask.status)}`}>{selectedTask.status}</span><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${priorityClass(selectedTask.priority)}`}>{selectedTask.priority}</span></div>
              <div><div className="text-slate-500">Owner</div><div>{selectedTask.owner}</div></div>
              <div><div className="text-slate-500">Context</div><div className="whitespace-pre-wrap text-slate-700">{selectedTask.context || "—"}</div></div>
              <div><div className="text-slate-500">Acceptance criteria</div><ul className="list-disc pl-5 text-slate-700">{(selectedTask.acceptance_criteria || []).map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}</ul></div>
              <div><div className="text-slate-500">Updated</div><div>{new Date(selectedTask.updated_at).toLocaleString()}</div></div>
            </div>
          ) : <p className="text-sm text-slate-500">Click any task row to inspect details.</p>}
        </aside>
      </div>
    </DashboardPageLayout>
  );
}
