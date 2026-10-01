import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "../../i18n";
import i18n from "../../i18n";
import type { TaskUpdateProposal } from "../../store/apis/dailyReportApi";
import TaskProposalRow from "./TaskProposalRow";

const proposal = (overrides: Partial<TaskUpdateProposal>): TaskUpdateProposal => ({
  id: "p-1",
  kind: "BLOCKED",
  status: "PROPOSED",
  title: "Tancar l'IVA del trimestre",
  detail: "Falten tres factures",
  day: "2026-10-01",
  noteId: "n-1",
  taskId: "t-1",
  taskStatus: "IN_PROGRESS",
  projectId: null,
  projectTitle: "Comptabilitat",
  createdAt: "2026-10-01T17:30:00.000Z",
  reviewedAt: null,
  ...overrides,
});

const renderRow = (p: TaskUpdateProposal, title = p.title) => {
  const handlers = { onTitleChange: jest.fn(), onAccept: jest.fn(), onReject: jest.fn() };
  render(<TaskProposalRow proposal={p} title={title} busy={false} {...handlers} />);
  return handlers;
};

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("TaskProposalRow", () => {
  it("shows what is stuck, why, and where the task lives", () => {
    const handlers = renderRow(proposal({}));
    expect(screen.getByText("Stuck")).toBeInTheDocument();
    expect(screen.getByText("Falten tres factures")).toBeInTheDocument();
    expect(screen.getByText("Comptabilitat")).toBeInTheDocument();
    // An existing task keeps its title: there is nothing to edit.
    expect(screen.queryByRole("button", { name: "Edit title" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(handlers.onAccept).toHaveBeenCalled();
  });

  it("lets the member rename a new task before accepting it", () => {
    const handlers = renderRow(
      proposal({ kind: "NEW", taskId: null, projectTitle: null, detail: null }),
    );
    expect(screen.getByText("Goes to: Daily report project")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit title" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Trucar dilluns" } });
    expect(handlers.onTitleChange).toHaveBeenCalledWith("Trucar dilluns");
  });

  it("cannot accept a new task with an empty title", () => {
    renderRow(proposal({ kind: "NEW", taskId: null }), "   ");
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  });
});
