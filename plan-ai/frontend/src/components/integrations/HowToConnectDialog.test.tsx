import React from "react";
import { render } from "@testing-library/react";
import { I18nextProvider, Trans } from "react-i18next";
import i18n from "../../i18n";
import { HowToConnectDialog } from "./HowToConnectDialog";

describe("HowToConnectDialog", () => {
  it("renders the help link from code and the tags from the translation", () => {
    const { baseElement } = render(
      <I18nextProvider i18n={i18n}>
        <HowToConnectDialog open onClose={() => undefined} provider="jira" />
      </I18nextProvider>,
    );

    const link = baseElement.querySelector("li a");
    expect(link?.getAttribute("href")).toBe(
      "https://id.atlassian.com/manage-profile/security/api-tokens",
    );
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.textContent).toBe("API Tokens");
    expect(baseElement.querySelector("li strong")?.textContent).toBe("Create API token");
  });
});

describe("workspaceTeam.description", () => {
  it("renders the workspace name as text, never as HTML", () => {
    const name = '<img src=x onerror="alert(1)">Team';
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <p>
          <Trans
            i18nKey="workspaceTeam.description"
            components={{ name: <strong>{name}</strong> }}
          />
        </p>
      </I18nextProvider>,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe(name);
  });
});
