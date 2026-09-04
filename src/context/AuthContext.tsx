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
  endSession,
  ensureFreshSession,
  SESSION_EXPIRED,
  startSession,
  TOKEN_KEY,
  USER_KEY,
} from "../api/client";
import { accountApi, authApi } from "../api/endpoints";
import { decodeToken, isExpired } from "../authz/token";
import type { AuthUser } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Nạp lại hồ sơ sau khi người dùng tạo/sửa profile */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  // Token là nguồn sự thật cho id; bản lưu trong localStorage chỉ bổ sung thứ
  // token không có (username, ảnh, profileId).
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

  /**
   * Access token chỉ sống 1 giờ, nên mở lại tab sau một buổi là readStoredUser()
   * trả về null dù phiên vẫn còn hạn (cookie refresh token sống 10 giờ). Phải gia hạn
   * TRƯỚC rồi mới đọc, nếu không người dùng bị đá ra đăng nhập lại một cách vô
   * cớ — đúng thứ mà cơ chế refresh sinh ra để tránh.
   */
  useEffect(() => {
    let cancelled = false;

    ensureFreshSession().finally(() => {
      if (cancelled) return;
      const stored = readStoredUser();
      if (stored) {
        setUser(stored);
        hydrate(stored).finally(() => setReady(true));
      } else {
        setUser(null);
        setReady(true);
      }
    });

    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_EXPIRED, onExpired);
    };
  }, [hydrate]);

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await authApi.login(username, password);
      // Chỉ còn access token để lưu; refresh token đã nằm trong cookie HttpOnly
      // mà trình duyệt tự giữ từ phản hồi của chính lời gọi này.
      startSession(data.accessToken);

      const payload = decodeToken(data.accessToken);
      const base: AuthUser = {
        id: payload?.id ?? data.id,
        username,
        email: payload?.email,
      };
      persist(base);
      setUser(base);
      await hydrate(base);
    },
    [hydrate],
  );

  /**
   * Dùng chung endSession() với interceptor để đăng xuất thủ công và phiên hết
   * hạn dọn đúng MỘT bộ trạng thái. Hai đường dọn riêng thì sớm muộn cũng lệch
   * nhau, và dấu vết còn sót lại của phiên trước là thứ người đăng nhập kế tiếp
   * phải chịu.
   */
  const logout = useCallback(() => {
    endSession();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (user) await hydrate(user);
  }, [user, hydrate]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, ready, login, logout, refresh }),
    [user, ready, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải nằm trong <AuthProvider>");
  return ctx;
}
