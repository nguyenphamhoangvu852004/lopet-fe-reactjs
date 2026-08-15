import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_URL, TOKEN_KEY } from "../api/client";
import { messageApi } from "../api/endpoints";
import { useAuth } from "./AuthContext";
import type {
  Message,
  MessageStatusEvent,
  Notification,
  NotificationObjectType,
} from "../types";

/**
 * Kênh realtime của backend (lopet-be-java-springboot: realtime/SocketIoConfig).
 * Chạy ở cổng riêng SOCKET_URL, không phải cổng REST.
 *
 * Server xác thực bằng `handshake.auth.token` rồi tự cho socket vào phòng
 * `user_<id>`, nên client không cần join gì thêm để nhận tin của chính mình.
 *
 * Tên sự kiện giữ đúng như server phát ra, kể cả chỗ gõ sai chính tả
 * ("chat messsage") — đổi ở đây là mất tin.
 */
const EVENT_MESSAGE = "chat messsage";
const EVENT_NOTIFICATION = "notification";
/** Trạng thái tin nhắn đi NGƯỢC về người gửi: đã nhận / đã xem */
const EVENT_MESSAGE_STATUS = "message status";
/** Hai ack do client phát lên (message/MessageSocketHandlers ở backend) */
const CLIENT_EVENT_DELIVERED = "message delivered";
const CLIENT_EVENT_READ = "message read";

type MessageHandler = (message: Message, from: number) => void;
type StatusHandler = (event: MessageStatusEvent) => void;

interface RealtimeValue {
  connected: boolean;
  /** Thông báo nhận được trong phiên, mới nhất đứng đầu */
  liveNotifications: Notification[];
  unreadNotifications: number;
  clearNotificationBadge: () => void;
  /** Đăng ký nhận tin nhắn đến; trả về hàm huỷ đăng ký */
  onMessage: (handler: MessageHandler) => () => void;
  /** Đăng ký nhận đổi trạng thái tin MÌNH đã gửi; trả về hàm huỷ đăng ký */
  onMessageStatus: (handler: StatusHandler) => () => void;
  /** Báo "đã nhận" cho một lô tin; tự rơi về REST khi socket chưa kết nối */
  ackDelivered: (messageIds: number[]) => void;
  /** Báo "đã xem" toàn bộ hội thoại với `partnerId` */
  ackRead: (partnerId: number) => void;
}

const RealtimeContext = createContext<RealtimeValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [liveNotifications, setLiveNotifications] = useState<Notification[]>(
    [],
  );
  const [unreadNotifications, setUnread] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  // Giữ handler trong ref để việc một trang đăng ký nghe tin nhắn không làm
  // dựng lại socket (dựng lại = mất kết nối, mất tin đang bay).
  const messageHandlers = useRef(new Set<MessageHandler>());
  const statusHandlers = useRef(new Set<StatusHandler>());

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!user || !token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      /**
       * Bù cho quãng thời gian offline, chạy ở ĐÂY chứ không ở trang chat.
       *
       * Tin gửi tới lúc mình đã đăng xuất thì không socket nào chuyển đi được,
       * nên chưa từng có ack nào cho chúng — và người gửi thấy "đã gửi" mãi
       * ngay cả sau khi mình đăng nhập lại. Đặt việc này trong trang Messages
       * thì nó chỉ chạy nếu người dùng tình cờ mở đúng trang đó; đăng nhập rồi
       * đứng ở Feed là trạng thái vẫn kẹt.
       *
       * Tải id về trước rồi mới ack: client ack đúng thứ nó thật sự cầm trong
       * tay, không phải server tự suy ra từ việc thấy có kết nối sống.
       */
      void messageApi
        .pendingDelivery()
        .then((ids) => {
          if (ids.length === 0) return;
          socket.emit(CLIENT_EVENT_DELIVERED, { messageIds: ids });
        })
        .catch(() => undefined);
    });
    socket.on("disconnect", () => setConnected(false));
    // Token hỏng/hết hạn: im lặng bỏ realtime, REST vẫn hoạt động bình thường
    socket.on("connect_error", () => setConnected(false));

    socket.on(
      EVENT_MESSAGE,
      (payload: { message: Partial<Message>; from: number | string }) => {
        // Payload này gửi id dưới dạng CHUỖI ("3") trong khi cả ứng dụng dùng số:
        // backend lấy `senderId` bằng String.valueOf(...) còn `receiverId` đến từ
        // multipart form. Trang chat so `=== activeId` (số) để biết tin có thuộc
        // hội thoại đang mở hay không, nên thiếu ép kiểu ở đây là không bao giờ
        // khớp — tin về tới nơi mà khung chat vẫn đứng im tới khi tải lại trang.
        const from = Number(payload.from);
        const incoming = {
          ...payload.message,
          senderId: Number(payload.message?.senderId ?? from),
          receiverId: Number(payload.message?.receiverId ?? user.id),
        } as Message;
        messageHandlers.current.forEach((handler) => handler(incoming, from));

        // Ack "đã nhận" ngay tại đây chứ không ở trang chat: tin tới được
        // thiết bị là sự thật đã xảy ra rồi, dù người dùng đang ở trang nào
        // hay có mở đúng hội thoại đó hay không. Đặt ack trong trang chat
        // nghĩa là tin chỉ chuyển sang "đã nhận" khi đối phương tình cờ đang
        // mở đúng cửa sổ đó — tức là gần như không bao giờ.
        //
        // Ack ngay trên chính socket vừa nhận tin, không qua REST: đây là kết
        // nối vừa chứng minh mình còn sống.
        const id = Number(payload.message?.id);
        if (Number.isFinite(id) && id > 0) {
          socket.emit(CLIENT_EVENT_DELIVERED, { messageIds: [id] });
        }
      },
    );

    socket.on(EVENT_MESSAGE_STATUS, (payload: MessageStatusEvent) => {
      // Backend gộp theo người gửi nên payload luôn là một mảng id, kể cả khi
      // chỉ có một tin đổi trạng thái.
      const ids = (payload?.messageIds ?? []).map(Number).filter(Number.isFinite);
      if (ids.length === 0) return;
      statusHandlers.current.forEach((handler) =>
        handler({ ...payload, messageIds: ids, byUserId: Number(payload.byUserId) }),
      );
    });

    socket.on(
      EVENT_NOTIFICATION,
      (payload: Notification & { objectType?: NotificationObjectType }) => {
        setLiveNotifications((list) =>
          [{ ...payload, type: payload.type ?? payload.objectType }, ...list].slice(
            0,
            50,
          ),
        );
        setUnread((n) => n + 1);
      },
    );

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  /**
   * Năm hàm dưới đây phải ỔN ĐỊNH qua các lần render, không được nằm thẳng
   * trong useMemo bên dưới.
   *
   * Chúng đều đi vào deps của useCallback/useEffect ở trang chat. Nếu danh
   * tính đổi mỗi khi có một thông báo mới bay về (và mỗi tin nhắn đều kèm một
   * thông báo), thì `loadConversations` bị dựng lại và cả danh sách hội thoại
   * được tải lại từ đầu — mỗi lần là một request cho mỗi người bạn, chỉ để lấy
   * đúng dữ liệu vừa có. Kèm theo đó là đăng ký lại listener liên tục.
   *
   * Mọi state chúng cần đều nằm trong ref hoặc trong setState dạng hàm, nên
   * deps rỗng ở đây không giữ lại giá trị cũ nào cả.
   */
  const clearNotificationBadge = useCallback(() => setUnread(0), []);

  const onMessage = useCallback((handler: MessageHandler) => {
    messageHandlers.current.add(handler);
    return () => {
      messageHandlers.current.delete(handler);
    };
  }, []);

  const onMessageStatus = useCallback((handler: StatusHandler) => {
    statusHandlers.current.add(handler);
    return () => {
      statusHandlers.current.delete(handler);
    };
  }, []);

  // Hai ack dưới đây ưu tiên socket và chỉ rơi về REST khi không có kết nối.
  // Cả hai đường đều dẫn tới cùng một service ở backend, nhưng REST tốn một
  // round-trip HTTP kèm xác thực lại token.
  const ackDelivered = useCallback((messageIds: number[]) => {
    const ids = messageIds.filter((id) => Number.isFinite(id) && id > 0);
    if (ids.length === 0) return;
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit(CLIENT_EVENT_DELIVERED, { messageIds: ids });
      return;
    }
    // Nuốt lỗi: ack hỏng chỉ làm trạng thái chậm một nhịp, không đáng để đẩy
    // một thông báo lỗi vào mặt người dùng.
    void messageApi.markDelivered(ids).catch(() => undefined);
  }, []);

  const ackRead = useCallback((partnerId: number) => {
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit(CLIENT_EVENT_READ, { partnerId });
      return;
    }
    void messageApi.markConversationRead(partnerId).catch(() => undefined);
  }, []);

  const value = useMemo<RealtimeValue>(
    () => ({
      connected,
      liveNotifications,
      unreadNotifications,
      clearNotificationBadge,
      onMessage,
      onMessageStatus,
      ackDelivered,
      ackRead,
    }),
    [
      connected,
      liveNotifications,
      unreadNotifications,
      clearNotificationBadge,
      onMessage,
      onMessageStatus,
      ackDelivered,
      ackRead,
    ],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime phải nằm trong <RealtimeProvider>");
  return ctx;
}
