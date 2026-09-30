import { clientLogger } from "./clientLogger";
import { HttpStatusError, isUnexpectedError, reportUnexpectedError } from "./reportError";

jest.mock("./clientLogger", () => ({
  clientLogger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockedError = clientLogger.error as jest.Mock;

describe("isUnexpectedError", () => {
  it("ignores RTK Query answers with an HTTP status (4xx expected, 5xx reported by baseQuery)", () => {
    for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
      expect(isUnexpectedError({ status, data: { message: "x" } })).toBe(false);
    }
  });

  it("ignores network, timeout and parsing errors from RTK Query", () => {
    expect(isUnexpectedError({ status: "FETCH_ERROR", error: "TypeError" })).toBe(false);
    expect(isUnexpectedError({ status: "TIMEOUT_ERROR", error: "timeout" })).toBe(false);
    expect(isUnexpectedError({ status: "PARSING_ERROR", originalStatus: 200 })).toBe(false);
  });

  it("reports a CUSTOM_ERROR from a queryFn", () => {
    expect(isUnexpectedError({ status: "CUSTOM_ERROR", error: "bad" })).toBe(true);
  });

  it("reports 5xx from plain fetch calls only", () => {
    expect(isUnexpectedError(new HttpStatusError(502))).toBe(true);
    expect(isUnexpectedError(new HttpStatusError(404))).toBe(false);
  });

  it("ignores cancellations and lost network", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isUnexpectedError(abort)).toBe(false);
    expect(isUnexpectedError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isUnexpectedError({ code: "auth/network-request-failed" })).toBe(false);
    expect(isUnexpectedError({ code: "auth/popup-closed-by-user" })).toBe(false);
  });

  it("reports exceptions from our code", () => {
    expect(isUnexpectedError(new Error("boom"))).toBe(true);
    expect(isUnexpectedError(new TypeError("x is undefined"))).toBe(true);
    expect(isUnexpectedError({ code: "auth/internal-error" })).toBe(true);
  });

  it("reports nothing while the browser is offline", () => {
    const spy = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(isUnexpectedError(new Error("boom"))).toBe(false);
    spy.mockRestore();
  });
});

describe("reportUnexpectedError", () => {
  beforeEach(() => mockedError.mockClear());

  it("sends the feature, status and code, never the error body", () => {
    reportUnexpectedError("notes.save", new HttpStatusError(500), { noteId: "n1" });
    expect(mockedError).toHaveBeenCalledWith("notes.save failed", expect.any(HttpStatusError), {
      feature: "notes.save",
      noteId: "n1",
      status: 500,
    });
  });

  it("does not pass a non Error value through, only its type", () => {
    reportUnexpectedError("trackers", { status: "CUSTOM_ERROR", data: { message: "my lunch" } });
    const [, error, context] = mockedError.mock.calls[0];
    expect(error).toBeUndefined();
    expect(JSON.stringify(context)).not.toContain("my lunch");
    expect(context).toMatchObject({ feature: "trackers", status: "CUSTOM_ERROR" });
  });

  it("keeps short error codes and drops anything that looks like text", () => {
    reportUnexpectedError("mfa", { code: "auth/internal-error" });
    expect(mockedError.mock.calls[0][2]).toMatchObject({ errorCode: "auth/internal-error" });
    mockedError.mockClear();
    reportUnexpectedError("mfa", { code: "someone@example.com wrote this" });
    expect(mockedError.mock.calls[0][2].errorCode).toBeUndefined();
  });

  it("stays silent for expected failures", () => {
    expect(reportUnexpectedError("notes.save", { status: 409, data: {} })).toBe(false);
    expect(mockedError).not.toHaveBeenCalled();
  });
});
