import React from "react";
import { render, screen } from "@testing-library/react";
import "../../i18n";
import i18n from "../../i18n";
import type { TeamReportMember } from "../../store/apis/dailyReportApi";
import TeamMemberCard from "./TeamMemberCard";

const task = (id: string, title: string) => ({
  id,
  title,
  projectTitle: "Comptabilitat",
  date: "2026-09-22T10:00:00.000Z",
  reason: null,
});

const member = (overrides: Partial<TeamReportMember>): TeamReportMember => ({
  userId: "u-1",
  name: "Marta Puig",
  email: "marta@example.com",
  role: "MEMBER",
  usesDailyReport: true,
  completedCount: 7,
  completed: Array.from({ length: 7 }, (_, i) => task(`t${i}`, `Closed task ${i}`)),
  inProgressCount: 2,
  blocked: [{ ...task("b1", "Tancar l'IVA"), date: null, reason: "Falten factures" }],
  overdueCount: 0,
  overdue: [],
  reportDays: 4,
  summary: null,
  ...overrides,
});

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("TeamMemberCard", () => {
  it("shows counts, the reason a task is stuck and caps long lists", () => {
    render(<TeamMemberCard member={member({})} />);
    expect(screen.getByText("Closed: 7")).toBeInTheDocument();
    expect(screen.getByText("Daily report: 4 of 5 days")).toBeInTheDocument();
    expect(screen.getByText(/Falten factures/)).toBeInTheDocument();
    expect(screen.getByText("and 2 more")).toBeInTheDocument();
    expect(screen.queryByText("Closed task 6")).toBeNull();
  });

  it("says so when the member does not use the daily report", () => {
    render(<TeamMemberCard member={member({ reportDays: null, usesDailyReport: false })} />);
    expect(screen.getByText("Does not use the daily report")).toBeInTheDocument();
  });
});
