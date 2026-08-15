import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage, isForbidden } from "../api/client";
import { friendApi, messageApi } from "../api/endpoints";
import { Alert, Avatar, Badge, Button, EmptyState, Spinner } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import type { FriendEntry, Message, MessageStatus } from "../types";

/**
 * Backend trả hội thoại theo `createdAt DESC` (MessageRepoImpl.getListMessage),
 * tức tin MỚI NHẤT đứng đầu mảng. Mọi ứng dụng nhắn tin đều hiển thị ngược lại,
 * nên phải sắp xếp tăng dần trước khi render — nếu không cả đoạn chat bị lật.
 */
function sortAscending(list: Message[]): Message[] {
  return [...list].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ta !== tb) return ta - tb;
    // Cùng mốc thời gian (giây) thì id tăng dần phản ánh đúng thứ tự ghi
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

/**
 * Nâng trạng thái của một tin lên mức cao hơn, kèm mốc thời gian tương ứng.
 * Không bao giờ hạ cấp: hai sự kiện tới ngược thứ tự vì mạng không được phép
 * kéo "đã xem" lùi về "đã nhận".
 */
function upgrade(
  message: Message,
  status: MessageStatus,
  at?: string | null,
): Message {
  if (STATUS_RANK[status] <= STATUS_RANK[message.status]) return message;
  return {
    ...message,
    status,
    ...(status === "READ"
      ? { readAt: at ?? message.readAt }
      : { deliveredAt: at ?? message.deliveredAt }),
  };
}

function startOfDay(iso?: string) {
  const date = iso ? new Date(iso) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayLabel(iso?: string) {
  const today = startOfDay(new Date().toISOString());
  const day = startOfDay(iso);
  const dayMs = 86_400_000;
  if (day === today) return "Hôm nay";
  if (day === today - dayMs) return "Hôm qua";
  return new Date(day).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function clockTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Nhãn thời gian ngắn cho danh sách hội thoại, kiểu Messenger */
function shortTime(iso?: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày`;
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Bậc của vòng đời SENT → DELIVERED → READ; chỉ được đi lên, không đi xuống */
const STATUS_RANK: Record<MessageStatus, number> = {
  SENT: 0,
  DELIVERED: 1,
  READ: 2,
};

/**
 * Nhãn dưới bong bóng tin của chính mình, theo đúng ba mức backend giữ trong
 * cột `status`:
 *
 *   SENT      máy chủ đã nhận, nhưng thiết bị người kia thì chưa
 *   DELIVERED tin đã tới một thiết bị đang mở của người kia
 *   READ      người kia đã mở hội thoại và nhìn thấy
 *
 * Id âm là bong bóng lạc quan do `send()` dựng ra trước khi API trả về — chưa
 * có bản ghi nào ở backend nên chưa có trạng thái nào để mà hiển thị.
 */
function statusLabel(message: Message): string {
  if (message.id < 0) return "Đang gửi";
  switch (message.status) {
    case "READ":
      return "Đã xem";
    case "DELIVERED":
      return "Đã nhận";
    default:
      return "Đã gửi";
  }
}

interface Conversation {
  friend: FriendEntry;
  lastMessage?: Message;
  unread: number;
  /** Tin người kia gửi cho mình, dùng để gom ack "đã nhận" thành một lô */
  pending: Message[];
}

export function MessagesPage() {
  const { peerId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { connected, onMessage, onMessageStatus, ackDelivered, ackRead } =
    useRealtime();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Người đang mở chat, giữ trong ref để handler socket không cần dựng lại
  const activeIdRef = useRef<number | null>(null);
  const stickToBottom = useRef(true);
  /**
   * Trạng thái đến qua socket, giữ lại theo id tin nhắn.
   *
   * Cần cái này vì sự kiện `message status` thường về TRƯỚC khi danh sách tin
   * chứa tin vừa gửi: `send()` phải đợi `loadThread()` mới biết id thật, trong
   * khi đối phương ack "đã nhận" chỉ sau vài chục ms. Sự kiện tới lúc đó không
   * khớp được với tin nào trong state và sẽ mất luôn — còn `loadThread` thì có
   * thể đọc trúng snapshot chụp trước lúc UPDATE commit, tức là trả về SENT.
   * Kết quả: tin đứng mãi ở "Đã gửi" dù đối phương đã nhận.
   *
   * Nhớ ở đây rồi áp lại lên mọi danh sách nạp từ server thì thứ tự đến của hai
   * đường (HTTP và socket) không còn quan trọng nữa.
   */
  const statusOverrides = useRef(
    new Map<number, { status: MessageStatus; at?: string | null }>(),
  );

  const activeId = peerId ? Number(peerId) : null;
  activeIdRef.current = activeId;

  const active = conversations.find((c) => c.friend.id === activeId)?.friend;

  /**
   * Khi vào thẳng /messages/:id, danh sách hội thoại chưa tải xong nên chưa
   * biết tên người kia. Vẫn dựng khung chat với chỗ trống tạm thay vì hiện
   * "Chọn một cuộc trò chuyện" — vừa đỡ nháy, vừa để khung cuộn tồn tại sẵn khi
   * tin nhắn về.
   */
  const peer: FriendEntry | null = activeId
    ? (active ?? { id: activeId, username: "…" })
    : null;

  /**
   * Nạp danh sách hội thoại: backend không có endpoint "danh sách hội thoại",
   * chỉ có danh sách bạn bè và lịch sử theo từng người, nên phải ghép ở client.
   */
  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      const data = await friendApi.listOf(user.id);
      const friends = data?.others ?? [];

      const rows = await Promise.all(
        friends.map(async (friend) => {
          const thread = await messageApi
            .conversation(friend.id)
            .catch(() => [] as Message[]);
          const ordered = sortAscending(thread);
          const toMe = ordered.filter((m) => m.receiverId === user.id);
          return {
            friend,
            lastMessage: ordered[ordered.length - 1],
            unread: toMe.filter((m) => m.status !== "READ").length,
            // Chỉ dùng để gom ack bên dưới, không hiển thị ở đâu cả
            pending: toMe.filter((m) => m.id > 0),
          } satisfies Conversation;
        }),
      );

      /**
       * Ack "đã nhận" cho mọi tin còn SENT gửi tới mình, trên TẤT CẢ hội thoại
       * chứ không riêng cái đang mở.
       *
       * Đây là đường bù cho khoảng thời gian offline: tin đến lúc app đóng thì
       * không có socket nào nhận để mà ack tại chỗ, nên phải quét lại ở lần
       * tải danh sách đầu tiên. Gộp thành MỘT request cho tất cả — backend
       * nhận cả lô và chỉ bắn một sự kiện cho mỗi người gửi.
       */
      const chuaBaoNhan = rows.flatMap((row) =>
        row.pending.filter((m) => m.status === "SENT").map((m) => m.id),
      );
      if (chuaBaoNhan.length > 0) ackDelivered(chuaBaoNhan);

      // Hội thoại có tin mới nhất lên đầu; người chưa từng nhắn xuống cuối
      rows.sort((a, b) => {
        const ta = a.lastMessage?.createdAt
          ? new Date(a.lastMessage.createdAt).getTime()
          : 0;
        const tb = b.lastMessage?.createdAt
          ? new Date(b.lastMessage.createdAt).getTime()
          : 0;
        return tb - ta;
      });
      setConversations(rows);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user, ackDelivered]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  /**
   * Đánh dấu đã xem những tin do người kia gửi.
   *
   * Một lời gọi cho CẢ hội thoại, không phải mỗi tin một request: backend có
   * sẵn `PATCH /v1/messages/read?partnerId=` làm đúng việc đó trong một câu
   * UPDATE, và chỉ bắn đúng một sự kiện socket về người gửi thay vì n cái.
   */
  const markRead = useCallback(
    (list: Message[]) => {
      const partnerId = activeIdRef.current;
      if (!partnerId || !user) return;
      const chuaXem = list.some(
        (m) => m.id > 0 && m.receiverId === user.id && m.status !== "READ",
      );
      if (!chuaXem) return;

      ackRead(partnerId);
      // Cập nhật lạc quan: sự kiện `message status` chỉ quay về NGƯỜI GỬI, phía
      // mình không nhận được gì để mà đợi.
      setMessages((current) =>
        current.map((m) =>
          m.receiverId === user.id && m.status !== "READ"
            ? { ...m, status: "READ" as const, readAt: new Date().toISOString() }
            : m,
        ),
      );
      setConversations((rows) =>
        rows.map((row) =>
          row.friend.id === partnerId ? { ...row, unread: 0 } : row,
        ),
      );
    },
    [user, ackRead],
  );

  const loadThread = useCallback(
    async (targetId: number, silent = false) => {
      if (!silent) setLoadingThread(true);
      try {
        const list = sortAscending(await messageApi.conversation(targetId)).map(
          (m) => {
            const pending = statusOverrides.current.get(m.id);
            if (!pending) return m;
            // Server đã bắt kịp thì bỏ override đi cho map khỏi phình theo phiên
            if (STATUS_RANK[m.status] >= STATUS_RANK[pending.status]) {
              statusOverrides.current.delete(m.id);
              return m;
            }
            return upgrade(m, pending.status, pending.at);
          },
        );
        setMessages(list);
        setError("");
        markRead(list);
      } catch (e) {
        setMessages([]);
        // 403 ở đây nghĩa là không phải một bên của hội thoại
        setError(
          isForbidden(e)
            ? "Bạn không thuộc cuộc trò chuyện này."
            : errorMessage(e),
        );
      } finally {
        setLoadingThread(false);
      }
    },
    [markRead],
  );

  useEffect(() => {
    if (activeId) {
      stickToBottom.current = true;
      void loadThread(activeId);
    } else {
      setMessages([]);
    }
  }, [activeId, loadThread]);

  /**
   * Tin đến qua socket. Payload chỉ có { content, senderId, receiverId,
   * imageUrl } — thiếu id, createdAt và status — nên không dựng bong bóng từ nó
   * mà nạp lại hội thoại để lấy bản đầy đủ.
   */
  useEffect(
    () =>
      onMessage((_incoming, from) => {
        if (activeIdRef.current === from) {
          stickToBottom.current = true;
          void loadThread(from, true);
        }
        void loadConversations();
      }),
    [onMessage, loadThread, loadConversations],
  );

  /**
   * Trạng thái tin MÌNH đã gửi vừa đổi (đối phương nhận được, hoặc mở hội
   * thoại ra xem). Vá thẳng vào state thay vì tải lại hội thoại: sự kiện đã
   * mang đủ id, trạng thái mới và mốc thời gian, mà tải lại thì vừa tốn một
   * request vừa làm khung chat nháy giữa lúc đang đọc.
   *
   * Không hạ cấp trạng thái ở đây — thứ tự SENT → DELIVERED → READ chỉ đi một
   * chiều (backend giữ đúng luật đó trong MessageStatus.isAtLeast). Hai sự
   * kiện tới ngược thứ tự vì mạng thì sự kiện cũ hơn phải bị bỏ qua, không
   * được phép kéo "đã xem" lùi về "đã nhận".
   */
  useEffect(
    () =>
      onMessageStatus((event) => {
        for (const id of event.messageIds) {
          const known = statusOverrides.current.get(id);
          if (!known || STATUS_RANK[event.status] > STATUS_RANK[known.status]) {
            statusOverrides.current.set(id, {
              status: event.status,
              at: event.at,
            });
          }
        }
        const ids = new Set(event.messageIds);
        setMessages((current) =>
          current.map((m) =>
            ids.has(m.id) ? upgrade(m, event.status, event.at) : m,
          ),
        );
      }),
    [onMessageStatus],
  );

  /**
   * Chỉ tự cuộn khi người dùng đang ở gần đáy, tránh giật khi đang đọc lại.
   *
   * Cuộn trong hai khung hình liên tiếp: đặt scrollTop ngay trong effect thì
   * chiều cao vẫn còn thay đổi (ảnh đại diện, dòng trạng thái vừa thêm) nên tin
   * cuối hay bị hụt mất một đoạn.
   */
  useEffect(() => {
    if (!stickToBottom.current) return;
    const toBottom = () => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    };
    toBottom();
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(toBottom),
    );
    return () => cancelAnimationFrame(frame);
    // loadingThread nằm trong deps là bắt buộc: khi tải xong, khung đang hiện
    // spinner mới đổi sang danh sách tin thật. Lần render đó `messages` không
    // thay đổi, nên nếu chỉ phụ thuộc `messages` thì lần mở đầu tiên sẽ đứng ở
    // đầu hội thoại thay vì nhảy xuống tin mới nhất.
  }, [messages, loadingThread]);

  /**
   * Ghim đáy khi chiều cao còn đổi SAU lúc vẽ: trên mobile khung dùng dvh cộng
   * safe-area nên kích thước thật chỉ chốt sau vài khung hình, và ảnh trong tin
   * nhắn cũng đẩy chiều cao khi tải xong.
   *
   * Gắn qua callback ref chứ không qua useEffect: khi mở thẳng link
   * /messages/:id, khung chat chỉ xuất hiện sau lúc danh sách hội thoại tải
   * xong, nên effect chạy sớm sẽ thấy ref rỗng và không bao giờ gắn lại được.
   */
  const attachScroller = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    observerRef.current?.disconnect();
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    // React gán ref của con trước ref của cha nên contentRef đã sẵn sàng ở đây
    if (contentRef.current) observer.observe(contentRef.current);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  function onScroll() {
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickToBottom.current = distance < 80;
  }

  function autoGrow() {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
  }

  async function send() {
    if ((!draft.trim() && !attachment) || !activeId || sending) return;
    const content = draft;
    const image = attachment;

    // Gửi lạc quan: hiện bong bóng ngay, đối chiếu lại sau khi API trả về
    const optimistic: Message = {
      id: -Date.now(),
      content,
      senderId: user!.id,
      receiverId: activeId,
      mediaUrl: image ? URL.createObjectURL(image) : undefined,
      status: "SENT",
      createdAt: new Date().toISOString(),
    };
    stickToBottom.current = true;
    setMessages((list) => [...list, optimistic]);
    setDraft("");
    setAttachment(null);
    if (fileRef.current) fileRef.current.value = "";
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setSending(true);

    try {
      const form = new FormData();
      form.append("content", content);
      form.append("receiverId", String(activeId));
      if (image) form.append("image", image);
      // senderId lấy từ token ở backend
      // Thông báo cho người nhận do backend bắn trong MessageService.create,
      // cùng transaction với chính tin nhắn
      await messageApi.send(form);
      await loadThread(activeId, true);
      void loadConversations();
    } catch (e) {
      // Gỡ bong bóng lạc quan và trả nội dung về ô soạn để không mất chữ
      setMessages((list) => list.filter((m) => m.id !== optimistic.id));
      setDraft(content);
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  /** Chia tin theo ngày rồi theo cụm người gửi liên tiếp */
  const days = useMemo(() => {
    const result: { key: number; label: string; groups: Message[][] }[] = [];
    for (const message of messages) {
      const key = startOfDay(message.createdAt);
      let day = result[result.length - 1];
      if (!day || day.key !== key) {
        day = { key, label: dayLabel(message.createdAt), groups: [] };
        result.push(day);
      }
      const lastGroup = day.groups[day.groups.length - 1];
      const previous = lastGroup?.[lastGroup.length - 1];
      const sameSender = previous?.senderId === message.senderId;
      const closeInTime =
        previous?.createdAt && message.createdAt
          ? new Date(message.createdAt).getTime() -
              new Date(previous.createdAt).getTime() <
            GROUP_WINDOW_MS
          : true;
      if (lastGroup && sameSender && closeInTime) lastGroup.push(message);
      else day.groups.push([message]);
    }
    return result;
  }, [messages]);

  /** Chỉ tin cuối cùng của mình mới hiện trạng thái, giống Messenger */
  const lastOwn = [...messages].reverse().find((m) => m.senderId === user?.id);

  const visibleConversations = query.trim()
    ? conversations.filter((row) =>
        row.friend.username.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : conversations;

  const totalUnread = conversations.reduce((sum, row) => sum + row.unread, 0);

  if (loading) return <Spinner />;

  return (
    // has-active để màn hình hẹp biết đang mở đoạn chat nào mà ẩn bớt một khung
    <div className={`messenger ${activeId ? "has-active" : ""}`}>
      <aside className="conv-pane">
        <div className="conv-head">
          <div className="row-between">
            <div className="card-title">
              Đoạn chat
              {totalUnread > 0 && <span className="pill">{totalUnread}</span>}
            </div>
            <Badge tone={connected ? "ok" : "warn"}>
              {connected ? "Trực tuyến" : "Ngoại tuyến"}
            </Badge>
          </div>
          <input
            className="input"
            placeholder="Tìm trong tin nhắn…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="conv-list">
          {visibleConversations.length === 0 && (
            <div className="faint" style={{ padding: 12 }}>
              {conversations.length === 0
                ? "Chưa có bạn bè để nhắn tin"
                : "Không tìm thấy đoạn chat nào"}
            </div>
          )}
          {visibleConversations.map((row) => {
            const mine = row.lastMessage?.senderId === user?.id;
            const preview = row.lastMessage
              ? `${mine ? "Bạn: " : ""}${
                  row.lastMessage.content ||
                  (row.lastMessage.mediaUrl ? "Đã gửi một ảnh" : "")
                }`
              : "Bắt đầu cuộc trò chuyện";
            return (
              <button
                key={row.friend.id}
                onClick={() => navigate(`/messages/${row.friend.id}`)}
                className={`conv-item ${activeId === row.friend.id ? "active" : ""} ${
                  row.unread > 0 ? "unread" : ""
                }`}
              >
                <Avatar
                  src={row.friend.imageUrl}
                  name={row.friend.username}
                  size={44}
                />
                <div className="grow truncate">
                  <div className="conv-name truncate">
                    {row.friend.username}
                  </div>
                  <div className="conv-preview truncate">{preview}</div>
                </div>
                <div className="conv-meta">
                  <span className="faint">
                    {shortTime(row.lastMessage?.createdAt)}
                  </span>
                  {row.unread > 0 && <span className="dot" />}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="chat-pane">
        {!peer ? (
          <div className="chat-empty">
            <EmptyState
              icon="💬"
              title="Chọn một cuộc trò chuyện"
              hint="Chỉ người gửi và người nhận đọc được nội dung"
            />
          </div>
        ) : (
          <>
            <header className="chat-header">
              {/* Trên mobile chỉ hiện một khung, nên phải có đường quay lại
                  danh sách hội thoại; trên desktop nút này bị ẩn */}
              <Button
                variant="icon"
                className="chat-back"
                title="Quay lại danh sách"
                onClick={() => navigate("/messages")}
              >
                ←
              </Button>
              <Avatar src={peer.imageUrl} name={peer.username} size={40} />
              <div className="grow">
                <Link
                  to={`/profile/${peer.id}`}
                  style={{ fontWeight: 700 }}
                >
                  {peer.username}
                </Link>
                <div className="faint">
                  {connected ? "Đang hoạt động" : "Mất kết nối thời gian thực"}
                </div>
              </div>
            </header>

            {error && (
              <div style={{ padding: "0 16px" }}>
                <Alert>{error}</Alert>
              </div>
            )}

            <div className="chat-scroll" ref={attachScroller} onScroll={onScroll}>
              {/* Bọc thêm một lớp để ResizeObserver theo dõi được chiều cao
                  thật của nội dung, không phải chiều cao khung cuộn */}
              <div ref={contentRef}>
              {loadingThread ? (
                <Spinner />
              ) : messages.length === 0 ? (
                <div className="faint" style={{ textAlign: "center" }}>
                  Chưa có tin nhắn — gửi lời chào đi 👋
                </div>
              ) : (
                days.map((day) => (
                  <div key={day.key}>
                    <div className="day-divider">
                      <span>{day.label}</span>
                    </div>
                    {day.groups.map((group, groupIndex) => {
                      const mine = group[0].senderId === user?.id;
                      return (
                        <div
                          key={`${day.key}-${groupIndex}`}
                          className={`msg-group ${mine ? "mine" : ""}`}
                        >
                          {!mine && (
                            <Avatar
                              src={peer.imageUrl}
                              name={peer.username}
                              size={28}
                            />
                          )}
                          <div className="msg-stack">
                            {group.map((message, index) => (
                              <div
                                key={message.id}
                                className={`bubble ${mine ? "mine" : ""} ${
                                  message.id < 0 ? "pending" : ""
                                }`}
                                title={clockTime(message.createdAt)}
                              >
                                {message.content && (
                                  <div className="bubble-text">
                                    {message.content}
                                  </div>
                                )}
                                {message.mediaUrl && (
                                  <img
                                    className="bubble-image"
                                    src={message.mediaUrl}
                                    alt=""
                                  />
                                )}
                                {index === group.length - 1 && (
                                  <div className="bubble-meta">
                                    {clockTime(message.createdAt)}
                                    {mine &&
                                      lastOwn?.id === message.id &&
                                      ` · ${statusLabel(message)}`}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              </div>
            </div>

            {attachment && (
              <div className="composer-attachment">
                <img src={URL.createObjectURL(attachment)} alt="" />
                <span className="truncate grow">{attachment.name}</span>
                <button
                  className="link-btn"
                  onClick={() => {
                    setAttachment(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  bỏ ảnh
                </button>
              </div>
            )}

            <div className="composer">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              />
              <Button
                variant="icon"
                onClick={() => fileRef.current?.click()}
                title="Gửi ảnh"
              >
                🖼️
              </Button>
              <textarea
                ref={textareaRef}
                className="composer-input"
                rows={1}
                value={draft}
                placeholder="Nhắn tin…"
                onChange={(e) => {
                  setDraft(e.target.value);
                  autoGrow();
                }}
                onKeyDown={(e) => {
                  // Enter gửi, Shift+Enter xuống dòng — quy ước quen thuộc
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <Button
                onClick={send}
                disabled={sending || (!draft.trim() && !attachment)}
              >
                Gửi
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
