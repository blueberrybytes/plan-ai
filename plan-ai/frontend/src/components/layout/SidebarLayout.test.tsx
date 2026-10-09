/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SidebarLayout from "./SidebarLayout";
import { selectAvatar, selectUser, selectUserDb } from "../../store/slices/auth/authSelector";
import {
  selectActiveWorkspaceId,
  selectSidebarCollapsed,
} from "../../store/slices/app/appSelector";
import { toggleSidebar } from "../../store/slices/app/appSlice";
import { UserApp } from "../../store/slices/auth/authTypes";

jest.mock("../../hooks/useBrandIdentity", () => ({
  useBrandIdentity: () => ({
    logoSrc: "/logo.svg",
    logoAlt: "Plan AI",
    productName: "Plan AI",
  }),
}));

// The sidebar reads workspaces, usage and billing through RTK Query. Those
// modules need a real store, so the test stubs the hooks it uses.
jest.mock("../../store/apis/aiUsageApi", () => ({
  useGetUsageMetricsQuery: () => ({ data: undefined }),
}));
jest.mock("../../store/apis/workspaceApi", () => ({
  useGetMyWorkspacesQuery: () => ({ data: [] }),
}));
jest.mock("../../store/apis/billingApi", () => ({
  useGetSubscriptionQuery: () => ({ data: undefined }),
}));
jest.mock("./WorkspaceSwitcher", () => ({ __esModule: true, default: () => null }));
jest.mock("../search/GlobalSearch", () => ({ __esModule: true, default: () => null }));
jest.mock("../billing/SubscriptionBanner", () => ({ __esModule: true, default: () => null }));

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
  emailVerified: true,
};

// Tests run without i18n set up, so labels come out as their keys.
const COLLAPSE = /collapse sidebar|sidebarLayout\.tooltip\.collapse/i;
const EXPAND = /expand sidebar|sidebarLayout\.tooltip\.expand/i;

describe("SidebarLayout", () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockSelectorResponses.clear();
    mockSelectorResponses.set(selectUser, stubUser);
    mockSelectorResponses.set(selectUserDb, null);
    mockSelectorResponses.set(selectAvatar, null);
    mockSelectorResponses.set(selectActiveWorkspaceId, "ws-1");
    mockSelectorResponses.set(selectSidebarCollapsed, false);
  });

  it("renders navigation, profile details and the page content", () => {
    renderSidebar("/projects");

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sessions/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("dispatches toggleSidebar when the collapse button is clicked", () => {
    renderSidebar("/home");

    fireEvent.click(screen.getByRole("button", { name: COLLAPSE }));

    expect(mockDispatch).toHaveBeenCalledWith(toggleSidebar());
  });

  it("hides labels when sidebar is collapsed", () => {
    mockSelectorResponses.set(selectSidebarCollapsed, true);

    renderSidebar();

    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: EXPAND })).toBeInTheDocument();
  });
});
