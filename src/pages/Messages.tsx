import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage, isForbidden } from "../api/client";
import { friendApi, messageApi, notificationApi } from "../api/endpoints";
import { Alert, Avatar, Badge, Button, EmptyState, Spinner } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import type { FriendEntry, Message } from "../types";

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

interface Conversation {
  friend: FriendEntry;
  lastMessage?: Message;
  unread: number;
}

export function MessagesPage() {
  const { peerId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { connected, onMessage } = useRealtime();

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
          return {
            friend,
            lastMessage: ordered[ordered.length - 1],
            unread: ordered.filter(
              (m) => m.receiverId === user.id && m.status !== "READ",
            ).length,
          } satisfies Conversation;
        }),
      );

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
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  /** Đánh dấu đã đọc những tin do người kia gửi */
  const markRead = useCallback(
    async (list: Message[]) => {
      const targets = list.filter(
        (m) => m.id && m.receiverId === user?.id && m.status !== "READ",
      );
      if (targets.length === 0) return;
      await Promise.all(
        targets.map((m) =>
          messageApi.setStatus(m.id, "READ").catch(() => undefined),
        ),
      );
      setMessages((current) =>
        current.map((m) =>
          m.receiverId === user?.id ? { ...m, status: "READ" as const } : m,
        ),
      );
      setConversations((rows) =>
        rows.map((row) =>
          row.friend.id === activeIdRef.current ? { ...row, unread: 0 } : row,
        ),
      );
    },
    [user],
  );

  const loadThread = useCallback(
    async (targetId: number, silent = false) => {
      if (!silent) setLoadingThread(true);
      try {
        const list = sortAscending(await messageApi.conversation(targetId));
        setMessages(list);
        setError("");
        void markRead(list);
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
      await messageApi.send(form);
      await loadThread(activeId, true);
      void loadConversations();
      await notificationApi
        .create(
          activeId,
          `${user?.username ?? "Ai đó"} đã gửi cho bạn một tin nhắn`,
          "MESSAGE",
        )
        .catch(() => undefined);
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
                                      (message.id < 0
                                        ? " · Đang gửi"
                                        : message.status === "READ"
                                          ? " · Đã xem"
                                          : " · Đã gửi")}
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
