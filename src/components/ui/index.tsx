import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect } from "react";

export function Card({
  children,
  className = "",
  tight,
}: {
  children: ReactNode;
  className?: string;
  tight?: boolean;
}) {
  return (
    <div className={`card ${tight ? "card-tight" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function CardHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-head">
      <div className="grow">
        <div className="card-title">{title}</div>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "icon";
  size?: "sm" | "md";
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: ButtonProps) {
  const map = {
    primary: "",
    ghost: "btn-ghost",
    outline: "btn-outline",
    danger: "btn-danger",
    icon: "btn-icon",
  };
  return (
    <button
      className={`btn ${map[variant]} ${size === "sm" ? "btn-sm" : ""} ${className}`}
      {...rest}
    />
  );
}

/** Avatar dùng chữ cái đầu khi không có ảnh — tránh phụ thuộc ảnh mặc định */
export function Avatar({
  src,
  name,
  size = 42,
}: {
  src?: string | null;
  name?: string;
  size?: number;
}) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {src ? (
        <img
          src={src}
          alt={name ?? ""}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initial
      )}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

export function EmptyState({
  icon = "🐾",
  title,
  hint,
}: {
  icon?: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div style={{ fontWeight: 700 }}>{title}</div>
      {hint && <div className="faint">{hint}</div>}
    </div>
  );
}

export function Alert({
  kind = "error",
  children,
}: {
  kind?: "error" | "ok" | "info";
  children: ReactNode;
}) {
  if (!children) return null;
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "brand" | "ok" | "warn" | "danger";
}) {
  const map = {
    default: "",
    brand: "badge-brand",
    ok: "badge-ok",
    warn: "badge-warn",
    danger: "badge-danger",
  };
  return <span className={`badge ${map[tone]}`}>{children}</span>;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <div className="card-title">{title}</div>
          <Button variant="icon" onClick={onClose} aria-label="Đóng">
            ✕
          </Button>
        </div>
        {children}
        {footer && (
          <div
            className="row"
            style={{ justifyContent: "flex-end", marginTop: 16 }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs">
      {options.map((o) => (
        <button
          key={o.value}
          className={`tab ${o.value === value ? "active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function timeAgo(iso?: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}
