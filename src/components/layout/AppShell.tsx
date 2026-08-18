import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { friendApi } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { useActivePet } from "../../context/PetContext";
import { useGroupInvites } from "../../hooks/useGroupInvites";
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

/**
 * Bộ chọn "đang thao tác nhân danh con nào".
 *
 * Đây không phải tiện ích trang trí mà là một phần của hợp đồng với backend:
 * mọi endpoint ghi nội dung xã hội đòi header `X-Pet-Id`, và giá trị đó quyết
 * định ai là tác giả bài viết, ai thả tim, ai là thành viên nhóm. Một tài khoản
 * nhiều thú cưng thì không có cách nào suy ra được lựa chọn này — nó phải hiện
 * ra để người dùng thấy và đổi được, đúng như chỗ đổi trang trên Facebook.
 *
 * Đặt ở thanh trên cùng chứ không giấu trong trang Cài đặt: nó đổi ý nghĩa của
 * mọi thao tác trên MỌI trang, nên phải luôn nhìn thấy.
 */
function PetSwitcher() {
  const { pets, activePet, select, ready } = useActivePet();

  if (!ready) return null;

  if (pets.length === 0) {
    return (
      <NavLink to="/pets" className="btn btn-outline btn-sm">
        🐾 Tạo thú cưng
      </NavLink>
    );
  }

  return (
    <label className="row pet-switcher" style={{ gap: 8 }} title="Đang thao tác nhân danh">
      <Avatar
        src={activePet?.profile?.avatarUrl ?? undefined}
        name={activePet?.profile?.displayName ?? activePet?.name}
        size={30}
      />
      <select
        className="select"
        style={{ padding: "6px 8px" }}
        value={activePet?.petId ?? ""}
        onChange={(e) => select(Number(e.target.value) || null)}
        aria-label="Thú cưng đang thao tác"
      >
        {pets.map((pet) => (
          <option key={pet.petId} value={pet.petId}>
            {pet.profile.displayName}
          </option>
        ))}
      </select>
    </label>
  );
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
  // Lời mời vào nhóm gắn với THÚ CƯNG đang chọn, nên hook tự tải lại khi đổi bé.
  const { invites: groupInvites } = useGroupInvites();

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
    {
      to: "/groups",
      label: "Nhóm",
      glyph: "🧩",
      badge: groupInvites.length,
    },
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
          <PetSwitcher />
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
