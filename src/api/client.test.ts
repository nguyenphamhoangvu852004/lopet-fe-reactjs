import type {
  AxiosAdapter,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_PET_KEY,
  api,
  errorMessage,
  isForbidden,
  REFRESH_KEY,
  refreshClient,
  SESSION_EXPIRED,
  TOKEN_KEY,
  unwrap,
  USER_KEY,
} from "./client";

const realAdapter = api.defaults.adapter;
const realRefreshAdapter = refreshClient.defaults.adapter;

/**
 * Token thật để `decodeToken` đọc được `exp`: interceptor request gia hạn TRƯỚC
 * khi gửi nếu access token đã hết hạn, nên một chuỗi giả bừa sẽ kéo mọi test
 * vào nhánh gia hạn.
 */
function makeToken(secondsFromNow: number, id = 1) {
  const body = btoa(
    JSON.stringify({
      id,
      email: "u@lopet.local",
      roles: [],
      exp: Math.floor(Date.now() / 1000) + secondsFromNow,
    }),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${body}.signature`;
}

const VALID_TOKEN = makeToken(3600);
const EXPIRED_TOKEN = makeToken(-10);

/** Chặn axios ở tầng adapter để không đụng mạng nhưng vẫn chạy qua interceptor */
function stubAdapter(adapter: AxiosAdapter) {
  api.defaults.adapter = adapter;
}

function ok(config: InternalAxiosRequestConfig): AxiosResponse {
  return {
    data: {},
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  };
}

afterEach(() => {
  api.defaults.adapter = realAdapter;
  refreshClient.defaults.adapter = realRefreshAdapter;
});

/** Giả lập POST /v1/auth/refresh trả về cặp token mới; trả về danh sách lời gọi */
function stubRefresh(accessToken: string, refreshToken = "refresh-moi") {
  const calls: InternalAxiosRequestConfig[] = [];
  refreshClient.defaults.adapter = async (config) => {
    calls.push(config);
    return {
      ...ok(config),
      data: {
        statusCode: 200,
        message: "OK",
        data: { id: 1, accessToken, refreshToken },
      },
    };
  };
  return calls;
}

/** Lỗi axios đúng hình dạng mà interceptor đọc */
function httpError(
  config: InternalAxiosRequestConfig,
  status: number,
  message?: string,
) {
  return Object.assign(new Error(message ?? String(status)), {
    isAxiosError: true,
    config,
    response: {
      ...ok(config),
      status,
      data: message ? { statusCode: status, message } : {},
    },
  });
}

describe("interceptor request", () => {
  it("gắn Bearer token khi localStorage có accessToken", async () => {
    localStorage.setItem(TOKEN_KEY, VALID_TOKEN);
    let sent: InternalAxiosRequestConfig | undefined;
    stubAdapter(async (config) => {
      sent = config;
      return ok(config);
    });

    await api.get("/posts");
    expect(sent?.headers.Authorization).toBe(`Bearer ${VALID_TOKEN}`);
  });

  it("không gắn header khi chưa đăng nhập", async () => {
    let sent: InternalAxiosRequestConfig | undefined;
    stubAdapter(async (config) => {
      sent = config;
      return ok(config);
    });

    await api.get("/posts");
    expect(sent?.headers.Authorization).toBeUndefined();
  });
});

describe("interceptor response", () => {
  it("401 mà không còn refresh token thì xoá phiên và phát sự kiện", async () => {
    localStorage.setItem(TOKEN_KEY, VALID_TOKEN);
    localStorage.setItem(USER_KEY, '{"id":1}');
    localStorage.setItem(ACTIVE_PET_KEY, "3");

    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED, onExpired);

    stubAdapter(async (config) => {
      throw httpError(config, 401);
    });

    await expect(api.get("/me")).rejects.toThrow("401");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    // Pet phải đi theo phiên, nếu không người đăng nhập sau gửi X-Pet-Id của người trước
    expect(localStorage.getItem(ACTIVE_PET_KEY)).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);

    window.removeEventListener(SESSION_EXPIRED, onExpired);
  });

  it("403 là thiếu quyền nên KHÔNG được đăng xuất", async () => {
    localStorage.setItem(TOKEN_KEY, VALID_TOKEN);
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED, onExpired);

    stubAdapter(async (config) => {
      throw Object.assign(new Error("Forbidden"), {
        isAxiosError: true,
        config,
        response: { ...ok(config), status: 403 },
      });
    });

    await expect(api.delete("/posts/1")).rejects.toThrow("Forbidden");
    expect(localStorage.getItem(TOKEN_KEY)).toBe(VALID_TOKEN);
    expect(onExpired).not.toHaveBeenCalled();

    window.removeEventListener(SESSION_EXPIRED, onExpired);
  });
});

describe("gia hạn phiên", () => {
  it("401 giữa phiên thì gia hạn rồi gửi lại chính request đó", async () => {
    localStorage.setItem(TOKEN_KEY, VALID_TOKEN);
    localStorage.setItem(REFRESH_KEY, "refresh-cu");
    const refreshCalls = stubRefresh("access-moi");

    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED, onExpired);

    const sent: string[] = [];
    stubAdapter(async (config) => {
      sent.push(String(config.headers.Authorization));
      if (sent.length === 1) throw httpError(config, 401);
      return ok(config);
    });

    await expect(api.get("/me")).resolves.toBeTruthy();

    expect(refreshCalls).toHaveLength(1);
    expect(String(refreshCalls[0].data)).toContain("refresh-cu");
    // Lần gửi lại phải mang token MỚI, không phải token vừa bị từ chối
    expect(sent).toEqual([`Bearer ${VALID_TOKEN}`, "Bearer access-moi"]);
    // Backend xoay vòng cả hai token — quên ghi refresh token mới là phiên chết ở lần sau
    expect(localStorage.getItem(TOKEN_KEY)).toBe("access-moi");
    expect(localStorage.getItem(REFRESH_KEY)).toBe("refresh-moi");
    expect(onExpired).not.toHaveBeenCalled();

    window.removeEventListener(SESSION_EXPIRED, onExpired);
  });

  /**
   * Route mang @Auth(required=true) KHÔNG chuẩn hoá lỗi token về 401: message thô
   * của jsonwebtoken lọt ra ngoài kèm mã 500. Chỉ bắt 401 là bỏ sót đúng trường
   * hợp phổ biến nhất — access token hết hạn giữa phiên.
   */
  it("500 kèm message 'jwt expired' cũng được coi là token hỏng", async () => {
    localStorage.setItem(TOKEN_KEY, VALID_TOKEN);
    localStorage.setItem(REFRESH_KEY, "refresh-cu");
    stubRefresh("access-moi");

    let calls = 0;
    stubAdapter(async (config) => {
      calls += 1;
      if (calls === 1) throw httpError(config, 500, "jwt expired");
      return ok(config);
    });

    await expect(api.get("/posts")).resolves.toBeTruthy();
    expect(calls).toBe(2);
  });

  it("500 vì lỗi server thật thì KHÔNG gia hạn", async () => {
    localStorage.setItem(TOKEN_KEY, VALID_TOKEN);
    localStorage.setItem(REFRESH_KEY, "refresh-cu");
    const refreshCalls = stubRefresh("access-moi");

    stubAdapter(async (config) => {
      throw httpError(config, 500, "Cannot read properties of undefined");
    });

    await expect(api.get("/posts")).rejects.toThrow();
    expect(refreshCalls).toHaveLength(0);
  });

  it("nhiều request cùng dính 401 chỉ gọi refresh MỘT lần", async () => {
    localStorage.setItem(TOKEN_KEY, VALID_TOKEN);
    localStorage.setItem(REFRESH_KEY, "refresh-cu");
    const refreshCalls = stubRefresh("access-moi");

    const rejected = new Set<string>();
    stubAdapter(async (config) => {
      const url = String(config.url);
      if (!rejected.has(url)) {
        rejected.add(url);
        throw httpError(config, 401);
      }
      return ok(config);
    });

    await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);

    // Mỗi request tự gọi refresh thì token bị xoay vòng ba lần liên tiếp và hai
    // request cuối cầm refresh token đã chết.
    expect(refreshCalls).toHaveLength(1);
  });

  it("gia hạn thất bại thì kết thúc phiên và ném lỗi GỐC", async () => {
    localStorage.setItem(TOKEN_KEY, VALID_TOKEN);
    localStorage.setItem(REFRESH_KEY, "refresh-het-han");
    refreshClient.defaults.adapter = async (config) => {
      throw httpError(config, 401, "Refresh token đã hết hạn");
    };

    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED, onExpired);

    stubAdapter(async (config) => {
      throw httpError(config, 401, "Không tìm thấy bài viết");
    });

    await expect(api.get("/me")).rejects.toThrow("Không tìm thấy bài viết");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);

    window.removeEventListener(SESSION_EXPIRED, onExpired);
  });

  it("token mới vẫn bị từ chối thì dừng lại, không lặp vô hạn", async () => {
    localStorage.setItem(TOKEN_KEY, VALID_TOKEN);
    localStorage.setItem(REFRESH_KEY, "refresh-cu");
    stubRefresh("access-moi");

    let calls = 0;
    stubAdapter(async (config) => {
      calls += 1;
      throw httpError(config, 401);
    });

    await expect(api.get("/me")).rejects.toThrow();
    expect(calls).toBe(2);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("access token hết hạn thì gia hạn TRƯỚC khi gửi request", async () => {
    localStorage.setItem(TOKEN_KEY, EXPIRED_TOKEN);
    localStorage.setItem(REFRESH_KEY, "refresh-cu");
    const refreshCalls = stubRefresh("access-moi");

    let sent: InternalAxiosRequestConfig | undefined;
    stubAdapter(async (config) => {
      sent = config;
      return ok(config);
    });

    await api.get("/me");

    expect(refreshCalls).toHaveLength(1);
    // Request chỉ bay đi MỘT lần, với token còn hạn — không có vòng 500 vô ích
    expect(sent?.headers.Authorization).toBe("Bearer access-moi");
  });

  it("chưa đăng nhập thì không gọi refresh", async () => {
    const refreshCalls = stubRefresh("access-moi");
    stubAdapter(async (config) => ok(config));

    await api.get("/posts");
    expect(refreshCalls).toHaveLength(0);
  });
});

describe("unwrap", () => {
  it("bóc hai lớp data của backend", () => {
    expect(
      unwrap<{ id: number }>({ data: { statusCode: 200, data: { id: 9 } } }),
    ).toEqual({ id: 9 });
  });

  it("payload rỗng thì trả undefined thay vì ném lỗi", () => {
    expect(unwrap(undefined)).toBeUndefined();
    expect(unwrap({})).toBeUndefined();
  });
});

describe("errorMessage", () => {
  it("ưu tiên danh sách lỗi validate của Joi", () => {
    const error = {
      response: {
        data: {
          message: "Validation error",
          errors: [
            { field: "email", message: "Email không hợp lệ" },
            { field: "password", message: "Mật khẩu quá ngắn" },
          ],
        },
      },
    };
    expect(errorMessage(error)).toBe("Email không hợp lệ; Mật khẩu quá ngắn");
  });

  it("dùng field khi lỗi validate thiếu message", () => {
    const error = { response: { data: { errors: [{ field: "email" }] } } };
    expect(errorMessage(error)).toBe("email");
  });

  it("lấy message của body khi không phải lỗi validate", () => {
    const error = { response: { data: { message: "Không tìm thấy bài viết" } } };
    expect(errorMessage(error)).toBe("Không tìm thấy bài viết");
  });

  it("rơi về message của axios rồi mới tới fallback", () => {
    expect(errorMessage(new Error("Network Error"))).toBe("Network Error");
    expect(errorMessage(null)).toBe("Đã có lỗi xảy ra");
    expect(errorMessage(null, "Thử lại sau")).toBe("Thử lại sau");
  });
});

describe("isForbidden", () => {
  it("chỉ đúng với status 403", () => {
    expect(isForbidden({ response: { status: 403 } })).toBe(true);
    expect(isForbidden({ response: { status: 401 } })).toBe(false);
    expect(isForbidden(new Error("boom"))).toBe(false);
    expect(isForbidden(undefined)).toBe(false);
  });
});
