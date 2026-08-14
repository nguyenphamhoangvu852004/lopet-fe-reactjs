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

export interface PostAuthorLite {
  id: number;
  username: string;
  email?: string;
}

/**
 * Khớp GetPostOutputDTO — khoá chính là `postId`, KHÔNG phải `id`.
 *
 * Lưu ý: GetPostByAccountIdOutputDTO của backend không có trường `accountId`,
 * nên khi lấy bài theo tài khoản phải tự gắn lại ở tầng api (xem endpoints.ts).
 */
export interface Post {
  postId: number;
  accountId: number;
  content: string;
  groupId?: number | null;
  postType?: PostType;
  postScope?: PostScope;
  postMedias?: PostMedia[];
  likeAmount: number;
  /** Chỉ GET /v1/posts trả về; bản chi tiết dùng `listLike` */
  likeList?: PostAuthorLite[];
  listLike?: PostAuthorLite[];
  commentAmount?: number;
  shareAmount?: number;
  createdAt?: string;
  updatedAt?: string | null;
}

/** Khớp CommentOutputDTO — tác giả nằm trong `account`, nội dung là `content` */
export interface Comment {
  id: number;
  content: string;
  imageUrl?: string;
  replyToCommentId?: number;
  account?: Account;
  createdAt?: string;
}

/** GET /v1/comments/:postId trả về bọc thêm một lớp */
export interface CommentBundle {
  postId: number;
  comments: Comment[];
}

export type GroupType = "PUBLIC" | "PRIVATE";
export type GroupMemberRole = "OWNER" | "ADMIN" | "MEMBER";

/** GET /v1/groups/:id trả entity Groups kèm quan hệ members */
export interface GroupMember {
  groupId: number;
  accountId: number;
  role: GroupMemberRole;
  joinedAt?: string;
  account?: { id: number; username?: string; profile?: Profile | null };
}

export interface Group {
  id: number;
  name: string;
  type: GroupType;
  bio?: string;
  coverUrl?: string;
  ownerId?: number;
  owner?: number;
  totalMembers?: number;
  members?: GroupMember[];
  createdAt?: string;
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
}

export type NotificationObjectType = "POST" | "MESSAGE";
export type NotificationStatus = "SENT" | "DELIVERED" | "READ";

/**
 * Backend gọi khoá chính là `notificationId` (không phải `id`) và gọi loại là
 * `type` ở danh sách nhưng `objectType` ở payload socket — chuẩn hoá tại
 * endpoints.ts để phần còn lại của app chỉ thấy một hình dạng.
 */
export interface Notification {
  notificationId: number;
  actorId?: number;
  receptorId?: number;
  content: string;
  status?: NotificationStatus | string;
  type?: string;
  createdAt?: string;
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

/* ─────────────────────────── pets ──────────────────────────── */

export type PetSpecies =
  | "DOG"
  | "CAT"
  | "BIRD"
  | "RABBIT"
  | "HAMSTER"
  | "FISH"
  | "REPTILE"
  | "OTHER";
export type PetGender = "MALE" | "FEMALE" | "UNKNOWN";
export type PetStatus = "ACTIVE" | "ARCHIVED";
export type PetVisibility = "PUBLIC" | "FOLLOWERS" | "PRIVATE";
export type PetOwnershipType = "PRIMARY_OWNER" | "CO_OWNER";

/**
 * Khớp PetDtos.PetDetail — khoá chính là `petId`, KHÔNG phải `id` (cùng quy ước
 * với Post). Quan hệ sở hữu nằm ở bảng `pet_ownerships`, nên hồ sơ không có
 * trường `ownerId`; backend suy ra `primaryOwnerId` khi trả về.
 */
export interface PetDetail {
  petId: number;
  name: string;
  species: PetSpecies;
  breed?: string | null;
  gender: PetGender;
  dateOfBirth: string;
  bio?: string | null;
  status: PetStatus;
  visibility: PetVisibility;
  /** Chỉ tài khoản này mới lưu trữ được hồ sơ; co-owner thì không */
  primaryOwnerId?: number | null;
  createdAt?: string;
  updatedAt?: string | null;
}

/**
 * Khớp PetDtos.PetListItem của GET /v1/pets/me. Không có `bio` và
 * `primaryOwnerId`; bù lại có `myOwnershipType` = vai trò của chính người gọi.
 */
export interface PetListItem {
  petId: number;
  name: string;
  species: PetSpecies;
  breed?: string | null;
  gender: PetGender;
  dateOfBirth: string;
  status: PetStatus;
  visibility: PetVisibility;
  myOwnershipType: PetOwnershipType;
  createdAt?: string;
  updatedAt?: string | null;
}

/**
 * Body của POST/PUT /v1/pets. Cố ý KHÔNG có `ownerId`, `ownershipType`,
 * `status`, `petId` hay các cột thời gian — backend quản lý chúng và DTO phía
 * server cũng không khai, gửi thêm chỉ bị bỏ qua.
 */
export interface PetInput {
  name: string;
  species: PetSpecies;
  breed?: string | null;
  gender: PetGender;
  /** Định dạng yyyy-MM-dd; backend từ chối ngày ở tương lai */
  dateOfBirth: string;
  bio?: string | null;
  /** Bỏ trống thì backend mặc định PUBLIC */
  visibility?: PetVisibility;
}
