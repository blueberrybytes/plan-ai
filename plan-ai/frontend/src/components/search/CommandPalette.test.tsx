import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import CommandPalette from "./CommandPalette";
import type { SearchHit } from "../../store/apis/searchApi";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${Object.values(options).join(" ")}` : key,
  }),
}));

const mockQuery = jest.fn();
jest.mock("../../store/apis/searchApi", () => ({
  useSearchWorkspaceQuery: (...args: unknown[]) => mockQuery(...args),
}));

const hit = (over: Partial<SearchHit>): SearchHit => ({
  type: "meeting",
  id: "x",
  title: "x",
  snippet: null,
  titleMatch: false,
  projectId: null,
  projectTitle: null,
  date: "2026-01-01T00:00:00.000Z",
  ...over,
});

const commands = [
  { labelKey: "nav.projects", path: "/projects" },
  { labelKey: "nav.notes", path: "/notes" },
];

const hits = [
  hit({ type: "task", id: "k1", title: "Send budget", projectId: "p1", projectTitle: "Acme" }),
  hit({ type: "meeting", id: "m1", title: "Weekly", snippet: "the budget moved", atSeconds: 95 }),
  hit({ type: "meeting", id: "m2", title: "", projectId: "p1", projectTitle: "Acme" }),
];

const input = () => screen.getByRole("combobox");
const selectedRow = () => screen.getByRole("option", { selected: true });

const type = (text: string) => {
  fireEvent.change(input(), { target: { value: text } });
  // Let the debounce pass.
  act(() => {
    jest.advanceTimersByTime(300);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  mockNavigate.mockReset();
  mockQuery.mockReset().mockReturnValue({ data: undefined, isFetching: false, isError: false });
});
afterEach(() => jest.useRealTimers());

describe("CommandPalette", () => {
  it("lists the pages before the user types and opens one with Enter", () => {
    const onClose = jest.fn();
    render(<CommandPalette open onClose={onClose} commands={commands} />);

    expect(screen.getByText("globalSearch.commandsTitle")).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((row) => row.textContent)).toEqual([
      "nav.projects",
      "nav.notes",
    ]);
    // Nothing is asked from the server for an empty box.
    expect(mockQuery.mock.calls.every(([, options]) => options.skip)).toBe(true);

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(selectedRow()).toHaveTextContent("nav.notes");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(mockNavigate).toHaveBeenCalledWith("/notes");
    expect(onClose).toHaveBeenCalled();
  });

  it("asks for more characters before searching", () => {
    render(<CommandPalette open onClose={jest.fn()} commands={commands} />);
    type("a");
    expect(screen.getByText("globalSearch.tooShort")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(mockQuery.mock.calls.every(([, options]) => options.skip)).toBe(true);
  });

  it("searches after the debounce and groups the results by type", () => {
    mockQuery.mockReturnValue({ data: { data: { hits } }, isFetching: false, isError: false });
    render(<CommandPalette open onClose={jest.fn()} commands={commands} />);

    fireEvent.change(input(), { target: { value: "budget" } });
    expect(mockQuery.mock.calls.every(([, options]) => options.skip)).toBe(true);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(mockQuery).toHaveBeenLastCalledWith({ q: "budget", limit: 20 }, { skip: false });

    // Meetings first, then tasks, whatever order the server sent.
    expect(screen.getByText("globalSearch.groups.meeting")).toBeInTheDocument();
    expect(screen.getByText("globalSearch.groups.task")).toBeInTheDocument();
    const rows = screen.getAllByRole("option");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Weekly");
    expect(rows[0]).toHaveTextContent("the budget moved");
    expect(rows[0]).toHaveTextContent("globalSearch.at 1:35");
    expect(rows[1]).toHaveTextContent("globalSearch.untitledMeeting");
    expect(rows[2]).toHaveTextContent("Send budget");
    expect(rows[2]).toHaveTextContent("Acme");
  });

  it("moves with the arrows, wraps around, and opens the selected hit", () => {
    mockQuery.mockReturnValue({ data: { data: { hits } }, isFetching: false, isError: false });
    const onClose = jest.fn();
    render(<CommandPalette open onClose={onClose} commands={commands} />);
    type("budget");

    expect(selectedRow()).toHaveTextContent("Weekly");
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(selectedRow()).toHaveTextContent("Send budget");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(selectedRow()).toHaveTextContent("globalSearch.untitledMeeting");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(mockNavigate).toHaveBeenCalledWith("/projects/p1/info/transcripts/m2");
    expect(onClose).toHaveBeenCalled();
  });

  it("opens a hit on click", () => {
    mockQuery.mockReturnValue({ data: { data: { hits } }, isFetching: false, isError: false });
    render(<CommandPalette open onClose={jest.fn()} commands={commands} />);
    type("budget");
    fireEvent.click(screen.getByText("Send budget"));
    expect(mockNavigate).toHaveBeenCalledWith("/projects/p1?tab=board&task=k1");
  });

  it("says when nothing was found", () => {
    mockQuery.mockReturnValue({ data: { data: { hits: [] } }, isFetching: false, isError: false });
    render(<CommandPalette open onClose={jest.fn()} commands={commands} />);
    type("zebra");
    expect(screen.getByText("globalSearch.empty zebra")).toBeInTheDocument();
  });

  it("shows that it is searching", () => {
    mockQuery.mockReturnValue({ data: undefined, isFetching: true, isError: false });
    render(<CommandPalette open onClose={jest.fn()} commands={commands} />);
    type("budget");
    expect(screen.getByText("globalSearch.loading")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows an error when the search fails", () => {
    mockQuery.mockReturnValue({ data: undefined, isFetching: false, isError: true });
    render(<CommandPalette open onClose={jest.fn()} commands={commands} />);
    type("budget");
    expect(screen.getByText("globalSearch.error")).toBeInTheDocument();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("closes with Escape", () => {
    const onClose = jest.fn();
    render(<CommandPalette open onClose={onClose} commands={commands} />);
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
