import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260720203000_create_research_sessions.sql"),
  "utf8",
);

describe("research sessions migration", () => {
  it("contains every field written by the session persistence adapter", () => {
    const columns = [
      "id",
      "user_id",
      "question",
      "status",
      "mode",
      "selected_agents",
      "documents",
      "pipeline",
      "events",
      "agent_executions",
      "evidence",
      "report_sections",
      "metrics",
      "confidence",
      "error",
      "results",
      "created_at",
      "updated_at",
    ];

    for (const column of columns) {
      expect(migration).toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  it("enforces authenticated row ownership for every application operation", () => {
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/force row level security/i);
    expect(migration).toMatch(/revoke all on table public\.research_sessions from anon/i);
    expect(migration.match(/\(select auth\.uid\(\)\) = user_id/g)).toHaveLength(5);
    for (const operation of ["select", "insert", "update", "delete"]) {
      expect(migration).toMatch(new RegExp(`for ${operation}`, "i"));
    }
  });
});
