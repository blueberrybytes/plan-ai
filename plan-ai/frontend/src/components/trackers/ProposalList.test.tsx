import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "../../i18n";
import type { Tracker, TrackerEntry } from "../../store/apis/trackersApi";
import ProposalList, { type ProposalListProps } from "./ProposalList";

const tracker = (overrides: Partial<Tracker>): Tracker => ({
  id: "t-cal",
  name: "Calories",
  kind: "CALORIES",
  unit: "kcal",
  aggregation: "SUM",
  goalValue: 2000,
  goalDirection: "AT_MOST",
  goalPeriod: "DAY",
  instructions: null,
  position: 0,
  archived: false,
  createdAt: "2026-09-30T08:00:00.000Z",
  updatedAt: "2026-09-30T08:00:00.000Z",
  ...overrides,
});

const entry = (overrides: Partial<TrackerEntry>): TrackerEntry => ({
  id: "e-1",
  trackerId: "t-cal",
  date: "2026-09-01",
  value: 347,
  label: "Lunch",
  details: {
    items: [
      {
        name: "Chicken breast",
        grams: 150,
        gramsLow: 120,
        gramsHigh: 180,
        kcal: 248,
      },
      { name: "Olive oil", grams: 10, kcal: 88 },
    ],
    kcalLow: 281,
    kcalHigh: 452,
  },
  status: "PROPOSED",
  source: "NOTE",
  noteId: "n-1",
  createdAt: "2026-09-01T12:00:00.000Z",
  ...overrides,
});

const renderList = (props: Partial<ProposalListProps> = {}) => {
  const handlers = {
    onAccept: jest.fn(),
    onReject: jest.fn(),
    onSaveValue: jest.fn(),
    onAcceptAll: jest.fn(),
  };
  render(
    <ProposalList
      entries={[entry({})]}
      trackers={[
        tracker({}),
        tracker({ id: "t-steps", name: "Steps", kind: "NUMBER", unit: "steps" }),
      ]}
      hideCalories={false}
      busyIds={[]}
      acceptingAll={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

describe("ProposalList", () => {
  it("shows the kcal estimate and the foods", () => {
    renderList();
    expect(screen.getByText("about 350 kcal (280 to 450)")).toBeInTheDocument();
    expect(screen.getByText(/Chicken breast, 150 g \(120 to 180 g\)/)).toBeInTheDocument();
    expect(screen.getByText(/Olive oil, 10 g, 88 kcal/)).toBeInTheDocument();
  });

  it("hides every kcal number when calories are hidden", () => {
    renderList({ hideCalories: true });
    expect(screen.queryByText(/kcal/)).not.toBeInTheDocument();
    expect(screen.getByText(/Chicken breast, 150 g/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit value" })).not.toBeInTheDocument();
  });

  it("accepts, rejects and edits one proposal", () => {
    const handlers = renderList({
      entries: [
        entry({ id: "e-2", trackerId: "t-steps", value: 7500, details: null, label: null }),
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(handlers.onAccept).toHaveBeenCalledWith(expect.objectContaining({ id: "e-2" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(handlers.onReject).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Edit value" }));
    const input = screen.getByRole("textbox", { name: "Value" });
    fireEvent.change(input, { target: { value: "8200" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handlers.onSaveValue).toHaveBeenCalledWith(expect.objectContaining({ id: "e-2" }), 8200);
  });

  it("offers accept all only with more than one proposal", () => {
    renderList();
    expect(screen.queryByRole("button", { name: "Accept all" })).not.toBeInTheDocument();
    const handlers = renderList({ entries: [entry({}), entry({ id: "e-3" })] });
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(handlers.onAcceptAll).toHaveBeenCalled();
  });

  it("renders nothing without proposals", () => {
    const { container } = render(
      <ProposalList
        entries={[]}
        trackers={[]}
        hideCalories={false}
        busyIds={[]}
        acceptingAll={false}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        onSaveValue={jest.fn()}
        onAcceptAll={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
