/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";

import { HealthckeckController } from "../healthcheckController";

describe("HealthckeckController", () => {
  it("returns ok payload when health check succeeds", async () => {
    const controller = new HealthckeckController();

    const response = await controller.getHealthStatus();

    expect(response).toEqual({
      status: 200,
      data: "ok",
    });
  });

  it("sets status to 500 and rethrows when payload generation fails", async () => {
    const controller = new HealthckeckController();
    vi.spyOn(controller as any, "getStatusPayload").mockImplementation(() => {
      throw Object.assign(new Error("boom"), { status: 418 });
    });
    const setStatusSpy = vi.spyOn(controller as any, "setStatus");

    await expect(controller.getHealthStatus()).rejects.toMatchObject({
      status: 418,
      message: "boom",
    });
    expect(setStatusSpy).toHaveBeenCalledWith(500);
  });
});
