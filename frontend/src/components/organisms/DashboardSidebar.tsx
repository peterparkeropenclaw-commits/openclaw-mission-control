"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  LayoutGrid,
  Settings,
  Siren,
  Brain,
  Workflow,
  Server,
  Radio,
  RefreshCcw,
} from "lucide-react";

import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import {
  type healthzHealthzGetResponse,
  useHealthzHealthzGet,
} from "@/api/generated/default/default";
import { cn } from "@/lib/utils";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const healthQuery = useHealthzHealthzGet<healthzHealthzGetResponse, ApiError>(
    {
      query: {
        refetchInterval: 30_000,
        refetchOnMount: "always",
        retry: false,
      },
      request: { cache: "no-store" },
    },
  );

  const okValue = healthQuery.data?.data?.ok;
  const systemStatus: "unknown" | "operational" | "degraded" =
    okValue === true
      ? "operational"
      : okValue === false
        ? "degraded"
        : healthQuery.isError
          ? "degraded"
          : "unknown";
  const statusLabel =
    systemStatus === "operational"
      ? "All systems operational"
      : systemStatus === "unknown"
        ? "System status unavailable"
        : "System degraded";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[280px] -translate-x-full flex-col border-r border-slate-200 bg-white pt-16 shadow-lg transition-transform duration-200 ease-in-out [[data-sidebar=open]_&]:translate-x-0 md:relative md:inset-auto md:z-auto md:w-[260px] md:translate-x-0 md:pt-0 md:shadow-none md:transition-none">
      <div className="flex-1 px-3 py-4">
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Navigation
        </p>
        <nav className="mt-3 space-y-4 text-sm">
          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Mission Control
            </p>
            <div className="mt-1 space-y-1">
              <Link href="/dashboard" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition", pathname === "/dashboard" ? "bg-blue-100 text-blue-800 font-medium" : "hover:bg-slate-100")}><BarChart3 className="h-4 w-4" />Dashboard</Link>
              <Link href="/attention" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition", pathname.startsWith("/attention") ? "bg-blue-100 text-blue-800 font-medium" : "hover:bg-slate-100")}><Siren className="h-4 w-4" />Attention</Link>
              <Link href="/control-loop" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition", pathname.startsWith("/control-loop") ? "bg-blue-100 text-blue-800 font-medium" : "hover:bg-slate-100")}><RefreshCcw className="h-4 w-4" />Control Loop</Link>
            </div>
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Work
            </p>
            <div className="mt-1 space-y-1">
              <Link href="/boards" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition", pathname.startsWith("/boards") ? "bg-blue-100 text-blue-800 font-medium" : "hover:bg-slate-100")}><LayoutGrid className="h-4 w-4" />Tasks</Link>
              <Link href="/approvals" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition", pathname.startsWith("/approvals") ? "bg-blue-100 text-blue-800 font-medium" : "hover:bg-slate-100")}><CheckCircle2 className="h-4 w-4" />Approvals</Link>
              <Link href="/brain-dump" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition", pathname.startsWith("/brain-dump") ? "bg-blue-100 text-blue-800 font-medium" : "hover:bg-slate-100")}><Brain className="h-4 w-4" />Brain Dump</Link>
            </div>
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              System
            </p>
            <div className="mt-1 space-y-1">
              {isAdmin ? <Link href="/agents" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition", pathname.startsWith("/agents") ? "bg-blue-100 text-blue-800 font-medium" : "hover:bg-slate-100")}><Bot className="h-4 w-4" />Agents</Link> : null}
              <Link href="/services" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition", pathname.startsWith("/services") ? "bg-blue-100 text-blue-800 font-medium" : "hover:bg-slate-100")}><Server className="h-4 w-4" />Services</Link>
              <Link href="/flows" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition", pathname.startsWith("/flows") ? "bg-blue-100 text-blue-800 font-medium" : "hover:bg-slate-100")}><Workflow className="h-4 w-4" />Flows</Link>
            </div>
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Admin
            </p>
            <div className="mt-1 space-y-1">
              <Link href="/configuration" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition", pathname.startsWith("/configuration") ? "bg-blue-100 text-blue-800 font-medium" : "hover:bg-slate-100")}><Settings className="h-4 w-4" />Configuration</Link>
            </div>
          </div>
        </nav>
      </div>
      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              systemStatus === "operational" && "bg-emerald-500",
              systemStatus === "degraded" && "bg-rose-500",
              systemStatus === "unknown" && "bg-slate-300",
            )}
          />
          {statusLabel}
        </div>
      </div>
    </aside>
  );
}
