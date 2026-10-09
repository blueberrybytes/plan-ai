import en from "../../../i18n/locales/en.json";
import es from "../../../i18n/locales/es.json";
import { WEBHOOK_EVENTS, apiErrorMessage, webhookEventLabelKey } from "./webhookEvents";

const lookup = (bundle: unknown, key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      bundle,
    );

const keysOf = (node: unknown, prefix = ""): string[] =>
  node && typeof node === "object"
    ? Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
        keysOf(value, prefix ? `${prefix}.${key}` : key),
      )
    : [prefix];

describe("webhook texts", () => {
  it("explains every event in both languages", () => {
    for (const event of WEBHOOK_EVENTS) {
      const key = webhookEventLabelKey(event);
      expect(typeof lookup(en, key)).toBe("string");
      expect(typeof lookup(es, key)).toBe("string");
    }
  });

  it("has the same keys in English and Spanish", () => {
    expect(keysOf(es.webhooks).sort()).toEqual(keysOf(en.webhooks).sort());
  });

  it("labels the webhook entries of the audit log in both languages", () => {
    for (const action of ["created", "deleted", "secret_rotated", "disabled"]) {
      const key = `workspaceSecurity.auditLog.actions.webhook_${action}`;
      expect(typeof lookup(en, key)).toBe("string");
      expect(typeof lookup(es, key)).toBe("string");
    }
    expect(typeof lookup(en, "workspaceSecurity.auditLog.groups.webhook")).toBe("string");
    expect(typeof lookup(es, "workspaceSecurity.auditLog.groups.webhook")).toBe("string");
  });
});

describe("apiErrorMessage", () => {
  it("reads the message the API sent", () => {
    expect(
      apiErrorMessage({ status: 400, data: { message: "The URL must start with https://." } }),
    ).toBe("The URL must start with https://.");
  });

  it("gives null when there is none", () => {
    expect(apiErrorMessage(null)).toBeNull();
    expect(apiErrorMessage({ status: 500 })).toBeNull();
    expect(apiErrorMessage({ data: { message: 42 } })).toBeNull();
  });
});
