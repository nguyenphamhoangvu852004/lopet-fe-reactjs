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
  it("đọc được id, email và exp", () => {
    const token = makeToken({
      id: 7,
      email: "admin@lopet.vn",
      exp: 1893456000,
    });
    expect(decodeToken(token)).toEqual({
      id: 7,
      email: "admin@lopet.vn",
      exp: 1893456000,
    });
  });

  it("giữ nguyên tiếng Việt có dấu trong payload", () => {
    const token = makeToken({ id: 1, email: "Nguyễn Văn Đức" });
    expect(decodeToken(token)?.email).toBe("Nguyễn Văn Đức");
  });

  /**
   * Token do backend cũ ký vẫn còn claim `roles`. Nó không được đọc nữa, và
   * quan trọng hơn: không được lọt vào payload để rồi có chỗ nào đó tin vào nó.
   */
  it("bỏ qua claim roles còn sót của token cũ", () => {
    expect(decodeToken(makeToken({ id: 1, roles: ["ADMIN"] }))).toEqual({
      id: 1,
      email: undefined,
      exp: undefined,
    });
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
    expect(isExpired({ id: 1 })).toBe(false);
  });

  it("so exp (giây) với thời điểm hiện tại", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const now = Math.floor(Date.now() / 1000);

    expect(isExpired({ id: 1, exp: now - 1 })).toBe(true);
    expect(isExpired({ id: 1, exp: now + 60 })).toBe(false);
  });
});
