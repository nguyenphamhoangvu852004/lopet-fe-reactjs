import type {
  AxiosAdapter,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  errorMessage,
  isForbidden,
  REFRESH_KEY,
  SESSION_EXPIRED,
  TOKEN_KEY,
  unwrap,
  USER_KEY,
} from "./client";

const realAdapter = api.defaults.adapter;

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
});

describe("interceptor request", () => {
  it("gắn Bearer token khi localStorage có accessToken", async () => {
    localStorage.setItem(TOKEN_KEY, "abc123");
    let sent: InternalAxiosRequestConfig | undefined;
    stubAdapter(async (config) => {
      sent = config;
      return ok(config);
    });

    await api.get("/posts");
    expect(sent?.headers.Authorization).toBe("Bearer abc123");
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
  it("401 thì xoá phiên và phát sự kiện session-expired", async () => {
    localStorage.setItem(TOKEN_KEY, "abc123");
    localStorage.setItem(REFRESH_KEY, "refresh");
    localStorage.setItem(USER_KEY, '{"id":1}');

    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED, onExpired);

    stubAdapter(async (config) => {
      throw Object.assign(new Error("Unauthorized"), {
        isAxiosError: true,
        config,
        response: { ...ok(config), status: 401 },
      });
    });

    await expect(api.get("/me")).rejects.toThrow("Unauthorized");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);

    window.removeEventListener(SESSION_EXPIRED, onExpired);
  });

  it("403 là thiếu quyền nên KHÔNG được đăng xuất", async () => {
    localStorage.setItem(TOKEN_KEY, "abc123");
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
    expect(localStorage.getItem(TOKEN_KEY)).toBe("abc123");
    expect(onExpired).not.toHaveBeenCalled();

    window.removeEventListener(SESSION_EXPIRED, onExpired);
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
