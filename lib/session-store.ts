"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { normalizeResearchSession } from "@/lib/research/session";
import type { ResearchSession } from "@/lib/types";

const DATABASE_NAME = "aetheris-workspace";
const DATABASE_VERSION = 1;
const SESSION_STORE = "sessions";
const LEGACY_STORAGE_KEY = "aetheris-sessions";
const MIGRATION_KEY = "aetheris-indexeddb-migration-v1";

interface AetherisDatabase extends DBSchema {
  sessions: {
    key: string;
    value: StoredResearchSession;
    indexes: { "by-updated-at": string };
  };
}

interface StoredResearchSession extends ResearchSession {
  ownerId?: string;
}

let databasePromise: Promise<IDBPDatabase<AetherisDatabase>> | null = null;

function getDatabase() {
  if (typeof window === "undefined") {
    return null;
  }

  databasePromise ??= openDB<AetherisDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      const store = database.createObjectStore(SESSION_STORE, { keyPath: "id" });
      store.createIndex("by-updated-at", "updatedAt");
    },
  });

  return databasePromise;
}

export async function loadLocalSessions(ownerId?: string | null) {
  const database = getDatabase();
  if (!database) {
    return [] as ResearchSession[];
  }

  await migrateLegacySessions();
  const values = await (await database).getAll(SESSION_STORE);

  return values
    .filter((session) => (ownerId ? session.ownerId === ownerId : !session.ownerId))
    .map(normalizeResearchSession)
    .filter((session): session is ResearchSession => Boolean(session))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveLocalSession(session: ResearchSession, ownerId?: string | null) {
  const database = getDatabase();
  if (!database) {
    return session;
  }

  await (await database).put(SESSION_STORE, { ...session, ownerId: ownerId ?? undefined });
  return session;
}

export async function saveLocalSessions(sessions: ResearchSession[]) {
  const database = getDatabase();
  if (!database) {
    return sessions;
  }

  const transaction = (await database).transaction(SESSION_STORE, "readwrite");
  await Promise.all([
    ...sessions.map((session) => transaction.store.put(session)),
    transaction.done,
  ]);
  return sessions;
}

export async function findLocalSession(id: string, ownerId?: string | null) {
  const database = getDatabase();
  if (!database) {
    return null;
  }

  await migrateLegacySessions();
  const session = await (await database).get(SESSION_STORE, id);
  if (!session || (ownerId ? session.ownerId !== ownerId : session.ownerId)) {
    return null;
  }
  return normalizeResearchSession(session);
}

export async function deleteLocalSession(id: string, ownerId?: string | null) {
  const database = getDatabase();
  if (!database) {
    return;
  }

  const current = await (await database).get(SESSION_STORE, id);
  if (!current || (ownerId ? current.ownerId !== ownerId : current.ownerId)) {
    return;
  }
  await (await database).delete(SESSION_STORE, id);
}

async function migrateLegacySessions() {
  if (typeof window === "undefined" || window.localStorage.getItem(MIGRATION_KEY) === "complete") {
    return;
  }

  const database = getDatabase();
  if (!database) {
    return;
  }

  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (raw) {
    try {
      const values = JSON.parse(raw) as unknown[];
      const sessions = values
        .map(normalizeResearchSession)
        .filter((session): session is ResearchSession => Boolean(session));
      const transaction = (await database).transaction(SESSION_STORE, "readwrite");
      await Promise.all([
        ...sessions.map((session) => transaction.store.put(session)),
        transaction.done,
      ]);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Leave malformed legacy data untouched; a future migration may still recover it.
    }
  }

  window.localStorage.setItem(MIGRATION_KEY, "complete");
}
