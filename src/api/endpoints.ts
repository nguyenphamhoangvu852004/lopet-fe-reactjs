import { api, unwrap } from "./client";
import type {
  Account,
  AccountEntity,
  Advertisement,
  AdvertiserProfile,
  AdvertiserStatus,
  Comment,
  FriendShipList,
  Group,
  Message,
  MessageStatus,
  Notification,
  NotificationObjectType,
  Post,
  Profile,
  Report,
  ReportAction,
  ReportType,
  RoleName,
} from "../types";

/* ─────────────────────────── auth ─────────────────────────── */

export const authApi = {
  /** Chỉ trả { id, accessToken, refreshToken } — roles nằm trong JWT */
  login: (username: string, password: string) =>
    api.post("/v1/auth/login", { username, password }).then(
      (r) =>
        r.data.data as {
          id: number;
          accessToken: string;
          refreshToken: string;
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

/**
 * GET /v1/accounts và /v1/accounts/suggest trả entity Accounts thô, còn
 * /v1/accounts/:id trả GetAccountOutputDTO đã có sẵn `roles: string[]`.
 * Gộp hai hình dạng đó về một kiểu Account duy nhất ngay tại đây.
 */
function normalizeAccount(raw: AccountEntity & { roles?: RoleName[] }): Account {
  return {
    id: raw.id,
    email: raw.email,
    username: raw.username,
    isBanned: raw.isBanned ?? 0,
    profile: raw.profile ?? null,
    roles:
      raw.roles ??
      (raw.accountRoles
        ?.map((entry) => entry.role?.name)
        .filter((name): name is RoleName => Boolean(name)) ??
        []),
  };
}

export const accountApi = {
  /** Cần quyền account:read (ADMIN / SUPPORT). Backend đã lọc bỏ tài khoản ADMIN. */
  list: () =>
    api
      .get("/v1/accounts")
      .then(unwrap<AccountEntity[]>)
      .then((list) => (list ?? []).map(normalizeAccount)),
  detail: (id: number) =>
    api
      .get(`/v1/accounts/${id}`)
      .then(unwrap<AccountEntity & { roles?: RoleName[] }>)
      .then(normalizeAccount),
  /** `id` trên đường dẫn bị controller bỏ qua — luôn gợi ý cho chính người gọi */
  suggest: (id: number, limit = 5) =>
    api
      .get(`/v1/accounts/suggest/${id}`, { params: { limit } })
      .then(unwrap<AccountEntity[]>)
      .then((list) => (list ?? []).map(normalizeAccount)),
  /** Cần quyền account:ban */
  ban: (id: number) => api.post(`/v1/accounts/ban/${id}`),
  unban: (id: number) => api.post(`/v1/accounts/unban/${id}`),
  /** Cần quyền account:delete */
  remove: (id: number) => api.delete(`/v1/accounts/${id}`),
  /** Cần quyền account:setRole. Backend tự ghi granted_by từ token. */
  setRoles: (userId: number, roles: RoleName[]) =>
    api.put("/v1/accounts", { userId, roles }),
};

export const roleApi = {
  list: () =>
    api.get("/v1/roles").then(unwrap<{ id: number; name: RoleName }[]>),
};

/* ────────────────────────── profiles ───────────────────────── */

export const profileApi = {
  /** Tìm người theo tên — endpoint tìm kiếm duy nhất backend đang có */
  search: (fullName: string) =>
    api.get("/v1/profiles", { params: { fullName } }).then(unwrap<Profile[]>),
  list: () => api.get("/v1/profiles").then(unwrap<Profile[]>),
  detail: (id: number) => api.get(`/v1/profiles/${id}`).then(unwrap<Profile>),
  byAccount: (accountId: number) =>
    api.get(`/v1/profiles/accounts/${accountId}`).then(unwrap<Profile>),
  /** Chỉ chính chủ sửa được — backend chặn bằng requireOwnership */
  update: (id: number, form: FormData) =>
    api.patch(`/v1/profiles/${id}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** Tạo hồ sơ rời; phải gọi attachToAccount sau đó mới gắn được vào tài khoản */
  create: (form: FormData) =>
    api
      .post("/v1/profiles", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then(unwrap<Profile>),
  /** accountId lấy từ token ở backend, không gửi trong body */
  attachToAccount: (profileId: number) =>
    api.post(`/v1/profiles/${profileId}`).then(unwrap<Profile>),
};

/* ─────────────────────────── posts ─────────────────────────── */

export interface PostFilter {
  content?: string;
  groupId?: number;
}

export const postApi = {
  /** Hỗ trợ lọc theo nội dung (tìm kiếm) và theo nhóm */
  feed: (filter: PostFilter = {}) =>
    api
      .get("/v1/posts", { params: filter })
      .then(unwrap<Post[]>)
      .then((list) => list ?? []),
  suggest: () =>
    api
      .get("/v1/posts/suggest")
      .then(unwrap<Post[]>)
      .then((list) => list ?? []),
  detail: (id: number) =>
    api
      .get(`/v1/posts/${id}`)
      .then(unwrap<Post>)
      // Bản chi tiết đặt danh sách like ở `listLike`, bản danh sách ở `likeList`
      .then((post) => ({ ...post, likeList: post.likeList ?? post.listLike })),
  /**
   * GetPostByAccountIdOutputDTO không có trường accountId, nên gắn lại từ tham
   * số gọi — nếu không PostCard sẽ hiển thị tác giả là `undefined`.
   */
  byAccount: (accountId: number) =>
    api
      .get(`/v1/posts/accounts/${accountId}`)
      .then(unwrap<Post[]>)
      .then((list) => (list ?? []).map((post) => ({ ...post, accountId }))),
  /** accountId lấy từ token; form bắt buộc có `scope`, backend từ chối nếu thiếu */
  create: (form: FormData) =>
    api.post("/v1/posts", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** Gửi kèm `oldIdsMedia` cho những media muốn GIỮ LẠI, phần còn lại bị xoá */
  update: (postId: number, form: FormData) =>
    api.put(`/v1/posts/${postId}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
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
  remove: (commentId: number) => api.delete(`/v1/comments/${commentId}`),
};

export type CommentPayload = Comment;

/* ─────────────────────────── groups ────────────────────────── */

export const groupApi = {
  suggest: () =>
    api
      .get("/v1/groups/suggest")
      .then(unwrap<Group[]>)
      .then((list) => list ?? []),
  detail: (id: number) => api.get(`/v1/groups/${id}`).then(unwrap<Group>),
  owned: (accountId: number) =>
    api
      .get(`/v1/groups/owned/${accountId}`)
      .then(unwrap<Group[]>)
      .then((list) => list ?? []),
  joined: (accountId: number) =>
    api
      .get(`/v1/groups/joined/${accountId}`)
      .then(unwrap<Group[]>)
      .then((list) => list ?? []),
  /** Người tạo tự động thành OWNER trong group_members */
  create: (form: FormData) =>
    api.post("/v1/groups", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  update: (id: number, form: FormData) =>
    api.put(`/v1/groups/${id}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** owner lấy từ token ở backend */
  remove: (groupId: number) => api.delete("/v1/groups", { data: { groupId } }),
  addMember: (groupId: number, invitee: number) =>
    api.post("/v1/groups/invites", { groupId, invitee }),
  removeMember: (groupId: number, member: number) =>
    api.delete("/v1/groups/members", { data: { groupId, member } }),
};

/* ──────────────────────── friendships ──────────────────────── */

export const friendApi = {
  /** Chỉ chính chủ hoặc bạn bè xem được — backend chặn bằng requireFriendOrSelf */
  listOf: (accountId: number) =>
    api.get(`/v1/friendships/${accountId}`).then(unwrap<FriendShipList>),
  /** Hai endpoint dưới luôn trả dữ liệu của chính người gọi bất kể :id */
  sent: (accountId: number) =>
    api.get(`/v1/friendships/send/${accountId}`).then(unwrap<FriendShipList>),
  received: (accountId: number) =>
    api
      .get(`/v1/friendships/receive/${accountId}`)
      .then(unwrap<FriendShipList>),
  request: (receiverId: number) => api.post("/v1/friendships", { receiverId }),
  accept: (senderId: number) =>
    api.post("/v1/friendships/accept", { senderId }),
  reject: (senderId: number) =>
    api.post("/v1/friendships/reject", { senderId }),
  /**
   * Một đầu luôn là người gọi; service dò quan hệ theo cả hai chiều nên dùng
   * chung cho cả huỷ kết bạn lẫn thu hồi lời mời đã gửi.
   */
  remove: (friendId: number) =>
    api.delete("/v1/friendships", { data: { friendId } }),
};

/* ───────────────────────── messages ────────────────────────── */

export const messageApi = {
  /** Chỉ người gửi hoặc người nhận đọc được */
  detail: (id: number) => api.get(`/v1/messages/${id}`).then(unwrap<Message>),
  /**
   * Controller đọc người đối thoại từ query `targetId`, KHÔNG phải từ `:id`
   * trên đường dẫn — thiếu query thì receiverId thành NaN và API trả 404.
   */
  conversation: (targetId: number) =>
    api
      .get(`/v1/messages/me/${targetId}`, { params: { targetId } })
      .then(unwrap<Message[]>)
      .then((list) => list ?? []),
  send: (form: FormData) =>
    api.post("/v1/messages", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  setStatus: (id: number, status: MessageStatus) =>
    api.patch(`/v1/messages/status/${id}`, { status }),
};

/* ─────────────────────── notifications ─────────────────────── */

/** Payload socket dùng `objectType`, REST dùng `type` — quy về một trường */
function normalizeNotification(raw: Notification & { objectType?: string }) {
  return { ...raw, type: raw.type ?? raw.objectType };
}

export const notificationApi = {
  /** `:id` bị controller bỏ qua, luôn trả thông báo của chính người gọi */
  mine: (accountId: number) =>
    api
      .get(`/v1/notifications/me/${accountId}`)
      .then(unwrap<Notification[]>)
      .then((list) => (list ?? []).map(normalizeNotification)),
  detail: (id: number) =>
    api.get(`/v1/notifications/${id}`).then(unwrap<Notification>),
  /** actorId lấy từ token; dùng để báo cho người khác biết có tương tác mới */
  create: (
    receptorId: number,
    content: string,
    objectType: NotificationObjectType,
  ) =>
    api
      .post("/v1/notifications", { receptorId, content, objectType })
      .then(unwrap<Notification>),
  setStatus: (id: number, status: string) =>
    api.put(`/v1/notifications/${id}`, { status }),
};

/* ────────────────────────── reports ────────────────────────── */

export interface ReportFilter {
  type?: ReportType;
  accountId?: number;
  targetId?: number;
}

export const reportApi = {
  /** Cần quyền report:read (ADMIN / MODERATOR / SUPPORT) */
  list: (filter: ReportFilter = {}) =>
    api
      .get("/v1/reports", { params: filter })
      .then(unwrap<Report[]>)
      .then((list) => list ?? []),
  /** Baseline — mọi user đã đăng nhập */
  create: (targetId: number, type: ReportType, reason: string) =>
    api.post("/v1/reports", { targetId, type, reason }),
  /**
   * Cần quyền report:resolve. Backend tự ghi resolved_by từ token và xử lý theo
   * cặp (targetId, type) chứ không theo id của từng báo cáo.
   */
  resolve: (targetId: number, type: ReportType, action: ReportAction) =>
    api.put(`/v1/reports/${targetId}`, { type, action }),
};

/* ───────────────────── advertiser + ads ────────────────────── */

export const advertiserApi = {
  /** Tạo hồ sơ ở trạng thái PENDING, chờ staff duyệt */
  register: (companyName: string) =>
    api
      .post("/v1/advertisers", { companyName })
      .then(unwrap<AdvertiserProfile>),
  mine: () => api.get("/v1/advertisers/me").then(unwrap<AdvertiserProfile>),
  /** Cần quyền advertiser:read */
  list: () =>
    api
      .get("/v1/advertisers")
      .then(unwrap<AdvertiserProfile[]>)
      .then((list) => list ?? []),
  /** Cần quyền advertiser:approve */
  setStatus: (id: number, status: AdvertiserStatus) =>
    api
      .put(`/v1/advertisers/${id}/status`, { status })
      .then(unwrap<AdvertiserProfile>),
};

export const adsApi = {
  list: (accountId?: number) =>
    api
      .get("/v1/advertisements", {
        params: accountId ? { accountId } : undefined,
      })
      .then(unwrap<Advertisement[]>)
      .then((list) => list ?? []),
  detail: (id: number) =>
    api.get(`/v1/advertisements/${id}`).then(unwrap<Advertisement>),
  /** Yêu cầu advertiser_profile ở trạng thái APPROVED */
  create: (form: FormData) =>
    api.post("/v1/advertisements", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** Backend bắt buộc gửi kèm ảnh mới ở mỗi lần cập nhật */
  update: (adsId: number, form: FormData) =>
    api.put(`/v1/advertisements/${adsId}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  remove: (id: number) => api.delete(`/v1/advertisements/${id}`),
};
