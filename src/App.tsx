import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Card, EmptyState, Spinner } from "./components/ui";
import { useAuth } from "./context/AuthContext";
import { AccountsPage } from "./pages/Accounts";
import { ForgotPasswordPage, LoginPage, RegisterPage } from "./pages/Auth";
import { FeedPage, SuggestionRail } from "./pages/Feed";
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
 * Không còn <RequirePermission>: backend đã gỡ toàn bộ phân quyền, mọi tài khoản
 * đã đăng nhập đều gọi được cùng một tập endpoint. Ranh giới duy nhất còn lại là
 * quyền sở hữu, và nó được kiểm ngay tại chỗ hành động (chỉ tác giả mới thấy nút
 * sửa/xoá bài của mình) chứ không phải ở tầng route.
 */
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
        path="/accounts"
        element={
          <Shell>
            <AccountsPage />
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
