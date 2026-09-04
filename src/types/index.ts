/** Các kiểu dữ liệu khớp với DTO của lopet-be. */

export interface AuthUser {
  id: number;
  username: string;
  email?: string;
  /** Id hồ sơ (account_profiles.id) — khác accountId */
  profileId?: number | null;
  avatarUrl?: string | null;
}

/** Hồ sơ của CHÍNH MÌNH — khớp `AccountProfileDtos.ProfileSummary` */
export interface Profile {
  id: number;
  fullName?: string | null;
  bio?: string | null;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  sex?: number | null;
  dateOfBirth?: string | null;
  hometown?: string | null;
}

/**
 * Hồ sơ của NGƯỜI KHÁC — khớp `AccountProfileDtos.PublicProfile`.
 *
 * Cố ý HẸP HƠN {@link Profile}: backend không trả phoneNumber / dateOfBirth /
 * hometown cho người ngoài.
 */
export interface PublicProfile {
  id: number;
  accountId: number | null;
  username: string | null;
  fullName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
}

/**
 * Khớp `AccountViews.AccountListItem` và `GetAccountResponse`.
 *
 * Không còn `roles`: backend đã gỡ toàn bộ phân quyền, JWT chỉ mang { id, email }.
 */
export interface Account {
  id: number;
  email: string;
  username: string;
  isBanned?: number;
  profile?: Profile | null;
}

export interface PostMedia {
  id?: number;
  mediaUrl: string;
  mediaType: "IMAGE" | "VIDEO";
}

/** Người thả tim — khớp `PostDtos.LikedAccount` */
export interface LikedAccount {
  id: number;
  username: string;
  email?: string;
}

/**
 * Khớp `PostDtos.PostListItem` — khoá chính là `postId`, KHÔNG phải `id`.
 *
 * `accountId` có thể null với dữ liệu cũ không quy được về tài khoản nào
 * (backend giữ lại bài và để cột rỗng thay vì xoá nội dung người dùng đã viết).
 *
 * Lưu ý: `PostByAccountItem` của backend không có `accountId`, nên khi lấy bài
 * theo tài khoản phải tự gắn lại ở tầng api (xem endpoints.ts).
 */
export interface Post {
  postId: number;
  accountId?: number | null;
  content: string;
  postMedias?: PostMedia[];
  likeAmount: number;
  /** Chỉ GET /v1/posts trả về; bản chi tiết dùng `listLike` */
  likeList?: LikedAccount[];
  listLike?: LikedAccount[];
  commentAmount?: number;
  shareAmount?: number;
  createdAt?: string;
  updatedAt?: string | null;
}

/**
 * Một trang bài viết theo offset — khớp record `OffsetPage` của backend.
 *
 * Danh sách nằm ở `content`, KHÔNG phải `items`: đây là tên trường trong DTO
 * Java, và đọc nhầm khoá thì bảng tin im lặng trả về rỗng chứ không báo lỗi.
 */
export interface OffsetPage<T> {
  content: T[];
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Một lô bài viết lấy theo con trỏ — khớp record `CursorPage` của backend.
 *
 * `nextCursor` là id của bài CUỐI trong lô, truyền lại ở lần gọi sau để lấy tiếp
 * từ đúng chỗ đã dừng. Hết dữ liệu thì `hasNext` là false và `nextCursor` là null.
 *
 * Khác `OffsetPage` ở chỗ không có tổng số trang: phân trang theo con trỏ không
 * đếm được còn bao nhiêu, đổi lại không bị lệch khi có bài mới chen vào giữa hai
 * lần tải — thứ mà `?page=2` luôn dính.
 */
export interface CursorPage<T> {
  content: T[];
  nextCursor: number | null;
  hasNext: boolean;
}

/** Tác giả bình luận — khớp `CommentDtos.CommentAccount` */
export interface CommentAccount {
  id: number;
  username: string;
  email?: string;
  profile: Profile;
}

/** Khớp `CommentDtos.CommentItem` — nội dung là `content` */
export interface Comment {
  id: number;
  content: string;
  imageUrl?: string;
  replyToCommentId?: number;
  account?: CommentAccount;
  createdAt?: string;
}

/** GET /v1/comments/:postId trả về bọc thêm một lớp */
export interface CommentBundle {
  postId: number;
  comments: Comment[];
}

export interface ApiEnvelope<T> {
  statusCode: number;
  message: string;
  data: T;
}
