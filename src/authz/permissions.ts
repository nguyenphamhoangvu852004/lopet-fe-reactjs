import type { RoleName } from "../types";

/**
 * Bản sao danh mục quyền của backend (lopet-be/src/authz/permission.catalog.ts).
 *
 * Dùng để ẩn/hiện UI cho đúng. Đây KHÔNG phải lớp bảo mật — backend mới là nơi
 * quyết định; ẩn nút chỉ để người dùng khỏi bấm vào thứ chắc chắn nhận 403.
 * Khi backend đổi danh mục, phải cập nhật file này cho khớp.
 */

/** Quyền của MỌI tài khoản đã đăng nhập (không cần role nào) */
export const BASELINE_PERMISSIONS = [
  "post:create",
  "post:update:own",
  "post:delete:own",
  "comment:create",
  "comment:delete:own",
  "group:create",
  "group:update:own",
  "group:delete:own",
  "report:create",
  "profile:update:own",
  "pet:create",
  "pet:update:own",
  "pet:delete:own",
  "friendship:manage:own",
  "advertiser:register",
  "ads:create",
  "ads:update:own",
  "ads:delete:own",
] as const;

export const WILDCARD = "*";

export const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  ADMIN: [WILDCARD],
  MODERATOR: [
    "report:read",
    "report:resolve",
    "post:delete",
    "group:delete",
    "account:ban",
    "ads:review",
    "advertiser:read",
  ],
  SUPPORT: ["account:read", "report:read", "advertiser:read"],
};

export function resolvePermissions(roles: RoleName[] = []): Set<string> {
  const granted = new Set<string>(BASELINE_PERMISSIONS);
  for (const role of roles) {
    for (const code of ROLE_PERMISSIONS[role] ?? []) granted.add(code);
  }
  return granted;
}

export function hasPermission(granted: Set<string>, required: string): boolean {
  if (granted.has(WILDCARD)) return true;
  if (granted.has(required)) return true;
  return granted.has(`${required.split(":")[0]}:*`);
}
