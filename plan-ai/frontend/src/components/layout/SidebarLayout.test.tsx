/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SidebarLayout from "./SidebarLayout";
import { selectUser } from "../../store/slices/auth/authSelector";
import { selectSidebarCollapsed } from "../../store/slices/app/appSelector";
import { toggleSidebar } from "../../store/slices/app/appSlice";
import { UserApp } from "../../store/slices/auth/authTypes";

jest.mock("../../hooks/useBrandIdentity", () => ({
  useBrandIdentity: () => ({
    logoSrc: "/logo.svg",
    logoAlt: "Plan AI",
    productName: "Plan AI",
  }),
}));

const mockDispatch = jest.fn();
const mockSelectorResponses = new Map<any, unknown>();

jest.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => {
    if (mockSelectorResponses.has(selector)) {
      return mockSelectorResponses.get(selector);
    }
    return selector({});
  },
}));

const renderSidebar = (route = "/home", children: React.ReactNode = <div>Child content</div>) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <SidebarLayout>{children}</SidebarLayout>
    </MemoryRouter>,
  );

const stubUser: UserApp = {
  uid: "user-123",
  email: "jane@example.com",
  displayName: "Jane Doe",
  token: "token",
  emailVerified: true,
};

describe("SidebarLayout", () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockSelectorResponses.clear();
    mockSelectorResponses.set(selectUser, stubUser);
    mockSelectorResponses.set(selectSidebarCollapsed, false);
  });

  it("renders product info, navigation and profile details", () => {
    renderSidebar("/projects");

    expect(screen.getByText("Plan AI")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Plan AI" })).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /sessions/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("dispatches toggleSidebar when the collapse button is clicked", () => {
    renderSidebar("/home");

    fireEvent.click(screen.getByRole("button", { name: /collapse sidebar/i }));

    expect(mockDispatch).toHaveBeenCalledWith(toggleSidebar());
  });

  it("hides labels when sidebar is collapsed", () => {
    mockSelectorResponses.set(selectSidebarCollapsed, true);

    renderSidebar();

    expect(screen.queryByText("Plan AI")).not.toBeInTheDocument();
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();
  });
});
