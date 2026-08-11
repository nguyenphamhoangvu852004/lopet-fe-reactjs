import { useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../api/client";
import { authApi } from "../api/endpoints";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import { BASELINE_PERMISSIONS, resolvePermissions } from "../authz/permissions";

/**
 * Đổi mật khẩu đi qua hai endpoint:
 *   1. POST /v1/auth/verify — đối chiếu email + mật khẩu hiện tại
 *   2. POST /v1/password/reset — đặt mật khẩu mới
 *
 * Bước 1 không bắt buộc về mặt kỹ thuật (reset chỉ cần email), nhưng thiếu nó
 * thì giao diện sẽ cho đổi mật khẩu mà không hỏi mật khẩu cũ.
 */
function ChangePassword() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!user?.email) {
      setError("Không xác định được email của tài khoản.");
      return;
    }
    if (next !== confirm) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setBusy(true);
    setError("");
    setDone(false);
    try {
      await authApi.verifyAccount(user.email, current);
      await authApi.resetPassword({
        email: user.email,
        password: next,
        confirmPassword: confirm,
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (e) {
      setError(errorMessage(e, "Đổi mật khẩu thất bại"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHead
        title="Đổi mật khẩu"
        sub="Cần nhập đúng mật khẩu hiện tại trước khi đặt mật khẩu mới"
      />
      <form onSubmit={submit}>
        <div className="field">
          <label>Mật khẩu hiện tại</label>
          <input
            className="input"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="field">
          <label>Mật khẩu mới</label>
          <input
            className="input"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={6}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="field">
          <label>Nhập lại mật khẩu mới</label>
          <input
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={6}
            autoComplete="new-password"
            required
          />
        </div>
        <Alert>{error}</Alert>
        {done && <Alert kind="ok">Đã đổi mật khẩu thành công.</Alert>}
        <Button type="submit" disabled={busy}>
          {busy ? "Đang xử lý…" : "Đổi mật khẩu"}
        </Button>
      </form>
    </Card>
  );
}

export function SettingsPage() {
  const { user, isStaff } = useAuth();
  const { connected } = useRealtime();
  const granted = [...resolvePermissions(user?.roles ?? [])].sort();

  return (
    <>
      <Card>
        <CardHead title="Tài khoản" sub={`@${user?.username}`} />
        <div className="stack">
          <div className="row-between">
            <span className="muted">Email</span>
            <span>{user?.email ?? "—"}</span>
          </div>
          <div className="row-between">
            <span className="muted">ID tài khoản</span>
            <span>#{user?.id}</span>
          </div>
          <div className="row-between">
            <span className="muted">Vai trò</span>
            <span className="row">
              {isStaff ? (
                user?.roles.map((role) => (
                  <Badge key={role} tone="brand">
                    {role}
                  </Badge>
                ))
              ) : (
                <Badge>Người dùng</Badge>
              )}
            </span>
          </div>
          <div className="row-between">
            <span className="muted">Kết nối thời gian thực</span>
            <Badge tone={connected ? "ok" : "warn"}>
              {connected ? "Đang kết nối" : "Mất kết nối"}
            </Badge>
          </div>
          <div className="row-between">
            <span className="muted">Hồ sơ cá nhân</span>
            <Link to={`/profile/${user?.id}`}>Mở trang cá nhân</Link>
          </div>
        </div>
      </Card>

      <ChangePassword />

      <Card>
        <CardHead
          title="Quyền hiệu lực"
          sub={`${BASELINE_PERMISSIONS.length} quyền cơ bản + quyền theo vai trò`}
        />
        <div className="row" style={{ flexWrap: "wrap" }}>
          {granted.map((permission) => (
            <Badge key={permission} tone={permission === "*" ? "brand" : "default"}>
              {permission}
            </Badge>
          ))}
        </div>
        <div className="faint" style={{ marginTop: 10 }}>
          Danh sách này chỉ để tham khảo và quyết định ẩn/hiện giao diện. Mọi
          thao tác vẫn được backend kiểm tra lại.
        </div>
      </Card>
    </>
  );
}
