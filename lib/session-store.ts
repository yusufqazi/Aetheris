"use client";

import type { ResearchSession } from "@/lib/types";

const STORAGE_KEY = "aetheris-sessions";

export function loadLocalSessions() {
  if (typeof window === "undefined") {
    return [] as ResearchSession[];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as ResearchSession[];
  } catch {
    return [];
  }
}

export function saveLocalSession(session: ResearchSession) {
  const existing = loadLocalSessions().filter((item) => item.id !== session.id);
  const next = [session, ...existing].slice(0, 25);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function findLocalSession(id: string) {
  return loadLocalSessions().find((item) => item.id === id) ?? null;
}
