import type { AuditLogEntryResponse } from "../../../store/apis/workspaceApi";
import {
  AUDIT_ACTION_GROUPS,
  auditActionLabelKey,
  buildAuditCsv,
  formatAuditDetails,
  formatAuditTarget,
} from "./auditLogFormat";
import {
  customProviderOf,
  isValidDomain,
  normaliseDomain,
  providerChoiceOf,
  requiredProviderValue,
} from "./signInRules";

const entry = (overrides: Partial<AuditLogEntryResponse>): AuditLogEntryResponse => ({
  id: "1",
  action: "member.invited",
  actorUserId: "u1",
  actorEmail: "owner@acme.com",
  targetType: "member",
  targetId: "m1",
  metadata: null,
  ip: null,
  userAgent: null,
  createdAt: "2026-09-29T10:00:00.000Z",
  ...overrides,
});

describe("audit log format", () => {
  it("maps known actions to i18n keys and leaves unknown ones raw", () => {
    expect(auditActionLabelKey("member.role_changed")).toBe(
      "workspaceSecurity.auditLog.actions.member_role_changed",
    );
    expect(auditActionLabelKey("platform_admin.access")).toBe(
      "workspaceSecurity.auditLog.actions.platform_admin_access",
    );
    expect(auditActionLabelKey("note.shared")).toBe(
      "workspaceSecurity.auditLog.actions.note_shared",
    );
    expect(auditActionLabelKey("note.unshared")).toBe(
      "workspaceSecurity.auditLog.actions.note_unshared",
    );
    expect(auditActionLabelKey("note.deleted")).toBe(
      "workspaceSecurity.auditLog.actions.note_deleted",
    );
    expect(AUDIT_ACTION_GROUPS).toContain("note");
    expect(auditActionLabelKey("something.new")).toBeNull();
  });

  it("formats target and details", () => {
    expect(formatAuditTarget(entry({}))).toBe("member m1");
    expect(formatAuditTarget(entry({ targetType: null, targetId: null }))).toBe("");
    expect(formatAuditDetails({ role: "ADMIN", empty: "", nested: { a: 1 } })).toBe(
      'role: ADMIN, nested: {"a":1}',
    );
    expect(formatAuditDetails(null)).toBe("");
  });

  it("builds a CSV that quotes values and neutralises formulas", () => {
    const csv = buildAuditCsv(
      [
        entry({ metadata: { note: 'said "hi", then left' } }),
        entry({ id: "2", actorEmail: '=HYPERLINK("http://x")', action: "custom.action" }),
      ],
      {
        headers: ["Time", "Who", "Action", "Target", "Details"],
        actionLabel: (action) => (action === "member.invited" ? "Member invited" : action),
        actorLabel: (e) => e.actorEmail ?? "System",
      },
    );
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Time,Who,Action,Target,Details");
    expect(lines[1]).toBe(
      '2026-09-29T10:00:00.000Z,owner@acme.com,Member invited,member m1,"note: said ""hi"", then left"',
    );
    expect(lines[2]).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(lines[2]).toContain("custom.action");
  });
});

describe("sign-in rules helpers", () => {
  it("normalises and validates domains", () => {
    expect(normaliseDomain(" @Acme.COM ")).toBe("acme.com");
    expect(isValidDomain("acme.com")).toBe(true);
    expect(isValidDomain("mail.acme.co.uk")).toBe(true);
    expect(isValidDomain("acme")).toBe(false);
    expect(isValidDomain("-acme.com")).toBe(false);
    expect(isValidDomain("acme .com")).toBe(false);
  });

  it("maps providers to the select and back", () => {
    expect(providerChoiceOf(null)).toBe("none");
    expect(providerChoiceOf("google.com")).toBe("google.com");
    expect(providerChoiceOf("saml.acme")).toBe("custom");
    expect(customProviderOf("saml.acme")).toBe("saml.acme");
    expect(customProviderOf("password")).toBe("");
    expect(requiredProviderValue("none", "")).toBeNull();
    expect(requiredProviderValue("custom", " oidc.acme ")).toBe("oidc.acme");
    expect(requiredProviderValue("microsoft.com", "")).toBe("microsoft.com");
  });
});
