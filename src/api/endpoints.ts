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
  GroupInvite,
  GroupJoinRequest,
  GroupMemberStatus,
  MarkStatusResult,
  Message,
  MessageStatus,
  Notification,
  NotificationObjectType,
  OwnedPetProfile,
  PetDetail,
  PetInput,
  PetListItem,
  PetProfileInput,
  PetUpdateInput,
  Post,
  Profile,
  PublicPetProfile,
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

/* ─────────────────────── account profiles ──────────────────── */

/**
 * Hồ sơ của CHỦ tài khoản — thông tin con người, không phải con vật. Đường dẫn
 * đã đổi `/v1/profiles` → `/v1/account-profiles` khi backend tách
 * `AccountProfile` khỏi `PetProfile`: tên cũ đã mơ hồ từ lúc hồ sơ thú cưng ra
 * đời.
 *
 * Chỉ còn HAI đường: đọc hồ sơ của chính mình, và sửa nó. Ba endpoint cũ
 * (`list`, `detail`, `byAccount`, và tìm theo `fullName`) đã bị bỏ hẳn ở
 * backend — hồ sơ chủ tài khoản là dữ liệu riêng tư, không phải thứ để duyệt
 * qua. Muốn tìm người trên mạng xã hội thì tìm HỒ SƠ THÚ CƯNG
 * ({@link petProfileApi.byHandle}), vì pet mới là thực thể hoạt động.
 */
export const accountProfileApi = {
  /** accountId lấy từ token, client không cần biết profileId */
  mine: () => api.get("/v1/account-profiles/me").then(unwrap<Profile>),

  /**
   * Cập nhật hồ sơ của chính người gọi.
   *
   * KHÔNG có path param: backend tra hồ sơ bằng accountId trong token, nên không có tham số nào
   * để trỏ sang hồ sơ người khác. Cũng vì thế không còn API tạo hồ sơ — mỗi tài khoản được cấp
   * sẵn một hồ sơ ngay khi đăng ký.
   *
   * Ngữ nghĩa merge: field không gửi thì giữ nguyên. Riêng avatar/cover CHỈ đổi khi form đính
   * file thật — không đính file thì ảnh cũ được giữ lại (bản PATCH cũ xoá mất ảnh ở đúng chỗ này).
   */
  update: (form: FormData) =>
    api
      .put("/v1/account-profiles", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then(unwrap<Profile>),
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
   * Bài của MỘT thú cưng — đơn vị tác giả thật sau khi `posts.account_id` thành
   * `posts.pet_id`. Đây là route cho trang hồ sơ thú cưng.
   *
   * `PostByAccountItem` không mang `petId`, nên gắn lại từ tham số gọi — nếu
   * không PostCard sẽ hiển thị tác giả là `undefined`.
   */
  byPet: (petId: number) =>
    api
      .get(`/v1/posts/pets/${petId}`)
      .then(unwrap<Post[]>)
      .then((list) => (list ?? []).map((post) => ({ ...post, petId }))),
  /**
   * Bài của TẤT CẢ thú cưng thuộc một tài khoản. Backend lọc qua
   * `pets.account_id`; DTO không nói bài nào của con nào, nên `petId` ở đây để
   * trống và PostCard hiện tác giả ở dạng rút gọn.
   */
  byAccount: (accountId: number) =>
    api
      .get(`/v1/posts/accounts/${accountId}`)
      .then(unwrap<Post[]>)
      .then((list) => list ?? []),
  /**
   * Tác giả là THÚ CƯNG trong header `X-Pet-Id` (client.ts tự gắn), không phải
   * tài khoản trong token. Form bắt buộc có `scope`, backend từ chối nếu thiếu.
   */
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

/* ─────────────────────── pets ─────────────────────── */

/**
 * Module pets nhận **JSON** chứ không phải multipart: ảnh của thú cưng nằm ở HỒ
 * SƠ CÔNG KHAI ({@link petProfileApi}) và được gửi dưới dạng URL, không phải
 * file — backend không upload hộ ở đây.
 *
 * Ranh giới hai bảng phải giữ đúng cả ở tầng api: `pets` là dữ liệu SINH HỌC
 * (loài, giống, ngày sinh, giới tính, chủ), `pet_profiles` là MẶT CÔNG KHAI
 * (handle, displayName, avatar, cover, bio, visibility). Gộp hai lời gọi vào
 * một hàm "tiện" ở đây sẽ dựng lại đúng cái ranh giới mà backend vừa tách ra.
 */
export const petApi = {
  /**
   * KHÔNG nhận tham số accountId: backend lấy danh tính từ token. Đây cũng là
   * nguồn dữ liệu của bộ chọn "đang thao tác với con nào" (PetContext).
   */
  mine: () =>
    api
      .get("/v1/pets/me")
      .then(unwrap<PetListItem[]>)
      .then((list) => list ?? []),

  /** optionalAuth — hồ sơ PUBLIC xem được khi chưa đăng nhập; ngoài ra trả 404 */
  detail: (petId: number) => api.get(`/v1/pets/${petId}`).then(unwrap<PetDetail>),

  /**
   * Tạo con vật VÀ hồ sơ công khai của nó trong MỘT transaction ở backend, nên
   * `visibility` gửi kèm ngay từ bước này. Chủ sở hữu suy từ token.
   */
  create: (body: PetInput) => api.post("/v1/pets", body).then(unwrap<PetDetail>),

  /**
   * Chỉ sửa dữ liệu sinh học. `bio`/`visibility` KHÔNG còn ở đây — chúng thuộc
   * hồ sơ công khai, sửa qua {@link petProfileApi.update}; gửi kèm chỉ bị bỏ qua.
   */
  update: (petId: number, body: PetUpdateInput) =>
    api.put(`/v1/pets/${petId}`, body).then(unwrap<PetDetail>),

  /**
   * Ngừng hoạt động (xoá MỀM): con vật chuyển sang DEACTIVATED và biến mất khỏi
   * mọi luồng đọc, kể cả danh sách của chính chủ. Bài viết và bình luận cũ vẫn
   * nằm trong DB vì chúng trỏ tới `pets.id` — nhưng tác giả sẽ không hiện ra.
   */
  deactivate: (petId: number) =>
    api
      .delete(`/v1/pets/${petId}`)
      .then(unwrap<{ petId: number; status: "DEACTIVATED" }>),
};

/**
 * Hồ sơ công khai của thú cưng — thứ người lạ nhìn thấy, và là danh bạ tìm kiếm
 * của mạng xã hội này (`handle` thay cho username).
 */
export const petProfileApi = {
  /** Tra cứu CÔNG KHAI theo handle — dùng cho tìm kiếm và cho @mention */
  byHandle: (handle: string) =>
    api
      .get(`/v1/pet-profiles/handle/${encodeURIComponent(handle)}`)
      .then(unwrap<PublicPetProfile>),

  /** optionalAuth; hồ sơ PRIVATE/FOLLOWERS trả 404 với người ngoài */
  byPetId: (petId: number) =>
    api.get(`/v1/pet-profiles/${petId}`).then(unwrap<PublicPetProfile>),

  /** Bản CHỦ SỞ HỮU nhìn thấy — thêm status và updatedAt */
  owned: (petId: number) =>
    api.get(`/v1/pet-profiles/${petId}/owned`).then(unwrap<OwnedPetProfile>),

  /**
   * Multipart — cùng luồng với `accountProfileApi.update`: file `avatar`/`cover`
   * được backend đẩy lên Cloudinary rồi lưu URL trả về.
   *
   * Không đính file thì ảnh cũ được GIỮ NGUYÊN; muốn xoá ảnh thì gửi tường minh
   * trường `avatarUrl`/`coverUrl` là chuỗi rỗng.
   */
  update: (petId: number, form: FormData) =>
    api
      .put(`/v1/pet-profiles/${petId}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then(unwrap<OwnedPetProfile>),

  /** Biến thể JSON, cho client đã có sẵn URL ảnh */
  updateJson: (petId: number, body: PetProfileInput) =>
    api.put(`/v1/pet-profiles/${petId}`, body).then(unwrap<OwnedPetProfile>),
};


/* ─────────────────────────── groups ────────────────────────── */

export const groupApi = {
  suggest: () =>
    api
      .get("/v1/groups/suggest")
      .then(unwrap<Group[]>)
      .then((list) => list ?? []),
  detail: (id: number) => api.get(`/v1/groups/${id}`).then(unwrap<Group>),
  /** Nhóm do BẤT KỲ thú cưng nào của tài khoản làm chủ */
  owned: (accountId: number) =>
    api
      .get(`/v1/groups/owned/${accountId}`)
      .then(unwrap<Group[]>)
      .then((list) => list ?? []),
  /** Nhóm mà BẤT KỲ thú cưng nào của tài khoản đang tham gia */
  joined: (accountId: number) =>
    api
      .get(`/v1/groups/joined/${accountId}`)
      .then(unwrap<Group[]>)
      .then((list) => list ?? []),
  /** Nhóm của MỘT thú cưng — dùng cho trang hồ sơ thú cưng */
  joinedByPet: (petId: number) =>
    api
      .get(`/v1/groups/joined/pets/${petId}`)
      .then(unwrap<Group[]>)
      .then((list) => list ?? []),
  /**
   * Thú cưng trong header `X-Pet-Id` trở thành OWNER trong group_members.
   * Quyền quản trị nhóm gắn với PET: đổi sang con khác của cùng chủ là mất
   * quyền quản trị nhóm đó.
   */
  create: (form: FormData) =>
    api.post("/v1/groups", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  update: (id: number, form: FormData) =>
    api.put(`/v1/groups/${id}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** Chỉ pet có role OWNER xoá được — xét theo X-Pet-Id, không theo tài khoản */
  remove: (groupId: number) => api.delete("/v1/groups", { data: { groupId } }),
  /** `memberPetId` là id THÚ CƯNG bị xoá khỏi nhóm */
  removeMember: (groupId: number, memberPetId: number) =>
    api.delete("/v1/groups/members", { data: { groupId, member: memberPetId } }),

  /* ─────────────── tự tham gia / rời nhóm ─────────────── */

  /**
   * Nhóm PUBLIC vào được ngay (`status: "ACTIVE"`); nhóm PRIVATE chỉ tạo yêu cầu
   * chờ quản trị nhóm duyệt (`status: "PENDING"`) — đọc `status` trong phản hồi
   * thay vì đoán theo `group.type`, vì backend là nơi quyết định.
   *
   * Đang có lời mời chưa trả lời thì lệnh này được coi là CHẤP NHẬN lời mời đó.
   * Đã là thành viên, hoặc đã tự gửi yêu cầu trước đó, thì 409.
   */
  join: (groupId: number) =>
    api
      .post(`/v1/groups/${groupId}/join`)
      .then(unwrap<{ groupId: number; petId: number; status: GroupMemberStatus }>),
  /** Huỷ yêu cầu do CHÍNH thú cưng này gửi; không dùng cho lời mời */
  cancelJoinRequest: (groupId: number) =>
    api.delete(`/v1/groups/${groupId}/join`),
  /** Chủ nhóm không rời được (400) — phải xoá nhóm hoặc chuyển quyền */
  leave: (groupId: number) => api.delete(`/v1/groups/${groupId}/leave`),

  /* ─────────────── yêu cầu vào nhóm: quản trị duyệt ─────────────── */

  /** Chỉ các yêu cầu TỰ gửi; lời mời không nằm ở đây vì người duyệt chúng khác */
  joinRequests: (groupId: number) =>
    api
      .get(`/v1/groups/${groupId}/requests`)
      .then(unwrap<GroupJoinRequest[]>)
      .then((list) => list ?? []),
  approveJoinRequest: (groupId: number, petId: number) =>
    api.post("/v1/groups/requests/approve", { groupId, petId }),
  /** Từ chối = XOÁ hàng, nên thú cưng đó xin lại được sau này */
  rejectJoinRequest: (groupId: number, petId: number) =>
    api.post("/v1/groups/requests/reject", { groupId, petId }),

  /* ─────────────── lời mời: người được mời trả lời ─────────────── */

  /**
   * Mời một thú cưng khác. `inviteePetId` là id THÚ CƯNG, KHÔNG phải id tài khoản.
   *
   * Chỉ tạo lời mời PENDING — người được mời phải tự chấp nhận, và trước đó họ
   * không đọc được gì trong nhóm. Mọi thành viên ACTIVE đều mời được, không cần
   * quyền quản trị.
   */
  invite: (groupId: number, inviteePetId: number) =>
    api.post("/v1/groups/invites", { groupId, invitee: inviteePetId }),
  /** Hộp thư lời mời của thú cưng trong `X-Pet-Id` — không nhận id trong URL */
  myInvites: () =>
    api
      .get("/v1/groups/invites/mine")
      .then(unwrap<GroupInvite[]>)
      .then((list) => list ?? []),
  acceptInvite: (groupId: number) =>
    api.post("/v1/groups/invites/accept", { groupId }),
  rejectInvite: (groupId: number) =>
    api.post("/v1/groups/invites/reject", { groupId }),
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
  /**
   * Ack "đã nhận" theo LÔ. Đường lui REST của sự kiện socket `message
   * delivered`, dùng khi socket chưa kết nối (vừa mở lại app, mạng chập chờn).
   *
   * Id lạ không gây 403: backend lọc trong câu truy vấn, chỉ nhận tin có
   * receiver đúng là người gọi và im lặng bỏ qua phần còn lại.
   */
  markDelivered: (messageIds: number[]) =>
    api
      .patch("/v1/messages/delivered", { messageIds })
      .then(unwrap<MarkStatusResult>),
  /**
   * Đánh dấu đã xem CẢ hội thoại bằng một request — thay cho việc gọi
   * `setStatus` cho từng tin, thứ vừa tốn n round-trip vừa làm backend bắn n
   * sự kiện socket dội ngược về người gửi.
   */
  markConversationRead: (partnerId: number) =>
    api
      .patch("/v1/messages/read", null, { params: { partnerId } })
      .then(unwrap<MarkStatusResult>),
  /**
   * Id những tin đang chờ mình ack "đã nhận" — trên MỌI hội thoại.
   *
   * Client gọi ngay sau khi socket kết nối để bù cho quãng offline: tin đến lúc
   * đã đăng xuất không được socket nào chuyển tới, nên không có ack nào từng
   * được phát và chúng kẹt ở "đã gửi".
   */
  pendingDelivery: () =>
    api
      .get("/v1/messages/pending-delivery")
      .then(unwrap<number[]>)
      .then((ids) => ids ?? []),
  /** Badge tổng số tin chưa đọc, tính ở backend bằng một câu COUNT */
  unreadCount: () =>
    api
      .get("/v1/messages/unread-count")
      .then(unwrap<{ count: number }>)
      .then((data) => data?.count ?? 0),
};

/* ─────────────────────── notifications ─────────────────────── */

/** Payload socket dùng `objectType`, REST dùng `type` — quy về một trường */
function normalizeNotification(
  raw: Notification & { objectType?: NotificationObjectType },
): Notification {
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
  // `POST /v1/notifications` cố ý KHÔNG được gói ở đây nữa. Thông báo nay do
  // backend tự sinh trong service của hành động tương ứng (thích bài, bình
  // luận, nhắn tin, kết bạn) — kèm objectId để bấm vào mở được đúng chỗ, thứ mà
  // client không thể tự gắn cho đúng. Gọi lại từ frontend là tạo ra thông báo
  // mồ côi không dẫn đi đâu, nên đường đó bị bịt luôn ở tầng api.
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
