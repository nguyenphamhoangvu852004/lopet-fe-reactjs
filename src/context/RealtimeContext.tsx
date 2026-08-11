import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_URL, TOKEN_KEY } from "../api/client";
import { useAuth } from "./AuthContext";
import type { Message, Notification } from "../types";

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

type MessageHandler = (message: Message, from: number) => void;

interface RealtimeValue {
  connected: boolean;
  /** Thông báo nhận được trong phiên, mới nhất đứng đầu */
  liveNotifications: Notification[];
  unreadNotifications: number;
  clearNotificationBadge: () => void;
  /** Đăng ký nhận tin nhắn đến; trả về hàm huỷ đăng ký */
  onMessage: (handler: MessageHandler) => () => void;
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

    socket.on("connect", () => setConnected(true));
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
      },
    );

    socket.on(
      EVENT_NOTIFICATION,
      (payload: Notification & { objectType?: string }) => {
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

  const value = useMemo<RealtimeValue>(
    () => ({
      connected,
      liveNotifications,
      unreadNotifications,
      clearNotificationBadge: () => setUnread(0),
      onMessage: (handler: MessageHandler) => {
        messageHandlers.current.add(handler);
        return () => {
          messageHandlers.current.delete(handler);
        };
      },
    }),
    [connected, liveNotifications, unreadNotifications],
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
