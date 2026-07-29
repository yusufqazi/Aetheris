import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ResearchQuestionSummary } from "@/components/workspace/ResearchQuestionSummary";

const LONG_QUESTION =
  "Is acute cellular rejection or another process the most likely cause of allograft dysfunction, what treatment should be prioritized, and what additional evidence is needed before management is finalized?";

describe("ResearchQuestionSummary", () => {
  afterEach(() => cleanup());

  it("collapses long questions and lets the user reveal the complete text", () => {
    render(<ResearchQuestionSummary question={LONG_QUESTION} />);

    const question = screen.getByRole("heading", { name: LONG_QUESTION });
    const toggle = screen.getByRole("button", { name: "View full question" });
    expect(question).toHaveClass("line-clamp-2");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(question).not.toHaveClass("line-clamp-2");
    expect(screen.getByRole("button", { name: "Collapse question" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("shows short questions without an unnecessary control", () => {
    render(<ResearchQuestionSummary question="What is the leading diagnosis?" />);

    expect(screen.getByRole("heading", { name: "What is the leading diagnosis?" })).not.toHaveClass(
      "line-clamp-2",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
