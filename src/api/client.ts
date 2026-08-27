import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { decodeToken, isExpired } from "../authz/token";

export const BASE_URL =
  import.meta.env.VITE_BACKEND_API ?? "http://localhost:8080";

/**
 * Realtime là STOMP over WebSocket trên CHÍNH cổng REST (backend endpoint
 * `/ws`), nên URL suy ra thẳng từ BASE_URL: http → ws, https → wss. Bản trước
 * dùng netty-socketio ở cổng riêng 8081 và cần một biến môi trường thứ hai —
 * biến đó đã bỏ, chỉ còn VITE_WS_URL làm đường ghi đè khi proxy đặt `/ws` ở
 * host khác.
 */
export const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `${BASE_URL.replace(/\/+$/, "").replace(/^http/, "ws")}/ws`;

export const TOKEN_KEY = "accessToken";
export const USER_KEY = "user";

/**
 * Refresh token KHÔNG còn nằm trong localStorage: backend trả nó bằng cookie
 * `HttpOnly` (xem RefreshTokenCookie phía Spring), nên JavaScript không đọc,
 * không ghi và không gửi nó đi được nữa. Chìa khoá duy nhất mà XSS lấy được từ
 * localStorage giờ là access token sống 1 giờ, thay vì thứ gia hạn được phiên
 * suốt 10 giờ.
 *
 * Hệ quả với code phía dưới: mọi câu hỏi kiểu "còn refresh token không?" đều
 * không trả lời được ở client. Chỗ thay thế là sự tồn tại của access token —
 * có token (dù đã hết hạn) nghĩa là đã từng đăng nhập, và đó là điều kiện duy
 * nhất để thử gia hạn.
 */
const LEGACY_REFRESH_KEY = "refreshToken";
// Dọn token của bản cũ ngay khi module nạp: người dùng đang có phiên từ bản
// trước vẫn còn một refresh token nằm trong localStorage, và nó vô dụng với
// backend mới. Để lại chỉ là một bí mật nằm phơi không ai dùng.
localStorage.removeItem(LEGACY_REFRESH_KEY);

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  /**
   * BẮT BUỘC: cookie refresh token chỉ được trình duyệt lưu (lúc đăng nhập) và
   * gửi kèm (lúc gia hạn) khi request khai `credentials: 'include'`. Thiếu cờ
   * này thì đăng nhập vẫn chạy nhưng phiên chết cứng sau 1 giờ.
   *
   * Kèm theo: backend phải khai `DOMAIN_CORS` là origin cụ thể của FE — bên đó
   * chỉ bật `allowCredentials` khi danh sách origin không phải `*`.
   */
  withCredentials: true,
});

api.interceptors.request.use(async (config) => {
  /**
   * Gia hạn TRƯỚC khi gửi khi biết chắc access token đã hết hạn, thay vì chờ
   * server từ chối: trên route mang @Auth(required=true) backend trả 500 kèm
   * message thô "jwt expired" (xem isSessionError bên dưới), nên để request bay
   * đi là đổi lấy một lỗi 500 nằm trong log và một vòng đi-về vô ích.
   */
  await ensureFreshSession();

  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;

  /**
   * Không còn header danh tính nào ngoài `Authorization`. Danh tính người gọi —
   * cả "là ai" lẫn "hành động nhân danh ai" — đến duy nhất từ token đã ký; mọi
   * thứ client tự khai đều không được backend tin.
   */
  return config;
});

/** Sự kiện phát ra khi phiên hết hạn để AuthContext dọn state, tránh reload cứng */
export const SESSION_EXPIRED = "lopet:session-expired";

/**
 * Phát mỗi khi cặp token được thay mới. Cần vì access token còn được dùng NGOÀI
 * axios: WebSocket gửi nó một lần duy nhất trong frame CONNECT, nên nơi giữ kết
 * nối phải biết mà cập nhật, nếu không lần kết nối lại nào cũng cầm token đã chết.
 */
export const SESSION_REFRESHED = "lopet:session-refreshed";

/**
 * Client RIÊNG cho lời gọi gia hạn, cố ý không mang interceptor nào: nếu dùng
 * `api` thì một refresh token hỏng sẽ nhận 401 và rơi lại vào chính interceptor
 * response ở dưới — vòng lặp vô tận.
 *
 * Export để test thay adapter; code ứng dụng không nên gọi trực tiếp.
 */
export const refreshClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  // Cookie refresh token là TOÀN BỘ dữ liệu đầu vào của lời gọi này
  withCredentials: true,
});

/**
 * Xoá sạch dấu vết phiên và báo cho AuthContext.
 *
 * Cookie refresh token thì client KHÔNG xoá được (`HttpOnly`), nên nó nằm lại
 * tới khi hết hạn. Không sao: mọi đường dùng tới nó đều đi qua access token đã
 * bị xoá ở đây, và backend vẫn kiểm tài khoản từ DB ở mỗi lần gia hạn. Muốn xoá
 * thật thì cần một endpoint logout phía backend (`RefreshTokenCookie.clear`).
 */
export function endSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED));
}

/**
 * Ghi lại access token vừa nhận. Dùng ở màn hình đăng nhập — sau lời gọi này
 * client coi như "đã có phiên", kể cả khi access token hết hạn sau đó.
 */
export function startSession(accessToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken);
}

/**
 * Một lời gọi gia hạn đang bay. Bắt buộc phải gom chung: một màn hình mở ra
 * thường bắn 5-10 request cùng lúc, và nếu mỗi cái tự gọi /v1/auth/refresh thì
 * chúng đổi refresh token liên tiếp nhau — cái chạy sau ghi đè token của cái
 * chạy trước và phần còn lại của phiên cầm token đã bị xoay vòng qua mất.
 */
let pendingRefresh: Promise<string> | null = null;

/**
 * Xin access token mới. KHÔNG có body: refresh token đi kèm dưới dạng cookie,
 * và backend xoay vòng nó bằng một `Set-Cookie` khác trong chính phản hồi này —
 * client không thấy, cũng không cần thấy.
 *
 * Điều kiện duy nhất kiểm được ở đây là "đã từng đăng nhập". Không có access
 * token thì không gọi: một khách vãng lai gặp 401 ở route công khai sẽ kéo theo
 * một lời gọi gia hạn chắc chắn hỏng, và kết thúc bằng sự kiện SESSION_EXPIRED
 * cho một phiên chưa từng tồn tại.
 */
export function refreshSession(): Promise<string> {
  if (pendingRefresh) return pendingRefresh;

  if (!localStorage.getItem(TOKEN_KEY)) {
    return Promise.reject(new Error("Chưa đăng nhập"));
  }

  pendingRefresh = refreshClient
    .post("/v1/auth/refresh")
    .then((res) => {
      const data = (res.data as { data?: { accessToken?: string } })?.data;
      if (!data?.accessToken) {
        throw new Error("Phản hồi gia hạn thiếu access token");
      }
      localStorage.setItem(TOKEN_KEY, data.accessToken);
      window.dispatchEvent(new CustomEvent(SESSION_REFRESHED));
      return data.accessToken;
    })
    .finally(() => {
      pendingRefresh = null;
    });

  return pendingRefresh;
}

/**
 * Gia hạn nếu access token đã hết hạn (hoặc không còn). Gọi được thoải mái:
 * không có gì để làm thì trả về ngay.
 *
 * Dùng ở hai chỗ — trước mỗi request, và lúc AuthProvider khởi động (mở lại tab
 * sau một giờ thì access token đã chết nhưng cookie refresh token thì chưa).
 */
export async function ensureFreshSession(): Promise<void> {
  const stored = localStorage.getItem(TOKEN_KEY);
  // Chưa từng đăng nhập trên máy này: không có gì để gia hạn, và cũng không có
  // cách nào biết cookie còn sống hay không vì nó là HttpOnly.
  if (!stored) return;

  const payload = decodeToken(stored);
  if (payload && !isExpired(payload)) return;
  /**
   * Có token nhưng không giải mã được thì ĐỂ SERVER phán, đừng tự gia hạn: nếu
   * không, một access token dạng lạ sẽ khiến mọi request kế tiếp kéo theo một
   * lời gọi /v1/auth/refresh, và cặp token mới cũng không giải mã được — vòng
   * lặp không có điểm dừng. Đường phản ứng theo mã lỗi ở dưới xử lý ca này.
   */
  if (!payload) return;

  try {
    await refreshSession();
  } catch {
    endSession();
  }
}

/**
 * Ba message thô của jsonwebtoken. Backend Spring giữ nguyên hành vi của bản
 * TypeScript: trên route dùng verifyToken() lỗi token KHÔNG được chuẩn hoá về
 * 401 mà lọt ra ngoài thành 500 + message thô (RawJwtException). Chỉ bắt 401 là
 * bỏ sót đúng trường hợp phổ biến nhất — access token hết hạn giữa phiên.
 */
const JWT_ERRORS = ["jwt expired", "invalid signature", "jwt malformed"];

/** Lỗi có thể chữa được bằng một access token mới */
function isSessionError(error: AxiosError<{ message?: string }>): boolean {
  const status = error.response?.status;
  const message = error.response?.data?.message ?? "";

  // optionalAuth() chuẩn hoá về 401
  if (status === 401) return true;
  // verifyToken() để lỗi thô lọt ra 500
  if (status === 500) return JWT_ERRORS.includes(message);
  // Không gửi header Authorization: gia hạn xong là gửi được
  if (status === 400) return message === "Token not found";
  return false;
}

/** Đánh dấu request đã thử lại một lần, tránh lặp vô hạn khi token mới cũng bị từ chối */
type RetriedConfig = InternalAxiosRequestConfig & { retriedAfterRefresh?: boolean };

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ message?: string }>) => {
    // 403 mang nghĩa "thiếu quyền" chứ không phải "token hỏng" — không đụng tới phiên.
    const config = error.config as RetriedConfig | undefined;
    if (!config || !isSessionError(error)) return Promise.reject(error);

    /**
     * Chưa đăng nhập thì 401 là câu trả lời đúng của server, không phải phiên
     * hỏng. Bỏ chốt này thì khách vãng lai chạm một route cần đăng nhập sẽ kéo
     * theo một lời gọi gia hạn chắc chắn hỏng và một sự kiện SESSION_EXPIRED
     * cho phiên chưa từng tồn tại — màn hình chớp về trang đăng nhập vô cớ.
     */
    if (!localStorage.getItem(TOKEN_KEY)) return Promise.reject(error);

    if (config.retriedAfterRefresh) {
      // Token vừa cấp mà vẫn bị từ chối: hết cách, phiên coi như chấm dứt.
      endSession();
      return Promise.reject(error);
    }

    config.retriedAfterRefresh = true;
    try {
      const accessToken = await refreshSession();
      config.headers.Authorization = `Bearer ${accessToken}`;
      return await api(config);
    } catch {
      endSession();
      // Ném lỗi GỐC chứ không phải lỗi của lời gọi gia hạn: nơi gọi đang chờ
      // biết request của họ hỏng vì gì, không phải vì cơ chế nền nào.
      return Promise.reject(error);
    }
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

