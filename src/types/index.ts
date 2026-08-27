/** Các kiểu dữ liệu khớp với DTO của lopet-be. */

export type RoleName = "ADMIN" | "MODERATOR" | "SUPPORT";

export interface AuthUser {
  id: number;
  username: string;
  email?: string;
  roles: RoleName[];
  /** Id hồ sơ (profiles.id) — khác accountId, cần cho PATCH /v1/profiles/:id */
  profileId?: number | null;
  avatarUrl?: string | null;
}

/** Phạm vi hiển thị hồ sơ — khớp `AccountProfileDtos.ProfileVisibility` */
export type ProfileVisibility = "PUBLIC" | "FRIEND" | "PRIVATE";

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
  visibility?: ProfileVisibility;
}

/**
 * Hồ sơ của NGƯỜI KHÁC — khớp `AccountProfileDtos.PublicProfile`.
 *
 * Cố ý HẸP HƠN {@link Profile}: backend không trả phoneNumber / dateOfBirth /
 * hometown cho người ngoài, và cũng không trả `visibility` — cấu hình riêng tư
 * của một người không phải việc của người xem.
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

/** Backend đã bỏ `password` khỏi DTO này, đừng thêm lại. */
export interface Account {
  id: number;
  email: string;
  username: string;
  roles?: RoleName[];
  isBanned?: number;
  profile?: Profile | null;
}

/**
 * GET /v1/accounts trả thẳng entity Accounts chứ không qua DTO, nên role nằm ở
 * `accountRoles[].role.name`. Kiểu này chỉ dùng làm đầu vào cho normalizeAccount.
 */
export interface AccountEntity {
  id: number;
  email: string;
  username: string;
  isBanned?: number | null;
  profile?: Profile | null;
  accountRoles?: { role?: { name?: RoleName } }[];
}

export type PostScope = "PUBLIC" | "FRIEND" | "PRIVATE";
export type PostType = "GROUP" | "USER";

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
  groupId?: number | null;
  postType?: PostType;
  postScope?: PostScope;
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

export type GroupType = "PUBLIC" | "PRIVATE";
export type GroupMemberRole = "OWNER" | "ADMIN" | "MEMBER";

/**
 * Trạng thái một hàng `group_members`. "Tồn tại hàng" KHÔNG còn nghĩa là thành
 * viên: một yêu cầu xin vào hoặc một lời mời chưa trả lời cũng là một hàng ở đây
 * với `PENDING`.
 */
export type GroupMemberStatus = "PENDING" | "ACTIVE";

/**
 * Quan hệ của NGƯỜI ĐANG XEM với nhóm — backend tính sẵn từ token nên giao diện
 * không phải tự suy từ danh sách thành viên (và không suy được, vì danh sách bị
 * che ở nhóm riêng tư).
 *
 * `NONE` cũng là giá trị cho khách chưa đăng nhập.
 */
export type GroupViewerStatus =
  | "NONE"
  | "PENDING_REQUEST"
  | "PENDING_INVITE"
  | "MEMBER";

/** Thành viên nhóm — khớp `GroupDtos.GroupMemberView` */
export interface GroupMember {
  groupId: number;
  accountId: number;
  role: GroupMemberRole;
  /** `joinedAt` là lúc thành viên BẮT ĐẦU thật — hàng chờ được đóng dấu lại khi duyệt */
  joinedAt?: string;
  /**
   * Rỗng (các chuỗi "") khi tài khoản đã bị xoá mềm: hàng thành viên vẫn còn
   * nhưng backend lọc tài khoản đó khỏi kết quả nạp.
   *
   * Cố ý KHÔNG có email — danh sách thành viên của một nhóm công khai không phải
   * chỗ để lộ địa chỉ liên lạc.
   */
  account?: {
    accountId: number | null;
    username: string;
    fullName: string;
    avatarUrl: string;
  };
}

export interface Group {
  id: number;
  name: string;
  type: GroupType;
  bio?: string;
  coverUrl?: string;
  /** Id TÀI KHOẢN làm chủ nhóm; backend trả 0 khi nhóm không có bản ghi OWNER */
  ownerAccountId?: number;
  /**
   * LUÔN là số thành viên ACTIVE thật, kể cả khi `members` bị che — dùng khoá này
   * chứ không phải `members.length` để hiển thị số đếm.
   */
  totalMembers?: number;
  members?: GroupMember[];
  /**
   * Nhóm riêng tư và người xem không phải thành viên: `members` bị rút thành mảng
   * rỗng. Phải đọc cờ này chứ không suy từ `members.length === 0` — một nhóm công
   * khai chưa ai vào cũng cho danh sách rỗng.
   */
  restricted?: boolean;
  viewerStatus?: GroupViewerStatus;
  createdAt?: string;
}

/** Một người đang chờ quản trị nhóm duyệt — khớp `GroupDtos.PendingMemberView` */
export interface GroupJoinRequest {
  groupId: number;
  accountId: number;
  account?: GroupMember["account"];
  requestedAt?: string;
}

/**
 * Một lời mời đang chờ chính người được mời trả lời — khớp
 * `GroupDtos.PendingInviteView`. Kèm tên nhóm nên hộp thư mời không phải gọi thêm
 * một vòng chi tiết nhóm cho từng dòng.
 */
export interface GroupInvite {
  groupId: number;
  groupName: string;
  groupType: GroupType;
  accountId: number;
  /** Rỗng nếu người đã mời sau đó bị xoá */
  invitedBy?: GroupMember["account"];
  invitedAt?: string;
}

/** Backend đã bỏ `email` khỏi DTO bạn bè — không khôi phục. */
export interface FriendEntry {
  id: number;
  username: string;
  imageUrl?: string;
  status?: string;
}

export interface FriendShipList {
  me: FriendEntry;
  others: FriendEntry[];
}

export type MessageStatus = "SENT" | "DELIVERED" | "READ";

export interface Message {
  id: number;
  content: string;
  senderId: number;
  receiverId: number;
  mediaUrl?: string;
  status: MessageStatus;
  createdAt?: string;
  /** Mốc tin tới được thiết bị người nhận; null khi chưa xảy ra */
  deliveredAt?: string | null;
  /** Mốc người nhận mở hội thoại và nhìn thấy tin; null khi chưa xảy ra */
  readAt?: string | null;
}

export interface MarkStatusResult {
  /** Số tin thật sự đổi trạng thái — 0 nghĩa là tất cả đã ở trạng thái đó rồi */
  updated: number;
  status: MessageStatus;
}

/**
 * Payload của `/topic/user.<senderId>/message-status`, backend đẩy NGƯỢC về
 * người gửi (message/MessageStatusNotifier). Gộp theo người gửi nên một lần
 * đối phương mở hội thoại chỉ tốn đúng một sự kiện, kèm danh sách id chứ không
 * phải một sự kiện cho mỗi tin.
 *
 * `byUserId` là người vừa nhận/xem — dùng để bỏ qua sự kiện do chính mình gây
 * ra khi mở hai tab cùng một tài khoản.
 */
export interface MessageStatusEvent {
  messageIds: number[];
  status: MessageStatus;
  at?: string | null;
  byUserId: number;
}

/**
 * Loại thông báo — hợp đồng với backend
 * (notification/entity/NotificationObjectType.java). Quyết định biểu tượng và
 * ĐÍCH ĐIỀU HƯỚNG khi người dùng bấm vào, xem `notificationTarget()`.
 *
 * `POST` là loại CŨ: hồi frontend tự tạo thông báo, cả bốn sự kiện khác nhau
 * đều bị nhét vào giá trị này và không kèm id đối tượng nào. Chỉ còn để đọc dữ
 * liệu cũ; thông báo loại đó hiện ra được nhưng không dẫn đi đâu.
 */
export type NotificationObjectType =
  | "POST_LIKE"
  | "POST_COMMENT"
  | "MESSAGE"
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED"
  | "GROUP_JOIN_REQUESTED"
  | "GROUP_JOIN_APPROVED"
  | "GROUP_INVITED"
  | "GROUP_INVITE_ACCEPTED"
  | "POST";
export type NotificationStatus = "SENT" | "DELIVERED" | "READ";

/**
 * Backend gọi khoá chính là `notificationId` (không phải `id`) và gọi loại là
 * `type` ở danh sách nhưng `objectType` ở payload realtime — chuẩn hoá tại
 * endpoints.ts để phần còn lại của app chỉ thấy một hình dạng.
 */
export interface Notification {
  notificationId: number;
  actorId?: number;
  receptorId?: number;
  content: string;
  status?: NotificationStatus | string;
  type?: NotificationObjectType;
  /**
   * Id của đối tượng được nói tới — bài viết, tin nhắn, hoặc người liên quan,
   * tuỳ `type`. Vắng mặt ở thông báo cũ, nên mọi chỗ đọc nó phải chịu được
   * undefined thay vì coi như luôn có.
   */
  objectId?: number | null;
  createdAt?: string;
}

/**
 * Hồ sơ nhúng trong thông báo — khớp `NotificationDtos.NotificationProfile`,
 * lấy từ `account_profiles`.
 */
export interface NotificationProfile {
  id?: number;
  fullName?: string;
  phoneNumber?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
}

/** Actor/receptor của thông báo là TÀI KHOẢN */
export interface NotificationAccount {
  id: number;
  username: string;
  email?: string;
  profile?: NotificationProfile;
}

export type ReportType = "USER" | "GROUP" | "POST";
export type ReportAction = "PENDING" | "CANCELLED" | "APPROVED";

export interface Report {
  id: number;
  reason: string;
  targetType: ReportType;
  targetId: number;
  action: ReportAction;
  reporter?: Account;
  resolvedBy?: Account | null;
  resolvedAt?: string | null;
  createdAt?: string;
}

export type AdvertiserStatus = "PENDING" | "APPROVED" | "SUSPENDED";

export interface AdvertiserProfile {
  id: number;
  accountId: number;
  username?: string;
  companyName: string | null;
  status: AdvertiserStatus;
  balance: number;
  dailyLimit: number | null;
  approvedById?: number | null;
  approvedAt: string | null;
  createdAt: string;
}

export type AdStatus = "DRAFT" | "REVIEW" | "ACTIVE" | "REJECTED";

export interface Advertisement {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  /** Backend vẫn giữ tên trường sai chính tả này trong DTO để không phá hợp đồng API */
  linkReferfence: string;
  author?: { id: number; username: string; email: string };
  createdAt?: string;
}

export interface ApiEnvelope<T> {
  statusCode: number;
  message: string;
  data: T;
}
