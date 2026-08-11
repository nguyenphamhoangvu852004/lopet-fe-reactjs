import type { RoleName } from "../types";

/**
 * Payload access token do backend ký (lopet-be/src/utils/jwt.util.ts):
 *   { id, email, roles, iat, exp }
 *
 * Phải đọc từ đây vì LoginOutputDTO chỉ trả về { id, accessToken, refreshToken }
 * — không có roles. Nếu không giải mã token thì `can()` luôn chỉ thấy baseline
 * và toàn bộ giao diện quản trị sẽ không bao giờ hiện ra với ADMIN.
 *
 * Đây thuần tuý là đọc dữ liệu để dựng UI, KHÔNG phải xác thực chữ ký: chữ ký
 * chỉ backend mới kiểm được, và mọi endpoint đều tự kiểm lại.
 */
export interface TokenPayload {
  id: number;
  email?: string;
  roles: RoleName[];
  exp?: number;
}

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const text = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  // atob trả chuỗi byte; qua escape/decodeURIComponent để không vỡ tiếng Việt
  return decodeURIComponent(
    text
      .split("")
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
}

export function decodeToken(token?: string | null): TokenPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const raw = JSON.parse(base64UrlDecode(parts[1])) as {
      id?: number;
      email?: string;
      roles?: unknown;
      exp?: number;
    };
    if (typeof raw.id !== "number") return null;
    return {
      id: raw.id,
      email: raw.email,
      roles: Array.isArray(raw.roles) ? (raw.roles as RoleName[]) : [],
      exp: raw.exp,
    };
  } catch {
    return null;
  }
}

/** Token hết hạn thì coi như chưa đăng nhập, khỏi chờ API trả 401 */
export function isExpired(payload: TokenPayload | null): boolean {
  if (!payload?.exp) return false;
  return payload.exp * 1000 <= Date.now();
}
