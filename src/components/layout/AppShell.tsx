import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Avatar, Button } from "../ui";

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
}

/**
 * Điều hướng phẳng, không còn nhánh "Quản trị".
 *
 * Backend đã gỡ phân quyền cùng ba module bạn bè / tin nhắn / thông báo, nên
 * cũng không còn huy hiệu số nào để đếm ở đây — mọi mục đều dẫn tới thứ mà bất
 * kỳ tài khoản đã đăng nhập nào cũng mở được.
 */
const MAIN_NAV: NavEntry[] = [
  { to: "/", label: "Bảng tin", glyph: "🏠" },
  { to: "/accounts", label: "Tài khoản", glyph: "🗂️" },
  { to: "/settings", label: "Cài đặt", glyph: "⚙️" },
];

export function AppShell({
  children,
  rail,
}: {
  children: ReactNode;
  rail?: ReactNode;
}) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

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
            placeholder="Tìm người, bài viết…"
          />
        </form>

        <div className="topbar-actions">
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
            {MAIN_NAV.map((item) => (
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
              </NavLink>
            ))}
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
