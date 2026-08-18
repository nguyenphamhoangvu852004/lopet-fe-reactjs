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

/**
 * Người thả tim — khớp `PostDtos.LikedPet`. Backend đã bỏ username/email khỏi
 * danh sách này: nó là chỗ ai cũng đọc được, nên không để lộ tài khoản đứng
 * sau con vật.
 */
export interface LikedPet {
  petId: number;
  handle: string;
  displayName: string;
  avatarUrl?: string;
}

/**
 * Khớp `PostDtos.PostListItem` — khoá chính là `postId`, KHÔNG phải `id`.
 *
 * TÁC GIẢ LÀ THÚ CƯNG: cột `posts.account_id` đã thành `posts.pet_id`, nên DTO
 * mang `petId` chứ không còn `accountId`. `petId` là id trong bảng `pets`,
 * KHÔNG phải `pet_profiles.id` — hồ sơ công khai đổi và khoá được, còn khoá
 * ngoại phải trỏ vào một danh tính bất biến.
 *
 * `petId` có thể null với dữ liệu cũ chưa di trú xong (backend giữ lại bài và
 * để `pet_id` rỗng thay vì xoá nội dung người dùng đã viết).
 *
 * Lưu ý: `PostByAccountItem` của backend không có `petId`, nên khi lấy bài theo
 * pet/tài khoản phải tự gắn lại ở tầng api (xem endpoints.ts).
 */
export interface Post {
  postId: number;
  petId?: number | null;
  content: string;
  groupId?: number | null;
  postType?: PostType;
  postScope?: PostScope;
  postMedias?: PostMedia[];
  likeAmount: number;
  /** Chỉ GET /v1/posts trả về; bản chi tiết dùng `listLike` */
  likeList?: LikedPet[];
  listLike?: LikedPet[];
  commentAmount?: number;
  shareAmount?: number;
  createdAt?: string;
  updatedAt?: string | null;
}

/**
 * Tác giả bình luận — khớp `CommentDtos.CommentPet`. `name` là tên thật của con
 * vật (`pets.name`), khác `profile.displayName` là tên hiện ra ngoài.
 */
export interface CommentPet {
  id: number;
  name: string;
  profile: PetProfileSummary & { id: number };
}

/**
 * Khớp `CommentDtos.CommentItem` — tác giả nằm trong `pet` (trước là `account`),
 * nội dung là `content`.
 */
export interface Comment {
  id: number;
  content: string;
  imageUrl?: string;
  replyToCommentId?: number;
  pet?: CommentPet;
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
 * Quan hệ của THÚ CƯNG ĐANG THAO TÁC với nhóm — backend tính sẵn từ `X-Pet-Id`
 * nên giao diện không phải tự suy từ danh sách thành viên (và không suy được, vì
 * danh sách bị che ở nhóm riêng tư).
 *
 * `NONE` gộp cả khách chưa đăng nhập và người chưa chọn thú cưng: cả ba trường
 * hợp đều "chưa dính gì tới nhóm này".
 */
export type GroupViewerStatus =
  | "NONE"
  | "PENDING_REQUEST"
  | "PENDING_INVITE"
  | "MEMBER";

/**
 * Thành viên nhóm — khớp `GroupDtos.GroupMemberView`.
 *
 * THÀNH VIÊN LÀ THÚ CƯNG: khoá chính của `group_members` đã đổi từ
 * `(group_id, account_id)` sang `(group_id, pet_id)`. Hệ quả có chủ đích: một
 * người có nhiều thú cưng thì mỗi con vào nhóm riêng, và vai trò OWNER/ADMIN
 * gắn vào con vật đang hoạt động chứ không vào người đứng sau nó.
 */
export interface GroupMember {
  groupId: number;
  petId: number;
  role: GroupMemberRole;
  /** `joinedAt` là lúc thành viên BẮT ĐẦU thật — hàng chờ được đóng dấu lại khi duyệt */
  joinedAt?: string;
  /**
   * Rỗng (các chuỗi "") khi con vật đã ngừng hoạt động: hàng thành viên vẫn còn
   * nhưng backend lọc pet đã xoá mềm khỏi kết quả nạp.
   */
  pet?: {
    petId: number | null;
    name: string;
    handle: string;
    displayName: string;
    avatarUrl: string;
  };
}

export interface Group {
  id: number;
  name: string;
  type: GroupType;
  bio?: string;
  coverUrl?: string;
  /** Id THÚ CƯNG làm chủ nhóm; backend trả 0 khi nhóm không có bản ghi OWNER */
  ownerPetId?: number;
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

/** Một thú cưng đang chờ quản trị nhóm duyệt — khớp `GroupDtos.PendingMemberView` */
export interface GroupJoinRequest {
  groupId: number;
  petId: number;
  pet?: GroupMember["pet"];
  requestedAt?: string;
}

/**
 * Một lời mời đang chờ chính thú cưng được mời trả lời — khớp
 * `GroupDtos.PendingInviteView`. Kèm tên nhóm nên hộp thư mời không phải gọi thêm
 * một vòng chi tiết nhóm cho từng dòng.
 */
export interface GroupInvite {
  groupId: number;
  groupName: string;
  groupType: GroupType;
  petId: number;
  /** Rỗng nếu thú cưng đã mời sau đó ngừng hoạt động */
  invitedBy?: GroupMember["pet"];
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
 * Sự kiện socket `message status` do backend đẩy NGƯỢC về người gửi
 * (message/MessageStatusNotifier). Gộp theo người gửi nên một lần đối phương
 * mở hội thoại chỉ tốn đúng một sự kiện, kèm danh sách id chứ không phải một
 * sự kiện cho mỗi tin.
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
 * `type` ở danh sách nhưng `objectType` ở payload socket — chuẩn hoá tại
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
 * Hồ sơ nhúng trong thông báo — khớp `NotificationDtos.NotificationProfile`.
 * Lấy từ `pet_profiles` chứ không còn từ hồ sơ tài khoản: nội dung dẫn tới từ
 * thông báo đều do thú cưng tạo ra. Tài khoản có nhiều thú cưng thì backend
 * chọn con có id nhỏ nhất.
 */
export interface NotificationProfile {
  id?: number;
  handle?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
}

/** Actor/receptor của thông báo vẫn là TÀI KHOẢN — hộp thông báo thuộc về người */
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
/** Xoá là xoá MỀM — không có giá trị "DELETED" vì nội dung vẫn trỏ tới pets.id */
export type PetStatus = "ACTIVE" | "DEACTIVATED";
export type PetProfileStatus = "ACTIVE" | "DEACTIVATED";
export type PetVisibility = "PUBLIC" | "FOLLOWERS" | "PRIVATE";

/**
 * Mô hình chia làm hai bảng và giao diện phải tôn trọng ranh giới đó:
 *
 *  - `Pet` (bảng `pets`) giữ dữ liệu SINH HỌC và quyền sở hữu: loài, giống,
 *    ngày sinh, giới tính, chủ. Chỉ chủ đọc đầy đủ.
 *  - `PetProfile` (bảng `pet_profiles`) là MẶT CÔNG KHAI: handle, displayName,
 *    avatar, cover, bio, visibility. Đây là thứ người lạ nhìn thấy.
 *
 * Vì thế `bio`/`visibility`/`avatarUrl` KHÔNG còn nằm trên `PetDetail` như bản
 * trước — chúng ở trong `profile`.
 */
export interface PetProfileSummary {
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  visibility: PetVisibility;
}

/** Khớp `PetDtos.PetDetail` — khoá chính là `petId`, KHÔNG phải `id` */
export interface PetDetail {
  petId: number;
  name: string;
  species: PetSpecies;
  breed?: string | null;
  gender: PetGender;
  dateOfBirth: string;
  status: PetStatus;
  /** Chủ sở hữu; quan hệ 1-N trực tiếp qua `pets.account_id`, không còn bảng nối */
  ownerAccountId?: number | null;
  profile: PetProfileSummary;
  createdAt?: string;
  updatedAt?: string | null;
}

/**
 * Khớp `PetDtos.PetListItem` của GET /v1/pets/me. Không có `ownerAccountId`:
 * danh sách này luôn là của chính người gọi.
 */
export interface PetListItem {
  petId: number;
  name: string;
  species: PetSpecies;
  breed?: string | null;
  gender: PetGender;
  dateOfBirth: string;
  status: PetStatus;
  profile: PetProfileSummary;
  createdAt?: string;
  updatedAt?: string | null;
}

/** Hồ sơ như người NGOÀI nhìn thấy — `PetProfileDtos.PublicPetProfile` */
export interface PublicPetProfile {
  petId: number;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  bio?: string | null;
  visibility: PetVisibility;
  createdAt?: string;
}

/** Hồ sơ như CHÍNH CHỦ nhìn thấy — thêm trạng thái và mốc cập nhật */
export interface OwnedPetProfile extends PublicPetProfile {
  status: PetProfileStatus;
  updatedAt?: string | null;
}

/**
 * Body của POST /v1/pets. Cố ý KHÔNG có `ownerId` hay `status` — backend suy
 * chủ sở hữu từ token. `visibility` chỉ nhận được ở bước TẠO (hồ sơ công khai
 * sinh cùng transaction); sau đó đổi qua PUT /v1/pet-profiles/:petId.
 */
export interface PetInput {
  name: string;
  species: PetSpecies;
  breed?: string | null;
  gender: PetGender;
  /** Định dạng yyyy-MM-dd; backend từ chối ngày ở tương lai */
  dateOfBirth: string;
  /** Bỏ trống thì backend mặc định PUBLIC. Chỉ dùng khi TẠO. */
  visibility?: PetVisibility;
}

/** Body của PUT /v1/pets/:petId — không có `visibility`, xem ghi chú ở PetInput */
export type PetUpdateInput = Omit<PetInput, "visibility">;

/**
 * Body JSON của PUT /v1/pet-profiles/:petId.
 *
 * Giao diện KHÔNG dùng biến thể này — nó gửi multipart để tải ảnh lên, cùng
 * luồng với hồ sơ tài khoản. Kiểu vẫn giữ lại vì endpoint JSON còn sống cho
 * client nào đã có sẵn URL ảnh.
 *
 * `avatarUrl`/`coverUrl`: bỏ trống = giữ nguyên ảnh cũ, chuỗi rỗng = xoá ảnh.
 */
export interface PetProfileInput {
  handle: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  visibility?: PetVisibility;
}
