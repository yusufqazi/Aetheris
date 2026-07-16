import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LivePipeline } from "@/components/workspace/pipeline/LivePipeline";
import { makeDemoSession } from "@/lib/demo-data";

describe("workspace pipeline", () => {
  it("renders real completed metrics and retrieval method", () => {
    const session = makeDemoSession();
    render(<LivePipeline session={session} />);

    expect(screen.getByText("Research pipeline")).toBeInTheDocument();
    expect(screen.getByText(/Every selected stage completed/)).toBeInTheDocument();
    expect(screen.getByText(/Retrieval: lexical/i)).toBeInTheDocument();
    expect(screen.getByText(`${session.metrics.pageCount} pages`)).toBeInTheDocument();
    expect(screen.getByText(`${session.metrics.chunkCount} chunks`)).toBeInTheDocument();
  });
});
