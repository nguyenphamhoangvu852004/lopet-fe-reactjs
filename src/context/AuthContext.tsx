import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  REFRESH_KEY,
  SESSION_EXPIRED,
  TOKEN_KEY,
  USER_KEY,
} from "../api/client";
import { accountApi, authApi } from "../api/endpoints";
import { hasPermission, resolvePermissions } from "../authz/permissions";
import { decodeToken, isExpired } from "../authz/token";
import type { AuthUser } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Kiểm quyền để ẩn/hiện UI — backend vẫn là nơi quyết định thật */
  can: (permission: string) => boolean;
  isStaff: boolean;
  /** Nạp lại hồ sơ sau khi người dùng tạo/sửa profile */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  // Token là nguồn sự thật cho id và roles; bản lưu trong localStorage chỉ bổ
  // sung thứ token không có (username, ảnh, profileId).
  const payload = decodeToken(localStorage.getItem(TOKEN_KEY));
  if (!payload || isExpired(payload)) return null;

  let cached: Partial<AuthUser> = {};
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) cached = JSON.parse(raw) as Partial<AuthUser>;
  } catch {
    cached = {};
  }

  return {
    id: payload.id,
    username: cached.username ?? payload.email ?? `#${payload.id}`,
    email: payload.email,
    roles: payload.roles,
    profileId: cached.profileId ?? null,
    avatarUrl: cached.avatarUrl ?? null,
  };
}

function persist(user: AuthUser) {
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      username: user.username,
      profileId: user.profileId ?? null,
      avatarUrl: user.avatarUrl ?? null,
    }),
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);
  const [ready, setReady] = useState(false);

  /** Bổ sung username / profileId từ API — JWT không mang những thông tin này */
  const hydrate = useCallback(async (base: AuthUser) => {
    try {
      const account = await accountApi.detail(base.id);
      const next: AuthUser = {
        ...base,
        username: account.username,
        email: account.email ?? base.email,
        // Role trong DB là bản mới nhất; token có thể đã cũ hơn một lần cấp quyền
        roles: account.roles?.length ? account.roles : base.roles,
        profileId: account.profile?.id ?? null,
        avatarUrl: account.profile?.avatarUrl ?? null,
      };
      persist(next);
      setUser(next);
    } catch {
      // Mạng lỗi thì vẫn dùng được bản từ token, không đá người dùng ra ngoài
      setUser(base);
    }
  }, []);

  useEffect(() => {
    const stored = readStoredUser();
    if (stored) {
      hydrate(stored).finally(() => setReady(true));
    } else {
      setReady(true);
    }

    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired);
  }, [hydrate]);

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await authApi.login(username, password);
      localStorage.setItem(TOKEN_KEY, data.accessToken);
      localStorage.setItem(REFRESH_KEY, data.refreshToken);

      const payload = decodeToken(data.accessToken);
      const base: AuthUser = {
        id: payload?.id ?? data.id,
        username,
        email: payload?.email,
        roles: payload?.roles ?? [],
      };
      persist(base);
      setUser(base);
      await hydrate(base);
    },
    [hydrate],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (user) await hydrate(user);
  }, [user, hydrate]);

  const value = useMemo<AuthContextValue>(() => {
    const granted = resolvePermissions(user?.roles ?? []);
    return {
      user,
      ready,
      login,
      logout,
      refresh,
      can: (permission: string) =>
        Boolean(user) && hasPermission(granted, permission),
      isStaff: (user?.roles?.length ?? 0) > 0,
    };
  }, [user, ready, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải nằm trong <AuthProvider>");
  return ctx;
}
