import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { authApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { Alert, Button } from "../components/ui";

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth">
      <div className="auth-art">
        <div className="brand" style={{ color: "#fff", fontSize: 22 }}>
          <span
            className="brand-mark"
            style={{ background: "rgba(255,255,255,.22)" }}
          >
            🐾
          </span>
          Lopet
        </div>
        <h1>Mạng xã hội cho người yêu thú cưng</h1>
        <p style={{ opacity: 0.9, maxWidth: 420 }}>
          Chia sẻ khoảnh khắc, lập nhóm cộng đồng, kết nối với những người nuôi
          thú cưng quanh bạn.
        </p>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form">
          <h2 style={{ marginBottom: 4 }}>{title}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {subtitle}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err, "Đăng nhập thất bại"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Đăng nhập" subtitle="Chào mừng bạn quay lại 👋">
      <form onSubmit={submit}>
        <div className="field">
          <label>Tên đăng nhập</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label>Mật khẩu</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <Alert>{error}</Alert>
        <Button
          type="submit"
          disabled={busy}
          style={{ width: "100%", marginTop: 12 }}
        >
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
        <div className="row-between" style={{ marginTop: 14 }}>
          <Link to="/forgot" className="muted">
            Quên mật khẩu?
          </Link>
          <Link to="/register" style={{ fontWeight: 650 }}>
            Tạo tài khoản
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}

/**
 * Đăng ký gồm 3 bước vì backend bắt buộc xác thực OTP qua email trước:
 * gửi OTP → xác minh OTP → tạo tài khoản.
 *
 * Không có bước tạo hồ sơ: backend cấp sẵn hồ sơ trong chính transaction đăng ký, nên sau bước 3
 * người dùng đã có hồ sơ và chỉ việc sửa ở trang cá nhân. Mô hình cũ (POST /v1/profiles tạo bản
 * ghi rời rồi POST /v1/profiles/:id gắn vào tài khoản) đã bị bỏ ở backend.
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Tạo tài khoản" subtitle={`Bước ${step} / 3`}>
      {step === 1 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await authApi.sendOtp(email);
              setStep(2);
            });
          }}
        >
          <div className="field">
            <label>Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Alert>{error}</Alert>
          <Button type="submit" disabled={busy} style={{ width: "100%" }}>
            Gửi mã xác thực
          </Button>
        </form>
      )}

      {step === 2 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await authApi.verifyOtp(email, otp);
              setStep(3);
            });
          }}
        >
          <div className="field">
            <label>Mã OTP gửi tới {email}</label>
            <input
              className="input"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
          </div>
          <Alert>{error}</Alert>
          <Button type="submit" disabled={busy} style={{ width: "100%" }}>
            Xác minh
          </Button>
        </form>
      )}

      {step === 3 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await authApi.signup({
                email,
                username,
                password,
                confirmPassword,
              });
              navigate("/login");
            });
          }}
        >
          <div className="field">
            <label>Tên đăng nhập</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Mật khẩu</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Nhập lại mật khẩu</label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Hồ sơ cá nhân được tạo sẵn cùng tài khoản. Sau khi đăng nhập bạn có
            thể đổi tên hiển thị, ảnh đại diện và ảnh bìa ở trang cá nhân.
          </p>
          <Alert>{error}</Alert>
          <Button type="submit" disabled={busy} style={{ width: "100%" }}>
            Hoàn tất
          </Button>
        </form>
      )}

      <div style={{ marginTop: 14 }}>
        <Link to="/login" className="muted">
          Đã có tài khoản? Đăng nhập
        </Link>
      </div>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Đặt lại mật khẩu" subtitle={`Bước ${step} / 3`}>
      {step === 1 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await authApi.sendOtp(email);
              setStep(2);
            });
          }}
        >
          <div className="field">
            <label>Email tài khoản</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Alert>{error}</Alert>
          <Button type="submit" disabled={busy} style={{ width: "100%" }}>
            Gửi mã
          </Button>
        </form>
      )}

      {step === 2 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await authApi.verifyOtp(email, otp);
              setStep(3);
            });
          }}
        >
          <div className="field">
            <label>Mã OTP</label>
            <input
              className="input"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
          </div>
          <Alert>{error}</Alert>
          <Button type="submit" disabled={busy} style={{ width: "100%" }}>
            Xác minh
          </Button>
        </form>
      )}

      {step === 3 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await authApi.resetPassword({ email, password, confirmPassword });
              navigate("/login");
            });
          }}
        >
          <div className="field">
            <label>Mật khẩu mới</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Nhập lại</label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Alert>{error}</Alert>
          <Button type="submit" disabled={busy} style={{ width: "100%" }}>
            Đổi mật khẩu
          </Button>
        </form>
      )}

      <div style={{ marginTop: 14 }}>
        <Link to="/login" className="muted">
          Quay lại đăng nhập
        </Link>
      </div>
    </AuthLayout>
  );
}
