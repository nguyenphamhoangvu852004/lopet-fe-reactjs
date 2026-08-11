import { describe, expect, it } from "vitest";
import {
  BASELINE_PERMISSIONS,
  hasPermission,
  resolvePermissions,
  WILDCARD,
} from "./permissions";

describe("resolvePermissions", () => {
  it("tài khoản không role vẫn có đủ quyền baseline", () => {
    const granted = resolvePermissions();
    for (const code of BASELINE_PERMISSIONS) {
      expect(granted.has(code)).toBe(true);
    }
    expect(granted.has("report:read")).toBe(false);
  });

  it("cộng dồn quyền của nhiều role", () => {
    const granted = resolvePermissions(["MODERATOR", "SUPPORT"]);
    expect(granted.has("report:resolve")).toBe(true); // của MODERATOR
    expect(granted.has("account:read")).toBe(true); // của SUPPORT
    expect(granted.has("post:create")).toBe(true); // baseline vẫn còn
  });

  it("ADMIN nhận wildcard", () => {
    expect(resolvePermissions(["ADMIN"]).has(WILDCARD)).toBe(true);
  });
});

describe("hasPermission", () => {
  it("wildcard cho qua mọi quyền", () => {
    const granted = resolvePermissions(["ADMIN"]);
    expect(hasPermission(granted, "account:ban")).toBe(true);
    expect(hasPermission(granted, "quyen:khong:ton:tai")).toBe(true);
  });

  it("khớp chính xác mã quyền", () => {
    const granted = resolvePermissions(["MODERATOR"]);
    expect(hasPermission(granted, "post:delete")).toBe(true);
    expect(hasPermission(granted, "account:read")).toBe(false);
  });

  it("khớp wildcard theo nhóm, ví dụ report:*", () => {
    const granted = new Set(["report:*"]);
    expect(hasPermission(granted, "report:resolve")).toBe(true);
    expect(hasPermission(granted, "post:delete")).toBe(false);
  });
});
