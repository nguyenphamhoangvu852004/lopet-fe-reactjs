import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Card, EmptyState, Spinner } from "./components/ui";
import { useAuth } from "./context/AuthContext";
import {
  AdminAccountsPage,
  AdminAdvertisersPage,
  AdminReportsPage,
} from "./pages/Admin";
import { AdvertiserPage } from "./pages/Advertiser";
import { ForgotPasswordPage, LoginPage, RegisterPage } from "./pages/Auth";
import { FeedPage, SuggestionRail } from "./pages/Feed";
import { FriendsPage, NotificationsPage } from "./pages/Friends";
import { GroupDetailPage, GroupsPage } from "./pages/Groups";
import { MessagesPage } from "./pages/Messages";
import { PetDetailPage, PetsPage } from "./pages/Pets";
import { PostDetailPage } from "./pages/PostDetail";
import { ProfilePage } from "./pages/Profile";
import { SearchPage } from "./pages/Search";
import { SettingsPage } from "./pages/Settings";

/** Chặn truy cập khi chưa đăng nhập, nhớ đường dẫn để quay lại sau khi login */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

/**
 * Ẩn trang khi thiếu quyền. Đây chỉ là lớp UX — backend mới là nơi thực thi;
 * gõ thẳng URL vẫn sẽ nhận 403 từ API.
 */
function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  if (!can(permission))
    return (
      <Card>
        <EmptyState
          icon="🔒"
          title="Bạn không có quyền truy cập trang này"
          hint={`Cần quyền: ${permission}`}
        />
      </Card>
    );
  return <>{children}</>;
}

function Shell({
  children,
  rail,
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <AppShell rail={rail}>{children}</AppShell>
    </RequireAuth>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/" replace /> : <RegisterPage />}
      />
      <Route path="/forgot" element={<ForgotPasswordPage />} />

      <Route
        path="/"
        element={
          <Shell rail={<SuggestionRail />}>
            <FeedPage />
          </Shell>
        }
      />
      <Route
        path="/posts/:id"
        element={
          <Shell rail={<SuggestionRail />}>
            <PostDetailPage />
          </Shell>
        }
      />
      <Route
        path="/profile/:id"
        element={
          <Shell>
            <ProfilePage />
          </Shell>
        }
      />
      <Route
        path="/search"
        element={
          <Shell>
            <SearchPage />
          </Shell>
        }
      />
      <Route
        path="/friends"
        element={
          <Shell>
            <FriendsPage />
          </Shell>
        }
      />
      <Route
        path="/groups"
        element={
          <Shell>
            <GroupsPage />
          </Shell>
        }
      />
      <Route
        path="/groups/:id"
        element={
          <Shell>
            <GroupDetailPage />
          </Shell>
        }
      />
      <Route
        path="/pets"
        element={
          <Shell>
            <PetsPage />
          </Shell>
        }
      />
      {/* Hồ sơ PUBLIC vẫn nằm sau RequireAuth: backend cho phép khách xem, nhưng app
          này không có layout nào cho người chưa đăng nhập ngoài trang auth. */}
      <Route
        path="/pets/:id"
        element={
          <Shell>
            <PetDetailPage />
          </Shell>
        }
      />
      <Route
        path="/messages"
        element={
          <Shell>
            <MessagesPage />
          </Shell>
        }
      />
      {/* Mở thẳng một đoạn chat, để nút "Nhắn tin" ở trang cá nhân dẫn đúng người */}
      <Route
        path="/messages/:peerId"
        element={
          <Shell>
            <MessagesPage />
          </Shell>
        }
      />
      <Route
        path="/notifications"
        element={
          <Shell>
            <NotificationsPage />
          </Shell>
        }
      />
      <Route
        path="/advertiser"
        element={
          <Shell>
            <AdvertiserPage />
          </Shell>
        }
      />
      <Route
        path="/settings"
        element={
          <Shell>
            <SettingsPage />
          </Shell>
        }
      />

      <Route
        path="/admin/accounts"
        element={
          <Shell>
            <RequirePermission permission="account:read">
              <AdminAccountsPage />
            </RequirePermission>
          </Shell>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <Shell>
            <RequirePermission permission="report:read">
              <AdminReportsPage />
            </RequirePermission>
          </Shell>
        }
      />
      <Route
        path="/admin/advertisers"
        element={
          <Shell>
            <RequirePermission permission="advertiser:read">
              <AdminAdvertisersPage />
            </RequirePermission>
          </Shell>
        }
      />

      <Route
        path="*"
        element={
          <Shell>
            <Card>
              <EmptyState icon="🧭" title="Không tìm thấy trang" />
            </Card>
          </Shell>
        }
      />
    </Routes>
  );
}
