"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { apiFetch } from "@/lib/api-fetch";
import { useAuth } from "@/auth/clerk";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

type ItemStatus = "new" | "triaged" | "researching" | "feasibility" | "converted" | "archived";

type BrainDumpItem = {
  id: string;
  title: string;
  content: string | null;
  category: string;
  priority: string;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
  notes: string | null;
};

const CATEGORIES = ["Product", "Growth", "Research", "Infrastructure", "Automation", "Ops", "Content", "Other"];
const PRIORITIES = ["low", "medium", "high", "critical"];

const STATUS_BADGE: Record<ItemStatus, string> = {
  new: "bg-slate-100 text-slate-600",
  triaged: "bg-blue-100 text-blue-700",
  researching: "bg-amber-100 text-amber-700",
  feasibility: "bg-purple-100 text-purple-700",
  converted: "bg-emerald-100 text-emerald-700",
  archived: "bg-slate-300 text-slate-700",
};

export default function BrainDumpPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Other");
  const [priority, setPriority] = useState("medium");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const query = useQuery({
    queryKey: ["brain-dump"],
    queryFn: async () => {
      return apiFetch<BrainDumpItem[]>("/api/v1/api/brain-dump");
    },
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; category: string; priority: string }) => {
      return apiFetch("/api/v1/api/brain-dump", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      setTitle("");
      setContent("");
      setCategory("Other");
      setPriority("medium");
      setSubmitSuccess(true);
      setSubmitError("");
      setTimeout(() => setSubmitSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["brain-dump"] });
    },
    onError: (err: Error) => {
      setSubmitError(err.message);
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      return apiFetch(`/api/v1/api/brain-dump/${id}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brain-dump"] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitError("");
    createMutation.mutate({ title: title.trim(), content: content.trim(), category, priority });
  };

  return (
    <DashboardPageLayout
      title="Brain Dump"
      description="Capture ideas fast. Triage later."
      isAdmin={isAdmin}
      stickyHeader
      signedOut={{
        message: "Sign in to use Brain Dump.",
        forceRedirectUrl: "/brain-dump",
        signUpForceRedirectUrl: "/brain-dump",
      }}
    >
      {/* Capture form */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Quick Capture</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's the idea?"
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Any context, links, or detail..."
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          {submitError && <p className="text-xs text-red-500">{submitError}</p>}
          {submitSuccess && <p className="text-xs text-emerald-600">✓ Idea captured!</p>}
          <button
            type="submit"
            disabled={createMutation.isPending || !title.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {createMutation.isPending ? "Saving…" : "Capture idea"}
          </button>
        </form>
      </div>

      {/* Items list */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-100">
            <tr>
              <th className="py-3 px-4">Title</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Priority</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Created</th>
              <th className="py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((item) => (
              <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-4 font-medium max-w-xs">
                  <div>{item.title}</div>
                  {item.content && (
                    <div className="text-xs text-slate-400 mt-0.5 truncate">{item.content}</div>
                  )}
                </td>
                <td className="py-3 px-4 text-slate-500">{item.category}</td>
                <td className="py-3 px-4 text-slate-500 capitalize">{item.priority}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status as ItemStatus] ?? STATUS_BADGE.new}`}>
                    {item.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-400 text-xs whitespace-nowrap">
                  {new Date(item.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => assignMutation.mutate({ id: item.id, action: "research" })}
                      disabled={assignMutation.isPending}
                      className="rounded px-2 py-1 text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 disabled:opacity-50"
                    >
                      → Research
                    </button>
                    <button
                      onClick={() => assignMutation.mutate({ id: item.id, action: "builder" })}
                      disabled={assignMutation.isPending}
                      className="rounded px-2 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 disabled:opacity-50"
                    >
                      → Builder
                    </button>
                    <button
                      onClick={() => assignMutation.mutate({ id: item.id, action: "task" })}
                      disabled={assignMutation.isPending}
                      className="rounded px-2 py-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50"
                    >
                      Convert to Task
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {query.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No ideas yet — capture the first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {query.error && (
          <p className="p-4 text-sm text-red-500">{(query.error as Error).message}</p>
        )}
      </div>
    </DashboardPageLayout>
  );
}
