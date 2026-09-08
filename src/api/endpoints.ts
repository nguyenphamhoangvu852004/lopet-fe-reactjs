import { api, unwrap } from "./client";
import type {
  Account,
  Comment,
  CursorPage,
  OffsetPage,
  Post,
  Profile,
  PublicProfile,
} from "../types";

/* ─────────────────────────── auth ─────────────────────────── */

export const authApi = {
  /**
   * Chỉ trả { id, accessToken }.
   *
   * Refresh token KHÔNG có trong body: backend gửi kèm `Set-Cookie` với cờ
   * `HttpOnly`, và trình duyệt chỉ nhận cookie đó vì `api` khai
   * `withCredentials: true`. Đừng thêm lại trường refreshToken ở đây — nó sẽ
   * luôn `undefined`.
   */
  login: (username: string, password: string) =>
    api.post("/v1/auth/login", { username, password }).then(
      (r) =>
        r.data.data as {
          id: number;
          accessToken: string;
        },
    ),

  signup: (body: {
    email: string;
    username: string;
    password: string;
    confirmPassword: string;
  }) => api.post("/v1/auth/signup", body).then((r) => r.data.data),

  /** Đối chiếu email + mật khẩu hiện tại; dùng trước khi cho đổi mật khẩu */
  verifyAccount: (email: string, password: string) =>
    api
      .post("/v1/auth/verify", { email, password })
      .then((r) => r.data.data as { isValid: boolean }),

  /** Gửi OTP về email trước khi đăng ký */
  sendOtp: (email: string) => api.post("/v1/emails", { email }),
  verifyOtp: (email: string, otp: string) =>
    api.post("/v1/emails/verify", { email, otp }),

  resetPassword: (body: {
    email: string;
    password: string;
    confirmPassword: string;
  }) => api.post("/v1/password/reset", body).then((r) => r.data.data),
};

/* ────────────────────────── accounts ───────────────────────── */

export const accountApi = {
  /**
   * Danh sách tài khoản. Chỉ cần đăng nhập — backend đã gỡ toàn bộ phân quyền
   * nên không còn `account:read`, và cũng không còn lọc bỏ tài khoản quản trị.
   */
  list: () =>
    api
      .get("/v1/accounts")
      .then(unwrap<Account[]>)
      .then((list) => list ?? []),
  detail: (id: number) => api.get(`/v1/accounts/${id}`).then(unwrap<Account>),
  /** Người được gợi ý cho ai là do backend đọc từ access token, không truyền id */
  suggest: (limit = 5) =>
    api
      .get("/v1/accounts/suggest", { params: { limit } })
      .then(unwrap<Account[]>)
      .then((list) => list ?? []),
  ban: (id: number) => api.post(`/v1/accounts/ban/${id}`),
  unban: (id: number) => api.post(`/v1/accounts/unban/${id}`),
  remove: (id: number) => api.delete(`/v1/accounts/${id}`),
};

/* ─────────────────────── account profiles ──────────────────── */

/**
 * Hồ sơ tài khoản — thực thể hiển thị của một người dùng. Đường dẫn là
 * `/v1/account-profiles`.
 *
 * Không có endpoint đọc hồ sơ theo profileId: nếu có, số điện thoại, ngày sinh
 * và quê quán của bất kỳ ai cũng đọc được chỉ bằng cách đoán một id. Đọc hồ sơ
 * NGƯỜI KHÁC đi qua {@link accountProfileApi.byAccountId}, và bản đó hẹp hơn.
 */
export const accountProfileApi = {
  /** accountId lấy từ token, client không cần biết profileId */
  mine: () => api.get("/v1/account-profiles/me").then(unwrap<Profile>),

  /**
   * Cập nhật hồ sơ của chính người gọi.
   *
   * KHÔNG có path param: backend tra hồ sơ bằng accountId trong token, nên không
   * có tham số nào để trỏ sang hồ sơ người khác. Cũng vì thế không còn API tạo
   * hồ sơ — mỗi tài khoản được cấp sẵn một hồ sơ ngay khi đăng ký.
   *
   * Ngữ nghĩa merge: field không gửi thì giữ nguyên. Riêng avatar/cover CHỈ đổi
   * khi form đính file thật — không đính file thì ảnh cũ được giữ lại.
   */
  update: (form: FormData) =>
    api
      .put("/v1/account-profiles", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then(unwrap<Profile>),

  /**
   * Hồ sơ của NGƯỜI KHÁC. Không bắt buộc đăng nhập; tài khoản không tồn tại trả 404.
   *
   * Hẹp hơn {@link accountProfileApi.mine}: không có phoneNumber / dateOfBirth /
   * hometown.
   */
  byAccountId: (accountId: number) =>
    api
      .get(`/v1/account-profiles/accounts/${accountId}`)
      .then(unwrap<PublicProfile>),
};

/* ─────────────────────────── posts ─────────────────────────── */

export interface PostFilter {
  content?: string;
  page?: number;
  limit?: number;
}

const EMPTY_PAGE: OffsetPage<Post> = {
  content: [],
  page: 1,
  limit: 0,
  totalItems: 0,
  totalPages: 0,
  hasNext: false,
  hasPrevious: false,
};

const EMPTY_CURSOR_PAGE: CursorPage<Post> = {
  content: [],
  nextCursor: null,
  hasNext: false,
};

export const postApi = {
  /**
   * GET /v1/posts/limit-offset phân trang theo offset và trả về `OffsetPage`,
   * KHÔNG phải mảng thô — đọc `.content` chứ đừng map thẳng kết quả.
   */
  feed: (filter: PostFilter = {}) =>
    api
      .get("/v1/posts/limit-offset", { params: filter })
      .then(unwrap<OffsetPage<Post>>)
      .then((page) => page ?? EMPTY_PAGE),
  /**
   * Lấy bài theo CON TRỎ — đường nạp cho nút "Tải thêm" của bảng tin.
   *
   * `cursor` là `nextCursor` của lô trước; bỏ trống ở lần gọi đầu. Backend nhận
   * `size` chứ không phải `limit`, và trả `CursorPage` chứ không phải `OffsetPage`.
   *
   * Backend sắp xếp theo `id` TĂNG DẦN (PostRepository.fetchNextPage), nên các lô
   * đi từ bài cũ nhất tới mới nhất — ngược với `feed()` vốn xếp theo createdAt
   * giảm dần.
   */
  feedByCursor: (cursor?: number | null, size = 5) =>
    api
      .get("/v1/posts/cursor", {
        params: { size, ...(cursor == null ? {} : { cursor }) },
      })
      .then(unwrap<CursorPage<Post>>)
      .then((page) => page ?? EMPTY_CURSOR_PAGE),
  detail: (id: number) =>
    api
      .get(`/v1/posts/${id}`)
      .then(unwrap<Post>)
      // Bản chi tiết đặt danh sách like ở `listLike`, bản danh sách ở `likeList`
      .then((post) => ({ ...post, likeList: post.likeList ?? post.listLike })),
  /**
   * Bài của một tài khoản — route cho trang hồ sơ.
   *
   * `PostByAccountItem` không mang `accountId`, nên gắn lại từ tham số gọi: nếu
   * không PostCard sẽ hiển thị tác giả là `undefined`.
   */
  byAccount: (accountId: number) =>
    api
      .get(`/v1/posts/accounts/${accountId}`)
      .then(unwrap<Post[]>)
      .then((list) => (list ?? []).map((post) => ({ ...post, accountId }))),
  /** Tác giả là tài khoản trong token, không nhận từ body. */
  create: (form: FormData) =>
    api.post("/v1/posts", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /**
   * `oldIdsMedia` = những media muốn GIỮ LẠI, phần còn lại bị xoá. Ba trạng thái:
   * không gửi field = giữ nguyên media; gửi field rỗng (`oldIdsMedia=`) = xoá hết;
   * gửi các id = giữ đúng những id đó.
   */
  update: (postId: number, form: FormData) =>
    api.put(`/v1/posts/${postId}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** Chỉ tác giả xoá được — backend trả 403 với người khác */
  remove: (id: number) => api.delete(`/v1/posts/${id}`),
  like: (postId: number) => api.post("/v1/posts/like", { postId }),
  unlike: (postId: number) => api.post("/v1/posts/unlike", { postId }),
};

/* ────────────────────────── comments ───────────────────────── */

export const commentApi = {
  /** Backend bọc thêm một lớp { postId, comments } — trả thẳng mảng cho gọn */
  byPost: (postId: number) =>
    api
      .get(`/v1/comments/${postId}`)
      .then((r) => (r.data?.data?.comments ?? []) as Comment[]),
  create: (form: FormData) =>
    api.post("/v1/comments", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** Chỉ tác giả bình luận hoặc chủ bài viết xoá được */
  remove: (commentId: number) => api.delete(`/v1/comments/${commentId}`),
};

export type CommentPayload = Comment;
