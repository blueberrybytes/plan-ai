import http from "http";
import type { AddressInfo } from "net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { assertSafeUrl, guardedLookup, isPrivateAddress, safeAxios, safeFetch } from "../ssrfGuard";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
  ])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "172.32.0.1", "142.250.184.14", "2606:4700:4700::1111"])(
    "allows %s",
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

describe("assertSafeUrl", () => {
  afterEach(() => {
    delete process.env.SSRF_ALLOWED_HOSTS;
    delete process.env.SSRF_ALLOW_PRIVATE_NETWORKS;
  });

  it.each([
    "http://localhost:8080/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://postgres.railway.internal:5432/",
    "http://metadata.google.internal/",
    "file:///etc/passwd",
    "gopher://example.com/",
    "http://user:pass@example.com/",
  ])("refuses %s", (url) => {
    expect(() => assertSafeUrl(url)).toThrow();
  });

  it("accepts a public https URL", () => {
    expect(assertSafeUrl("https://example.com/a.png").hostname).toBe("example.com");
  });

  it("lets a private install allow its own hosts", () => {
    process.env.SSRF_ALLOWED_HOSTS = "twenty.corp.internal";
    expect(() => assertSafeUrl("http://twenty.corp.internal/rest")).not.toThrow();
    expect(() => assertSafeUrl("http://other.corp.internal/rest")).toThrow();
  });
});

describe("requests through the guard", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end("internal"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("safeAxios refuses a loopback URL", async () => {
    await expect(safeAxios.get(`http://127.0.0.1:${port}/`)).rejects.toThrow();
  });

  it("the connect-time lookup refuses a name that resolves to loopback", async () => {
    // "localhost" resolves through /etc/hosts, so this needs no network. The
    // URL check is skipped on purpose to reach the lookup the sockets use.
    const error = await new Promise<Error | null>((resolve) =>
      guardedLookup("localhost", {}, (err) => resolve(err)),
    );
    expect(error?.name).toBe("SsrfBlockedError");
  });

  it("safeFetch refuses loopback too", async () => {
    await expect(safeFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
  });

  it("both reach the server when a private install allows it", async () => {
    process.env.SSRF_ALLOW_PRIVATE_NETWORKS = "true";
    try {
      const a = await safeAxios.get(`http://127.0.0.1:${port}/`);
      expect(a.data).toBe("internal");
      const f = await safeFetch(`http://127.0.0.1:${port}/`);
      expect(await f.text()).toBe("internal");
    } finally {
      delete process.env.SSRF_ALLOW_PRIVATE_NETWORKS;
    }
  });
});
