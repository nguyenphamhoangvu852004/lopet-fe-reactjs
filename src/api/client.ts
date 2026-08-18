import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { decodeToken, isExpired } from "../authz/token";

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
/** Thú cưng đang thao tác — xem ghi chú ở activePetId bên dưới */
export const ACTIVE_PET_KEY = "lopet:activePetId";

/**
 * Backend lấy PET làm chủ thể của mọi nội dung xã hội: bài viết, bình luận,
 * lượt thích và tư cách thành viên nhóm đều trỏ vào `pets.id`. Endpoint ghi vì
 * thế mang `@RequirePet` và đòi header `X-Pet-Id`; interceptor xác nhận con vật
 * đó thuộc tài khoản trong JWT rồi mới cho controller chạy.
 *
 * Giữ ở biến module thay vì đọc localStorage trong interceptor: `PetContext` là
 * nguồn sự thật của UI, và một request bay đi ngay sau khi người dùng đổi pet
 * phải mang giá trị MỚI chứ không phải giá trị đã kịp ghi xuống đĩa hay chưa.
 * localStorage chỉ dùng để khôi phục lựa chọn sau khi tải lại trang.
 *
 * Không import từ context vào đây: chiều phụ thuộc phải là context → client,
 * ngược lại sẽ thành vòng tròn (context dùng api, api dùng context).
 */
let activePetId: number | null = readStoredPetId();

function readStoredPetId(): number | null {
  const raw = localStorage.getItem(ACTIVE_PET_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getActivePetId() {
  return activePetId;
}

/** Gọi bởi PetProvider mỗi khi người dùng đổi thú cưng đang thao tác */
export function setActivePetId(petId: number | null) {
  activePetId = petId;
  if (petId) localStorage.setItem(ACTIVE_PET_KEY, String(petId));
  else localStorage.removeItem(ACTIVE_PET_KEY);
}

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
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
   * Gắn cho MỌI request thay vì chỉ các endpoint ghi. Với endpoint đọc, header
   * là tuỳ chọn và chỉ MỞ RỘNG phạm vi thấy được (bài do chính pet đó đăng, bài
   * trong nhóm mà pet đó là thành viên) — gửi thừa không hại gì, còn quên gửi
   * thì người dùng mất đúng phần nội dung của con vật mình đang chọn.
   *
   * Endpoint không mang @RequirePet cũng bỏ qua header này, nên không có nguy
   * cơ một route nào đó bất ngờ đổi hành vi vì nó xuất hiện.
   */
  if (activePetId) config.headers["X-Pet-Id"] = String(activePetId);
  return config;
});

/** Sự kiện phát ra khi phiên hết hạn để AuthContext dọn state, tránh reload cứng */
export const SESSION_EXPIRED = "lopet:session-expired";

/**
 * Phát mỗi khi cặp token được thay mới. Cần vì access token còn được dùng NGOÀI
 * axios: socket gửi nó một lần duy nhất trong handshake, nên nơi giữ kết nối
 * phải biết mà cập nhật, nếu không lần kết nối lại nào cũng cầm token đã chết.
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
});

/** Xoá sạch dấu vết phiên và báo cho AuthContext */
export function endSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  // Pet đang chọn thuộc về phiên vừa kết thúc — giữ lại thì người đăng nhập
  // sau sẽ gửi X-Pet-Id của người trước và nhận 403 khó hiểu.
  setActivePetId(null);
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED));
}

/**
 * Một lời gọi gia hạn đang bay. Bắt buộc phải gom chung: một màn hình mở ra
 * thường bắn 5-10 request cùng lúc, và nếu mỗi cái tự gọi /v1/auth/refresh thì
 * chúng đổi refresh token liên tiếp nhau — cái chạy sau ghi đè token của cái
 * chạy trước và phần còn lại của phiên cầm token đã bị xoay vòng qua mất.
 */
let pendingRefresh: Promise<string> | null = null;

/**
 * Đổi refresh token lấy cặp token mới. Backend xoay vòng cả hai (POST
 * /v1/auth/refresh) nên PHẢI ghi lại cả refreshToken, không chỉ accessToken.
 */
export function refreshSession(): Promise<string> {
  if (pendingRefresh) return pendingRefresh;

  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return Promise.reject(new Error("Chưa có refresh token"));

  pendingRefresh = refreshClient
    .post("/v1/auth/refresh", { refreshToken })
    .then((res) => {
      const data = (res.data as { data?: { accessToken?: string; refreshToken?: string } })
        ?.data;
      if (!data?.accessToken || !data?.refreshToken) {
        throw new Error("Phản hồi gia hạn thiếu token");
      }
      localStorage.setItem(TOKEN_KEY, data.accessToken);
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
      window.dispatchEvent(new CustomEvent(SESSION_REFRESHED));
      return data.accessToken;
    })
    .finally(() => {
      pendingRefresh = null;
    });

  return pendingRefresh;
}

/**
 * Gia hạn nếu access token đã hết hạn (hoặc không còn) mà refresh token vẫn
 * còn. Gọi được thoải mái: không có gì để làm thì trả về ngay.
 *
 * Dùng ở hai chỗ — trước mỗi request, và lúc AuthProvider khởi động (mở lại tab
 * sau một giờ thì access token đã chết nhưng phiên thì chưa).
 */
export async function ensureFreshSession(): Promise<void> {
  const stored = localStorage.getItem(TOKEN_KEY);
  const payload = decodeToken(stored);

  if (payload && !isExpired(payload)) return;
  /**
   * Có token nhưng không giải mã được thì ĐỂ SERVER phán, đừng tự gia hạn: nếu
   * không, một access token dạng lạ sẽ khiến mọi request kế tiếp kéo theo một
   * lời gọi /v1/auth/refresh, và cặp token mới cũng không giải mã được — vòng
   * lặp không có điểm dừng. Đường phản ứng theo mã lỗi ở dưới xử lý ca này.
   */
  if (stored && !payload) return;
  if (!localStorage.getItem(REFRESH_KEY)) return;

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

/**
 * Lỗi phát sinh vì tài khoản CHƯA CÓ thú cưng nào, hoặc chưa chọn con nào để
 * thao tác. Backend trả 403 kèm hướng dẫn tạo pet (NoPetOwnedException) và 400
 * khi thiếu header (MissingPetHeaderException) — hai mã khác nhau nhưng với
 * giao diện thì cùng một việc: mời người dùng tạo/chọn thú cưng.
 */
export function isPetContextError(error: unknown) {
  const err = error as AxiosError<{ message?: string }>;
  const status = err?.response?.status;
  if (status !== 400 && status !== 403) return false;
  const message = err.response?.data?.message ?? "";
  return /pet|thú cưng|X-Pet-Id/i.test(message);
}
