import { describe, expect, it } from "vitest";
import { formPayload, safeDocumentUrl } from "@/lib/hub";

describe("Household extras validation", () => {
  it("accepts secure document links and rejects executable schemes", () => {
    expect(safeDocumentUrl("https://example.com/lease.pdf")).toBe("https://example.com/lease.pdf");
    expect(safeDocumentUrl("javascript:alert(1)")).toBeNull();
  });
  it("rejects a booking ending before it starts", () => {
    const data = new FormData();
    data.set("start", "2026-10-20T15:00"); data.set("end", "2026-10-20T14:00");
    expect(() => formPayload("bookings", data)).toThrow("End time must be after start time");
  });
  it("creates distinct poll options and rejects a single option", () => {
    const data = new FormData(); data.set("options", "Tuesday\nWednesday\nTuesday");
    expect(formPayload("polls", data)["options"]).toEqual(["Tuesday", "Wednesday"]);
    data.set("options", "Tuesday\nTuesday");
    expect(() => formPayload("polls", data)).toThrow();
  });
  it("keeps the lost or found report type", () => {
    const data = new FormData(); data.set("reportType", "lost");
    expect(formPayload("lost-found", data)["reportType"]).toBe("lost");
  });
});