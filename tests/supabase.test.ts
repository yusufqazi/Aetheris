import { describe, expect, it } from "vitest";

import { isMissingResearchSessionsTableError } from "@/lib/supabase";

describe("Supabase session persistence diagnostics", () => {
  it("recognizes the PostgREST missing-table schema-cache error", () => {
    expect(isMissingResearchSessionsTableError({
      code: "PGRST205",
      message: "Could not find the table 'public.research_sessions' in the schema cache",
    })).toBe(true);
  });

  it("does not hide unrelated persistence failures", () => {
    expect(isMissingResearchSessionsTableError({
      code: "42501",
      message: "new row violates row-level security policy",
    })).toBe(false);
  });
});
