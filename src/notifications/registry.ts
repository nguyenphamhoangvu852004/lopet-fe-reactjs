import type { Notification, NotificationObjectType } from "../types";

/**
 * Sổ đăng ký các loại thông báo — nơi DUY NHẤT định nghĩa một loại trông như thế
 * nào và bấm vào thì đi đâu.
 *
 * Ứng dụng chỉ hoạt động trong đúng tập loại khai báo ở đây: `Record` gõ theo
 * `NotificationObjectType` nên thêm một loại ở backend mà quên khai ở đây là
 * TypeScript báo lỗi ngay lúc build, chứ không phải lặng lẽ hiện ra một dòng
 * không bấm được như trước.
 *
 * Hợp đồng phía backend: notification/entity/NotificationObjectType.java.
 */
export interface NotificationKind {
  glyph: string;
  /** Nhãn ngắn để lọc/nhóm, không phải nội dung thông báo */
  label: string;
  /**
   * Đích điều hướng, hoặc `null` khi loại này không dẫn đi đâu.
   *
   * Nhận cả thông báo để tự quyết định dùng `objectId` hay `actorId` — hai loại
   * kết bạn dẫn tới NGƯỜI, còn bài viết thì dẫn tới ĐỐI TƯỢNG.
   */
  href: (notification: Notification) => string | null;
}

/** Thiếu id thì không dựng đường dẫn — thà không bấm được còn hơn dẫn tới /posts/undefined */
function withId(prefix: string, id?: number | null): string | null {
  return id ? `${prefix}/${id}` : null;
}

export const NOTIFICATION_KINDS: Record<NotificationObjectType, NotificationKind> =
  {
    POST_LIKE: {
      glyph: "❤️",
      label: "Lượt thích",
      href: (n) => withId("/posts", n.objectId),
    },
    POST_COMMENT: {
      glyph: "💬",
      label: "Bình luận",
      href: (n) => withId("/posts", n.objectId),
    },
    MESSAGE: {
      glyph: "✉️",
      label: "Tin nhắn",
      // Dẫn tới HỘI THOẠI với người gửi, không phải tới một tin nhắn lẻ: giao
      // diện chat mở theo người, và mở đúng đoạn chat là đủ để thấy tin mới.
      href: (n) => withId("/messages", n.actorId),
    },
    FRIEND_REQUEST: {
      glyph: "👋",
      label: "Lời mời kết bạn",
      // Trang bạn bè là nơi chấp nhận/từ chối được — đưa thẳng người dùng tới
      // chỗ hành động thay vì tới trang cá nhân rồi phải tự tìm.
      href: () => "/friends",
    },
    FRIEND_ACCEPTED: {
      glyph: "🤝",
      label: "Kết bạn",
      href: (n) => withId("/profile", n.actorId),
    },
    POST: {
      glyph: "🔔",
      label: "Hoạt động",
      // Loại cũ: không có objectId nào để mà mở. Xem chú thích ở types/index.ts
      href: () => null,
    },
  };

/** Loại không nhận ra (backend mới hơn frontend) rơi về hình dạng trung tính của POST */
export function notificationKind(notification: Notification): NotificationKind {
  return NOTIFICATION_KINDS[notification.type ?? "POST"] ?? NOTIFICATION_KINDS.POST;
}

/** Đích điều hướng của một thông báo, `null` nghĩa là không bấm được */
export function notificationHref(notification: Notification): string | null {
  return notificationKind(notification).href(notification);
}
