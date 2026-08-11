import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, isForbidden } from "../api/client";
import { friendApi, notificationApi } from "../api/endpoints";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  Spinner,
  Tabs,
  timeAgo,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import type { FriendEntry, Notification } from "../types";

type Tab = "friends" | "received" | "sent";

export function FriendsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("friends");
  const [list, setList] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const fetcher =
        tab === "friends"
          ? friendApi.listOf
          : tab === "received"
            ? friendApi.received
            : friendApi.sent;
      const data = await fetcher(user.id);
      setList(data?.others ?? []);
    } catch (e) {
      setList([]);
      setError(
        isForbidden(e)
          ? "Bạn không có quyền xem danh sách này."
          : errorMessage(e),
      );
    } finally {
      setLoading(false);
    }
  }, [tab, user]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardHead title="Bạn bè" sub="Quản lý kết nối của bạn" />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "friends", label: "Bạn bè" },
          { value: "received", label: "Lời mời đến" },
          { value: "sent", label: "Đã gửi" },
        ]}
      />

      <Alert>{error}</Alert>

      {loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState icon="👥" title="Danh sách trống" />
      ) : (
        <div className="stack" style={{ marginTop: 14 }}>
          {list.map((friend) => (
            <div key={friend.id} className="row">
              <Avatar src={friend.imageUrl} name={friend.username} />
              <Link to={`/profile/${friend.id}`} className="grow">
                <div style={{ fontWeight: 650 }}>{friend.username}</div>
                <div className="faint">{friend.status}</div>
              </Link>

              {tab === "received" && (
                <>
                  <Button
                    size="sm"
                    onClick={() =>
                      act(async () => {
                        await friendApi.accept(friend.id);
                        await notificationApi
                          .create(
                            friend.id,
                            `${user?.username ?? "Ai đó"} đã chấp nhận lời mời kết bạn`,
                            "POST",
                          )
                          .catch(() => undefined);
                      })
                    }
                  >
                    Chấp nhận
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => act(() => friendApi.reject(friend.id))}
                  >
                    Từ chối
                  </Button>
                </>
              )}

              {tab === "sent" && (
                <Button
                  size="sm"
                  variant="ghost"
                  // Cùng endpoint DELETE /v1/friendships: service dò quan hệ
                  // theo cả hai chiều nên thu hồi lời mời cũng dùng được.
                  onClick={() => act(() => friendApi.remove(friend.id))}
                >
                  Thu hồi lời mời
                </Button>
              )}

              {tab === "friends" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => act(() => friendApi.remove(friend.id))}
                >
                  Huỷ kết bạn
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const NOTIFICATION_GLYPH: Record<string, string> = {
  POST: "📝",
  MESSAGE: "💬",
};

export function NotificationsPage() {
  const { user } = useAuth();
  const { liveNotifications, clearNotificationBadge } = useRealtime();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setItems(await notificationApi.mine(user.id));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Vào trang là coi như đã xem hết phần đếm ở thanh điều hướng
  useEffect(() => clearNotificationBadge(), [clearNotificationBadge]);

  // Thông báo đến qua socket chưa có notificationId nên chỉ hiện, không có nút
  // đánh dấu đã đọc; tải lại trang sẽ lấy bản chính thức từ REST.
  const live = liveNotifications.filter((n) => !n.notificationId);

  async function markRead(id: number) {
    try {
      await notificationApi.setStatus(id, "READ");
      setItems((list) =>
        list.map((n) =>
          n.notificationId === id ? { ...n, status: "READ" } : n,
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function markAllRead() {
    const unread = items.filter((n) => n.status !== "READ");
    if (unread.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(
        unread.map((n) =>
          notificationApi
            .setStatus(n.notificationId, "READ")
            .catch(() => undefined),
        ),
      );
      setItems((list) => list.map((n) => ({ ...n, status: "READ" })));
    } finally {
      setBusy(false);
    }
  }

  const unreadCount = items.filter((n) => n.status !== "READ").length;

  return (
    <Card>
      <CardHead
        title="Thông báo"
        sub={unreadCount > 0 ? `${unreadCount} chưa đọc` : "Bạn đã xem hết"}
        action={
          unreadCount > 0 ? (
            <Button size="sm" variant="ghost" onClick={markAllRead} disabled={busy}>
              Đánh dấu tất cả đã đọc
            </Button>
          ) : null
        }
      />
      <Alert>{error}</Alert>

      {live.length > 0 && (
        <div className="stack" style={{ marginBottom: 12 }}>
          {live.map((n, index) => (
            <div key={`live-${index}`} className="row">
              <div className="glyph" style={{ fontSize: 18 }}>
                {NOTIFICATION_GLYPH[n.type ?? ""] ?? "🔔"}
              </div>
              <div className="grow">
                <div>{n.content}</div>
                <div className="faint">vừa xong</div>
              </div>
              <Badge tone="brand">Mới</Badge>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : items.length === 0 && live.length === 0 ? (
        <EmptyState icon="🔔" title="Chưa có thông báo" />
      ) : (
        <div className="stack">
          {items.map((n) => (
            <div
              key={n.notificationId}
              className="row"
              style={{ opacity: n.status === "READ" ? 0.6 : 1 }}
            >
              <div className="glyph" style={{ fontSize: 18 }}>
                {NOTIFICATION_GLYPH[n.type ?? ""] ?? "🔔"}
              </div>
              <div className="grow">
                <div>{n.content}</div>
                <div className="faint">
                  {timeAgo(n.createdAt)}
                  {n.actorId ? ` · từ #${n.actorId}` : ""}
                </div>
              </div>
              {n.status !== "READ" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => markRead(n.notificationId)}
                >
                  Đánh dấu đã đọc
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
