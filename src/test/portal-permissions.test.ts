import { describe, expect, it } from "vitest";
import { canManage, portalPermissions } from "@/lib/portal-permissions";

describe("Admin portal permissions", () => {
  it("gives administrators full access without custom roles", () => {
    for (const permission of portalPermissions) expect(canManage(true, [], permission.id)).toBe(true);
  });
  it("does not give ordinary residents administrator access", () => {
    expect(canManage(false, [], "household.manage")).toBe(false);
  });
  it("grants only permissions explicitly assigned through a custom role", () => {
    expect(canManage(false, ["issues.manage"], "issues.manage")).toBe(true);
    expect(canManage(false, ["issues.manage"], "household.manage")).toBe(false);
  });
});