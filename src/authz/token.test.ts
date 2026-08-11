import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeToken, isExpired } from "./token";

/** Ký giả một JWT: chữ ký không quan trọng vì decodeToken không kiểm chữ ký */
function makeToken(payload: unknown) {
  const body = btoa(
    // btoa chỉ nhận latin1 nên phải mã hoá UTF-8 trước, giống chiều ngược lại
    // trong token.ts — đây cũng là cách backend tạo token có dấu tiếng Việt.
    String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${body}.signature`;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("decodeToken", () => {
  it("đọc được id, email và roles", () => {
    const token = makeToken({
      id: 7,
      email: "admin@lopet.vn",
      roles: ["ADMIN"],
      exp: 1893456000,
    });
    expect(decodeToken(token)).toEqual({
      id: 7,
      email: "admin@lopet.vn",
      roles: ["ADMIN"],
      exp: 1893456000,
    });
  });

  it("giữ nguyên tiếng Việt có dấu trong payload", () => {
    const token = makeToken({ id: 1, email: "Nguyễn Văn Đức", roles: [] });
    expect(decodeToken(token)?.email).toBe("Nguyễn Văn Đứ");
  });

  it("roles thiếu hoặc sai kiểu thì thành mảng rỗng", () => {
    expect(decodeToken(makeToken({ id: 1 }))?.roles).toEqual([]);
    expect(decodeToken(makeToken({ id: 1, roles: "ADMIN" }))?.roles).toEqual(
      [],
    );
  });

  it("trả null với token rỗng, sai định dạng hoặc thiếu id", () => {
    expect(decodeToken(null)).toBeNull();
    expect(decodeToken("")).toBeNull();
    expect(decodeToken("khong-phai-jwt")).toBeNull();
    expect(decodeToken("a.b.c")).toBeNull();
    expect(decodeToken(makeToken({ email: "x@y.z" }))).toBeNull();
  });
});

describe("isExpired", () => {
  it("null hoặc không có exp thì coi như chưa hết hạn", () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired({ id: 1, roles: [] })).toBe(false);
  });

  it("so exp (giây) với thời điểm hiện tại", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const now = Math.floor(Date.now() / 1000);

    expect(isExpired({ id: 1, roles: [], exp: now - 1 })).toBe(true);
    expect(isExpired({ id: 1, roles: [], exp: now + 60 })).toBe(false);
  });
});
