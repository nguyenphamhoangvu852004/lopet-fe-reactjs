import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { notificationApi } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import {
  notificationHref,
  notificationKind,
} from "../../notifications/registry";
import { Button, Spinner, timeAgo } from "../ui";
import type { Notification } from "../../types";

/** Chỉ nạp bấy nhiêu vào panel; xem đầy đủ thì sang /notifications */
const PANEL_LIMIT = 12;

/**
 * Chuông thông báo trên thanh header, thay cho mục "Thông báo" ở cột điều hướng.
 *
 * Panel neo vào chuông trên desktop và trải ngang gần hết màn hình trên mobile
 * — nơi cột điều hướng đã nằm dưới đáy nên một dropdown hẹp neo phải sẽ tràn ra
 * ngoài viewport.
 */
export function NotificationBell() {
  const { user } = useAuth();
  const { liveNotifications, unreadNotifications, clearNotificationBadge } =
    useRealtime();
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setItems(await notificationApi.mine(user.id));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Nạp lại mỗi khi có thông báo mới bay về qua socket. Nhờ vậy panel luôn hiển
  // thị bản chính thức từ REST (có notificationId để đánh dấu đã đọc) thay vì
  // phải trộn hai nguồn và tự khử trùng lặp giữa chúng.
  useEffect(() => {
    void load();
  }, [load, liveNotifications.length]);

  // Bấm ra ngoài thì đóng. Dùng pointerdown chứ không phải click: click chỉ nổ
  // sau khi nhả chuột, nên kéo chọn chữ từ trong panel ra ngoài cũng đóng mất.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Điều hướng sang trang khác thì đóng, không để panel treo lại trên trang mới
  useEffect(() => setOpen(false), [location.pathname]);

  /**
   * Số chưa đọc lấy TỪ MỘT NGUỒN: danh sách vừa nạp từ REST.
   *
   * Bản trước cộng `storedUnread + unreadNotifications`, tức là cộng cả bộ đếm
   * socket vào danh sách REST — mà danh sách đó đã được nạp lại ngay khi sự
   * kiện socket tới, nên cùng một thông báo bị đếm hai lần và huy hiệu luôn
   * gấp đôi sự thật. Bộ đếm socket giờ chỉ còn là đường lui cho lúc REST hỏng.
   */
  const unreadFromApi = items.filter((n) => n.status !== "READ").length;
  const unread = error ? unreadNotifications : unreadFromApi;

  function toggle() {
    setOpen((value) => {
      // Mở ra là coi như đã thấy: dọn bộ đếm socket để nó không cộng dồn mãi
      if (!value) clearNotificationBadge();
      return !value;
    });
  }

  /**
   * Bấm vào một thông báo: đánh dấu đã đọc rồi đi tới đích của nó.
   *
   * Đánh dấu TRƯỚC và không chờ kết quả — điều hướng phải xảy ra ngay, còn việc
   * ghi trạng thái hỏng thì cùng lắm là huy hiệu sai một nhịp cho tới lần nạp
   * sau. Thông báo không có đích (loại cũ không kèm objectId) thì chỉ đánh dấu
   * đã đọc và đóng panel.
   */
  function openNotification(notification: Notification) {
    if (notification.status !== "READ") void markRead(notification.notificationId);
    const href = notificationHref(notification);
    setOpen(false);
    if (href) navigate(href);
  }

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
    const pending = items.filter((n) => n.status !== "READ");
    if (pending.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(
        pending.map((n) =>
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

  const visible = items.slice(0, PANEL_LIMIT);

  return (
    <div className="bell" ref={wrapRef}>
      <Button
        variant="icon"
        onClick={toggle}
        title="Thông báo"
        aria-label={
          unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        🔔
        {unread > 0 && (
          <span className="bell-badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </Button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Thông báo">
          <div className="bell-head">
            <div className="card-title">Thông báo</div>
            {unreadFromApi > 0 && (
              <button
                className="link-btn"
                onClick={markAllRead}
                disabled={busy}
              >
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>

          <div className="bell-list">
            {loading ? (
              <Spinner />
            ) : error ? (
              <div className="faint bell-empty">{error}</div>
            ) : visible.length === 0 ? (
              <div className="faint bell-empty">Chưa có thông báo nào</div>
            ) : (
              visible.map((n) => {
                const kind = notificationKind(n);
                const href = notificationHref(n);
                return (
                  <div
                    key={n.notificationId}
                    className={`bell-item ${n.status === "READ" ? "read" : ""}`}
                  >
                    {/* Vùng bấm là cả dòng, không phải riêng dòng chữ. Dùng
                        <button> chứ không phải <a>: đích đến là điều hướng nội
                        bộ của router, và loại không có đích thì vẫn phải bấm
                        được để đánh dấu đã đọc. */}
                    <button
                      className={`bell-open ${href ? "" : "flat"}`}
                      onClick={() => openNotification(n)}
                      title={href ? `Mở ${kind.label.toLowerCase()}` : kind.label}
                    >
                      <span className="bell-glyph" aria-hidden="true">
                        {kind.glyph}
                      </span>
                      <span className="grow">
                        <span className="bell-text">{n.content}</span>
                        <span className="faint bell-time">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                    </button>
                    {n.status !== "READ" && (
                      <button
                        className="bell-dot"
                        onClick={() => markRead(n.notificationId)}
                        title="Đánh dấu đã đọc"
                        aria-label="Đánh dấu đã đọc"
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          <Link className="bell-more" to="/notifications">
            Xem tất cả thông báo
          </Link>
        </div>
      )}
    </div>
  );
}
