"use client";

import { getLocalAuthToken, isLocalAuthMode } from "@/auth/localAuth";

/**
 * Auth-aware fetch wrapper for all manual Railway API calls.
 * Reads auth token from sessionStorage (local auth mode) and injects
 * Authorization: Bearer header automatically.
 * Uses NEXT_PUBLIC_API_URL as base — must point to Railway in production.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

function getAuthHeaders(): Record<string, string> {
  if (!isLocalAuthMode()) return {};
  const token = getLocalAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string> | undefined ?? {}),
  };
  if (
    options.body !== undefined &&
    options.body !== null &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text || path}`);
  }
  return res.json() as Promise<T>;
}
