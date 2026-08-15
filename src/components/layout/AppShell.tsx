import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { friendApi } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { Avatar, Button } from "../ui";
import { NotificationBell } from "./NotificationBell";

const THEME_KEY = "lopet:theme";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem(THEME_KEY) as "light" | "dark") ?? "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  return {
    theme,
    toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")),
  };
}

interface NavEntry {
  to: string;
  label: string;
  glyph: string;
  /** Quyền cần có để hiện mục này; bỏ trống nghĩa là baseline */
  permission?: string;
  badge?: number;
}

const STAFF_NAV: NavEntry[] = [
  {
    to: "/admin/accounts",
    label: "Tài khoản",
    glyph: "🗂️",
    permission: "account:read",
  },
  {
    to: "/admin/reports",
    label: "Báo cáo",
    glyph: "🚩",
    permission: "report:read",
  },
  {
    to: "/admin/advertisers",
    label: "Duyệt quảng cáo",
    glyph: "✅",
    permission: "advertiser:read",
  },
];

export function AppShell({
  children,
  rail,
}: {
  children: ReactNode;
  rail?: ReactNode;
}) {
  const { user, logout, can } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [pendingRequests, setPendingRequests] = useState(0);

  // Huy hiệu lời mời kết bạn. Tải một lần khi vào app — không có kênh realtime
  // cho lời mời nên cũng không có gì để cộng thêm.
  // Huy hiệu thông báo đã chuyển sang <NotificationBell> cùng dữ liệu của nó.
  useEffect(() => {
    if (!user) return;
    friendApi
      .received(user.id)
      .then((data) => setPendingRequests(data?.others?.length ?? 0))
      .catch(() => setPendingRequests(0));
  }, [user]);

  const mainNav: NavEntry[] = [
    { to: "/", label: "Bảng tin", glyph: "🏠" },
    { to: "/friends", label: "Bạn bè", glyph: "👥", badge: pendingRequests },
    { to: "/groups", label: "Nhóm", glyph: "🧩" },
    { to: "/pets", label: "Thú cưng", glyph: "🐾" },
    { to: "/messages", label: "Tin nhắn", glyph: "💬" },
    // "Thông báo" không còn ở đây: nó là cái chuông trên thanh header. Route
    // /notifications vẫn sống để panel dẫn sang bản đầy đủ.
    { to: "/advertiser", label: "Nhà quảng cáo", glyph: "📣" },
    { to: "/settings", label: "Cài đặt", glyph: "⚙️" },
  ];

  // Chỉ hiện mục staff mà tài khoản thực sự có quyền. Đây thuần tuý là UX —
  // backend vẫn chặn bằng requirePermission nếu ai đó gõ thẳng URL.
  const staffNav = STAFF_NAV.filter((n) => !n.permission || can(n.permission));

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🐾</span>
          {/* Chữ "Lopet" ẩn trên màn hình hẹp, chỉ giữ dấu chân mèo */}
          <span className="brand-text">Lopet</span>
        </div>

        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim())
              navigate(`/search?q=${encodeURIComponent(query.trim())}`);
          }}
        >
          <span className="icon">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm người, nhóm, bài viết…"
          />
        </form>

        <div className="topbar-actions">
          <NotificationBell />
          <Button variant="icon" onClick={toggle} title="Đổi giao diện">
            {theme === "light" ? "🌙" : "☀️"}
          </Button>
          <NavLink
            to={`/profile/${user?.id}`}
            className="row"
            style={{ gap: 8 }}
          >
            <Avatar src={user?.avatarUrl} name={user?.username} size={38} />
          </NavLink>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="logout-btn"
            title="Đăng xuất"
          >
            <span aria-hidden="true">⏻</span>
            <span className="logout-text">Đăng xuất</span>
          </Button>
        </div>
      </header>

      <div className={`layout ${rail ? "" : "no-rail"}`}>
        <aside className="sidebar">
          <nav className="nav">
            {mainNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <span className="glyph">{item.glyph}</span>
                <span className="nav-label grow">{item.label}</span>
                {item.badge ? <span className="pill">{item.badge}</span> : null}
              </NavLink>
            ))}

            {staffNav.length > 0 && (
              <>
                <div className="nav-section">Quản trị</div>
                {staffNav.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `nav-item ${isActive ? "active" : ""}`
                    }
                  >
                    <span className="glyph">{item.glyph}</span>
                    <span className="nav-label">{item.label}</span>
                  </NavLink>
                ))}
              </>
            )}
          </nav>
        </aside>

        <main className="main-col">{children}</main>

        {/* Không dựng cột phải khi trang không có nội dung cho nó, tránh chừa
            một khoảng trống rộng như trang tin nhắn trước đây */}
        {rail ? <aside className="rail">{rail}</aside> : null}
      </div>
    </div>
  );
}
