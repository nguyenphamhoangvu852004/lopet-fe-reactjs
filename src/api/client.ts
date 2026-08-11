import axios, { AxiosError } from "axios";

export const BASE_URL =
  import.meta.env.VITE_BACKEND_API ?? "http://localhost:8080";

/**
 * Socket.IO của backend Spring Boot nghe cổng riêng (netty-socketio, mặc định
 * 8081) vì Tomcat đã chiếm cổng REST — không dùng chung BASE_URL được.
 * Đặt VITE_SOCKET_URL khi deploy sau reverse proxy định tuyến /socket.io/.
 */
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ?? "http://localhost:8081";

export const TOKEN_KEY = "accessToken";
export const REFRESH_KEY = "refreshToken";
export const USER_KEY = "user";

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Sự kiện phát ra khi phiên hết hạn để AuthContext dọn state, tránh reload cứng */
export const SESSION_EXPIRED = "lopet:session-expired";

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const status = error.response?.status;
    // 403 giờ mang nghĩa "thiếu quyền" chứ không còn là "token hỏng" như bản Vue cũ,
    // nên chỉ 400/401 mới coi là phiên hết hạn và đá về trang đăng nhập.
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED));
    }
    return Promise.reject(error);
  },
);

/** Backend luôn bọc response trong { statusCode, message, data } */
export function unwrap<T>(payload: unknown): T {
  const body = payload as { data?: { data?: T } };
  return body?.data?.data as T;
}

/**
 * Backend trả hai hình dạng lỗi khác nhau:
 *   - lỗi thường:    { statusCode, message, data }
 *   - lỗi Joi:       { statusCode, message: 'Validation error', errors: [{field, message}] }
 * Không đọc `errors` thì mọi lỗi nhập liệu đều hiện chung một câu vô nghĩa.
 */
export function errorMessage(error: unknown, fallback = "Đã có lỗi xảy ra") {
  const err = error as AxiosError<{
    message?: string;
    errors?: { field?: string; message?: string }[];
  }>;
  const body = err?.response?.data;

  if (body?.errors?.length) {
    return body.errors
      .map((detail) => detail.message ?? detail.field)
      .filter(Boolean)
      .join("; ");
  }
  return body?.message ?? err?.message ?? fallback;
}

/** Trả về true nếu lỗi là do thiếu quyền (không phải do phiên hỏng) */
export function isForbidden(error: unknown) {
  return (error as AxiosError)?.response?.status === 403;
}
