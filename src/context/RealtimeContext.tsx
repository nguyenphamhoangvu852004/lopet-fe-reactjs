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
import { Client, type IMessage } from "@stomp/stompjs";
import {
  refreshSession,
  SESSION_REFRESHED,
  TOKEN_KEY,
  WS_URL,
} from "../api/client";
import { messageApi } from "../api/endpoints";
import { useAuth } from "./AuthContext";
import type {
  Message,
  MessageStatusEvent,
  Notification,
  NotificationObjectType,
} from "../types";

/**
 * Kênh realtime của backend (lopet-be-java-springboot: realtime/WebSocketConfig).
 * STOMP over WebSocket ở endpoint `/ws`, dùng CHUNG cổng với REST.
 *
 * Bản trước dùng socket.io tới một server netty-socketio ở cổng riêng 8081.
 * Cả giao thức lẫn hình dạng hợp đồng đều đã đổi:
 *
 * - Token đi trong header `Authorization` của frame CONNECT, không phải
 *   `handshake.auth.token`.
 * - Không còn tự vào phòng `user_<id>`: client phải tự subscribe ba destination
 *   dưới đây. Server chặn nếu id trong destination không phải của chính mình,
 *   nên đây vừa là việc bắt buộc vừa là ranh giới bảo mật.
 * - Không còn tên sự kiện; destination đóng luôn vai trò đó. Lỗi chính tả
 *   "chat messsage" (ba chữ s) của bản cũ vì thế biến mất.
 * - Lỗi xác thực về ở frame ERROR (`frame.headers.message`) thay vì
 *   `connect_error`.
 */
const CHANNEL_CHAT = "chat";
const CHANNEL_NOTIFICATION = "notification";
/** Trạng thái tin nhắn đi NGƯỢC về người gửi: đã nhận / đã xem */
const CHANNEL_MESSAGE_STATUS = "message-status";

const userTopic = (accountId: number, channel: string) =>
  `/topic/user.${accountId}/${channel}`;

/** Hai ack do client gửi lên (message/MessageStompController ở backend) */
const APP_DELIVERED = "/app/message.delivered";
const APP_READ = "/app/message.read";

/** Thông điệp ở header `message` của frame ERROR khi server từ chối */
const TOKEN_EXPIRED = "TOKEN_EXPIRED";

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
  /** Báo "đã nhận" cho một lô tin; tự rơi về REST khi chưa kết nối */
  ackDelivered: (messageIds: number[]) => void;
  /** Báo "đã xem" toàn bộ hội thoại với `partnerId` */
  ackRead: (partnerId: number) => void;
}

const RealtimeContext = createContext<RealtimeValue | null>(null);

/**
 * Body của frame là JSON thô. Hỏng thì bỏ qua thay vì ném: exception thoát ra
 * khỏi callback của stompjs làm chết cả subscription, tức là mất realtime cho
 * tới lần kết nối lại — quá đắt cho một gói tin dị dạng.
 */
function parseFrame<T>(frame: IMessage): T | null {
  try {
    return JSON.parse(frame.body) as T;
  } catch {
    return null;
  }
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [liveNotifications, setLiveNotifications] = useState<Notification[]>(
    [],
  );
  const [unreadNotifications, setUnread] = useState(0);
  const clientRef = useRef<Client | null>(null);
  // Giữ handler trong ref để việc một trang đăng ký nghe tin nhắn không làm
  // dựng lại kết nối (dựng lại = mất kết nối, mất tin đang bay).
  const messageHandlers = useRef(new Set<MessageHandler>());
  const statusHandlers = useRef(new Set<StatusHandler>());

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!user || !token) {
      void clientRef.current?.deactivate();
      clientRef.current = null;
      setConnected(false);
      return;
    }

    const accountId = user.id;
    // Chỉ thử gia hạn MỘT lần cho mỗi vòng đời client: nếu token mới cũng bị
    // từ chối thì lỗi nằm ở chỗ khác, gia hạn tiếp chỉ là vòng lặp.
    let triedRefresh = false;

    const client = new Client({
      brokerURL: WS_URL,
      connectHeaders: { Authorization: `Bearer ${token}` },
      // Khớp heartbeat 25s của SimpleBroker ở backend. Thiếu nó thì proxy cắt
      // kết nối rảnh (nginx mặc định 60s) mà client không hề biết.
      heartbeatIncoming: 25_000,
      heartbeatOutgoing: 25_000,
      reconnectDelay: 5_000,
    });
    clientRef.current = client;

    client.onConnect = () => {
      setConnected(true);

      client.subscribe(userTopic(accountId, CHANNEL_CHAT), (frame) => {
        const payload = parseFrame<{
          message: Partial<Message>;
          from: number | string;
        }>(frame);
        if (!payload) return;

        // Payload này gửi id dưới dạng CHUỖI ("3") trong khi cả ứng dụng dùng
        // số: backend lấy `senderId` bằng String.valueOf(...) còn `receiverId`
        // đến từ multipart form. Trang chat so `=== activeId` (số) để biết tin
        // có thuộc hội thoại đang mở hay không, nên thiếu ép kiểu ở đây là
        // không bao giờ khớp — tin về tới nơi mà khung chat vẫn đứng im tới
        // khi tải lại trang.
        const from = Number(payload.from);
        const incoming = {
          ...payload.message,
          senderId: Number(payload.message?.senderId ?? from),
          receiverId: Number(payload.message?.receiverId ?? accountId),
        } as Message;
        messageHandlers.current.forEach((handler) => handler(incoming, from));

        // Ack "đã nhận" ngay tại đây chứ không ở trang chat: tin tới được
        // thiết bị là sự thật đã xảy ra rồi, dù người dùng đang ở trang nào
        // hay có mở đúng hội thoại đó hay không. Đặt ack trong trang chat
        // nghĩa là tin chỉ chuyển sang "đã nhận" khi đối phương tình cờ đang
        // mở đúng cửa sổ đó — tức là gần như không bao giờ.
        //
        // Ack ngay trên chính kết nối vừa nhận tin, không qua REST: đây là kết
        // nối vừa chứng minh mình còn sống.
        const id = Number(payload.message?.id);
        if (Number.isFinite(id) && id > 0) {
          client.publish({
            destination: APP_DELIVERED,
            body: JSON.stringify({ messageIds: [id] }),
          });
        }
      });

      client.subscribe(
        userTopic(accountId, CHANNEL_MESSAGE_STATUS),
        (frame) => {
          const payload = parseFrame<MessageStatusEvent>(frame);
          if (!payload) return;
          // Backend gộp theo người gửi nên payload luôn là một mảng id, kể cả
          // khi chỉ có một tin đổi trạng thái.
          const ids = (payload.messageIds ?? [])
            .map(Number)
            .filter(Number.isFinite);
          if (ids.length === 0) return;
          statusHandlers.current.forEach((handler) =>
            handler({
              ...payload,
              messageIds: ids,
              byUserId: Number(payload.byUserId),
            }),
          );
        },
      );

      client.subscribe(userTopic(accountId, CHANNEL_NOTIFICATION), (frame) => {
        const payload = parseFrame<
          Notification & { objectType?: NotificationObjectType }
        >(frame);
        if (!payload) return;
        setLiveNotifications((list) =>
          [
            { ...payload, type: payload.type ?? payload.objectType },
            ...list,
          ].slice(0, 50),
        );
        setUnread((n) => n + 1);
      });

      /**
       * Bù cho quãng thời gian offline, chạy ở ĐÂY chứ không ở trang chat.
       *
       * Tin gửi tới lúc mình đã đăng xuất thì không kết nối nào chuyển đi
       * được, nên chưa từng có ack nào cho chúng — và người gửi thấy "đã gửi"
       * mãi ngay cả sau khi mình đăng nhập lại. Đặt việc này trong trang
       * Messages thì nó chỉ chạy nếu người dùng tình cờ mở đúng trang đó; đăng
       * nhập rồi đứng ở Feed là trạng thái vẫn kẹt.
       *
       * Tải id về trước rồi mới ack: client ack đúng thứ nó thật sự cầm trong
       * tay, không phải server tự suy ra từ việc thấy có kết nối sống.
       */
      void messageApi
        .pendingDelivery()
        .then((ids) => {
          if (ids.length === 0) return;
          client.publish({
            destination: APP_DELIVERED,
            body: JSON.stringify({ messageIds: ids }),
          });
        })
        .catch(() => undefined);
    };

    client.onWebSocketClose = () => setConnected(false);
    client.onDisconnect = () => setConnected(false);

    /**
     * Server đóng kết nối ngay sau frame ERROR, rồi stompjs tự thử lại sau
     * `reconnectDelay`.
     *
     * - `TOKEN_EXPIRED`: KHÔNG dừng client. Gia hạn phiên, `SESSION_REFRESHED`
     *   thay `connectHeaders`, và chính lần thử lại có sẵn của stompjs sẽ dùng
     *   token mới — không phải tự dựng lại kết nối, không có tranh chấp giữa
     *   activate và deactivate.
     * - Còn lại (token sai, thiếu token, subscribe nhầm destination): thử lại
     *   với cùng dữ liệu chỉ tạo vòng lặp, nên dừng hẳn. Realtime im lặng tắt,
     *   REST vẫn hoạt động bình thường.
     */
    client.onStompError = (frame) => {
      setConnected(false);
      const reason = frame.headers["message"];
      if (reason === TOKEN_EXPIRED && !triedRefresh) {
        triedRefresh = true;
        void refreshSession().catch(() => undefined);
        return;
      }
      void client.deactivate();
    };

    client.activate();

    /**
     * Token đi vào frame CONNECT MỘT lần lúc kết nối. Khi interceptor gia hạn
     * phiên, token cũ trở thành vô dụng — kết nối đang sống thì không sao,
     * nhưng lần stompjs tự kết nối lại (mạng chớp, tab ngủ) nó gửi lại đúng
     * chuỗi cũ và bị server từ chối, realtime chết im lặng dù phiên còn hạn.
     */
    const onRefreshed = () => {
      const fresh = localStorage.getItem(TOKEN_KEY);
      if (!fresh) return;
      client.connectHeaders = { Authorization: `Bearer ${fresh}` };
      // Đã bị dừng vì token cũ bị từ chối: bật lại với token mới
      if (!client.active) client.activate();
    };
    window.addEventListener(SESSION_REFRESHED, onRefreshed);

    return () => {
      window.removeEventListener(SESSION_REFRESHED, onRefreshed);
      void client.deactivate();
      clientRef.current = null;
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

  // Hai ack dưới đây ưu tiên WebSocket và chỉ rơi về REST khi không có kết nối.
  // Cả hai đường đều dẫn tới cùng một service ở backend, nhưng REST tốn một
  // round-trip HTTP kèm xác thực lại token.
  const ackDelivered = useCallback((messageIds: number[]) => {
    const ids = messageIds.filter((id) => Number.isFinite(id) && id > 0);
    if (ids.length === 0) return;
    const client = clientRef.current;
    if (client?.connected) {
      client.publish({
        destination: APP_DELIVERED,
        body: JSON.stringify({ messageIds: ids }),
      });
      return;
    }
    // Nuốt lỗi: ack hỏng chỉ làm trạng thái chậm một nhịp, không đáng để đẩy
    // một thông báo lỗi vào mặt người dùng.
    void messageApi.markDelivered(ids).catch(() => undefined);
  }, []);

  const ackRead = useCallback((partnerId: number) => {
    const client = clientRef.current;
    if (client?.connected) {
      client.publish({
        destination: APP_READ,
        body: JSON.stringify({ partnerId }),
      });
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
