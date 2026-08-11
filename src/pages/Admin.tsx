import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../api/client";
import {
  accountApi,
  advertiserApi,
  reportApi,
  roleApi,
  type ReportFilter,
} from "../api/endpoints";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  Modal,
  Spinner,
  timeAgo,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import type {
  Account,
  AdvertiserProfile,
  AdvertiserStatus,
  Report,
  ReportAction,
  ReportType,
  RoleName,
} from "../types";

/* ───────────────────────── tài khoản ───────────────────────── */

function RoleModal({
  account,
  roles,
  onClose,
  onSaved,
}: {
  account: Account;
  roles: { id: number; name: RoleName }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<RoleName[]>(account.roles ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      // Backend hiểu đây là "set": thu hồi hết role cũ rồi cấp lại danh sách này,
      // nên gửi mảng rỗng chính là thu hồi toàn bộ.
      await accountApi.setRoles(account.id, selected);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={`Vai trò của ${account.username}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={save} disabled={busy}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="stack">
        {roles.length === 0 && (
          <div className="faint">Không tải được danh sách vai trò.</div>
        )}
        {roles.map((role) => (
          <label key={role.id} className="row" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selected.includes(role.name)}
              onChange={(e) =>
                setSelected((list) =>
                  e.target.checked
                    ? [...list, role.name]
                    : list.filter((name) => name !== role.name),
                )
              }
            />
            <div className="grow">
              <div style={{ fontWeight: 650 }}>{role.name}</div>
              <div className="faint">
                {role.name === "ADMIN"
                  ? "Toàn quyền hệ thống"
                  : role.name === "MODERATOR"
                    ? "Kiểm duyệt nội dung, xử lý báo cáo, khoá tài khoản"
                    : "Chỉ đọc: tài khoản, báo cáo, hồ sơ quảng cáo"}
              </div>
            </div>
          </label>
        ))}
      </div>
      <div className="alert alert-info" style={{ marginTop: 12 }}>
        Bỏ chọn hết nghĩa là thu hồi toàn bộ vai trò, tài khoản trở về quyền
        người dùng thường.
      </div>
      <Alert>{error}</Alert>
    </Modal>
  );
}

export function AdminAccountsPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<Account[]>([]);
  const [roles, setRoles] = useState<{ id: number; name: RoleName }[]>([]);
  const [editingRolesOf, setEditingRolesOf] = useState<Account | null>(null);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await accountApi.list());
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Danh mục vai trò lấy từ GET /v1/roles thay vì viết cứng ở client
    roleApi
      .list()
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const visible = keyword.trim()
    ? items.filter((account) =>
        `${account.username} ${account.email}`
          .toLowerCase()
          .includes(keyword.trim().toLowerCase()),
      )
    : items;

  return (
    <Card>
      <CardHead
        title="Quản lý tài khoản"
        sub="Danh sách này ẩn các tài khoản ADMIN"
        action={
          <input
            className="input"
            style={{ maxWidth: 220 }}
            placeholder="Lọc theo tên / email"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        }
      />
      <Alert>{error}</Alert>
      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState icon="🗂️" title="Không có tài khoản" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th>Email</th>
                <th>Trạng thái</th>
                <th>Vai trò</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((account) => (
                <tr key={account.id}>
                  <td>
                    <Link to={`/profile/${account.id}`} className="row">
                      <Avatar
                        src={account.profile?.avatarUrl}
                        name={account.username}
                        size={32}
                      />
                      <span style={{ fontWeight: 650 }}>
                        {account.username}
                      </span>
                    </Link>
                  </td>
                  <td className="muted">{account.email}</td>
                  <td>
                    {account.isBanned ? (
                      <Badge tone="danger">Đã khoá</Badge>
                    ) : (
                      <Badge tone="ok">Hoạt động</Badge>
                    )}
                  </td>
                  <td>
                    <div className="row" style={{ flexWrap: "wrap" }}>
                      {account.roles?.length ? (
                        account.roles.map((role) => (
                          <Badge key={role} tone="brand">
                            {role}
                          </Badge>
                        ))
                      ) : (
                        <span className="muted">Người dùng</span>
                      )}
                      {/* Chỉ ai có account:setRole mới sửa được */}
                      {can("account:setRole") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingRolesOf(account)}
                        >
                          Sửa
                        </Button>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="row">
                      {can("account:ban") &&
                        (account.isBanned ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              act(() => accountApi.unban(account.id))
                            }
                          >
                            Mở khoá
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => act(() => accountApi.ban(account.id))}
                          >
                            Khoá
                          </Button>
                        ))}
                      {can("account:delete") && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            if (confirm(`Xoá tài khoản ${account.username}?`))
                              act(() => accountApi.remove(account.id));
                          }}
                        >
                          Xoá
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingRolesOf && (
        <RoleModal
          account={editingRolesOf}
          roles={roles}
          onClose={() => setEditingRolesOf(null)}
          onSaved={() => {
            setEditingRolesOf(null);
            load();
          }}
        />
      )}
    </Card>
  );
}

/* ────────────────────────── báo cáo ────────────────────────── */

const REPORT_TYPES: ReportType[] = ["USER", "GROUP", "POST"];

/** Đường dẫn tới đối tượng bị báo cáo, theo đúng ba loại backend hỗ trợ */
function targetLink(type: ReportType, id: number) {
  if (type === "POST") return `/posts/${id}`;
  if (type === "GROUP") return `/groups/${id}`;
  return `/profile/${id}`;
}

export function AdminReportsPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<Report[]>([]);
  const [filter, setFilter] = useState<ReportFilter>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await reportApi.list(filter));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(
    targetId: number,
    type: ReportType,
    action: ReportAction,
  ) {
    try {
      await reportApi.resolve(targetId, type, action);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardHead
        title="Báo cáo vi phạm"
        sub="Backend tự ghi lại ai đã xử lý mỗi báo cáo"
      />

      <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
        <select
          className="select"
          style={{ maxWidth: 180 }}
          value={filter.type ?? ""}
          onChange={(e) =>
            setFilter((f) => ({
              ...f,
              type: (e.target.value || undefined) as ReportType | undefined,
            }))
          }
        >
          <option value="">Tất cả loại</option>
          {REPORT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ maxWidth: 170 }}
          placeholder="ID đối tượng"
          value={filter.targetId ?? ""}
          onChange={(e) =>
            setFilter((f) => ({
              ...f,
              targetId: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
        />
        <input
          className="input"
          style={{ maxWidth: 170 }}
          placeholder="ID người báo cáo"
          value={filter.accountId ?? ""}
          onChange={(e) =>
            setFilter((f) => ({
              ...f,
              accountId: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
        />
        {(filter.type || filter.targetId || filter.accountId) && (
          <Button variant="ghost" size="sm" onClick={() => setFilter({})}>
            Xoá lọc
          </Button>
        )}
      </div>

      <Alert>{error}</Alert>
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="🚩" title="Không có báo cáo" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Đối tượng</th>
                <th>Lý do</th>
                <th>Người báo cáo</th>
                <th>Trạng thái</th>
                <th>Người xử lý</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((report) => (
                <tr key={report.id}>
                  <td>
                    <Link to={targetLink(report.targetType, report.targetId)}>
                      <Badge>{report.targetType}</Badge> #{report.targetId}
                    </Link>
                  </td>
                  <td className="muted">{report.reason}</td>
                  <td className="muted">
                    {report.reporter ? (
                      <Link to={`/profile/${report.reporter.id}`}>
                        {report.reporter.username}
                      </Link>
                    ) : (
                      "—"
                    )}
                    <div className="faint">{timeAgo(report.createdAt)}</div>
                  </td>
                  <td>
                    <Badge
                      tone={
                        report.action === "APPROVED"
                          ? "ok"
                          : report.action === "CANCELLED"
                            ? "danger"
                            : "warn"
                      }
                    >
                      {report.action}
                    </Badge>
                  </td>
                  <td className="muted">
                    {report.resolvedBy?.username ?? "—"}
                    {report.resolvedAt && (
                      <div className="faint">{timeAgo(report.resolvedAt)}</div>
                    )}
                  </td>
                  <td>
                    {can("report:resolve") && report.action === "PENDING" && (
                      <div className="row">
                        <Button
                          size="sm"
                          onClick={() =>
                            resolve(
                              report.targetId,
                              report.targetType,
                              "APPROVED",
                            )
                          }
                        >
                          Chấp nhận
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            resolve(
                              report.targetId,
                              report.targetType,
                              "CANCELLED",
                            )
                          }
                        >
                          Bỏ qua
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ───────────────────── hồ sơ nhà quảng cáo ─────────────────── */

export function AdminAdvertisersPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<AdvertiserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await advertiserApi.list());
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: number, status: AdvertiserStatus) {
    try {
      await advertiserApi.setStatus(id, status);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const pending = items.filter((p) => p.status === "PENDING").length;

  return (
    <Card>
      <CardHead
        title="Hồ sơ nhà quảng cáo"
        sub="Chỉ hồ sơ APPROVED mới đăng được quảng cáo"
        action={pending > 0 ? <Badge tone="warn">{pending} chờ duyệt</Badge> : null}
      />
      <Alert>{error}</Alert>
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="✅" title="Chưa có hồ sơ nào" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Công ty</th>
                <th>Tài khoản</th>
                <th>Trạng thái</th>
                <th>Số dư</th>
                <th>Ngày nộp</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((profile) => (
                <tr key={profile.id}>
                  <td style={{ fontWeight: 650 }}>
                    {profile.companyName ?? "—"}
                  </td>
                  <td>
                    <Link to={`/profile/${profile.accountId}`}>
                      {profile.username ?? `#${profile.accountId}`}
                    </Link>
                  </td>
                  <td>
                    <Badge
                      tone={
                        profile.status === "APPROVED"
                          ? "ok"
                          : profile.status === "PENDING"
                            ? "warn"
                            : "danger"
                      }
                    >
                      {profile.status}
                    </Badge>
                  </td>
                  <td className="muted">
                    {profile.balance.toLocaleString("vi-VN")} ₫
                  </td>
                  <td className="muted">{timeAgo(profile.createdAt)}</td>
                  <td>
                    {can("advertiser:approve") && (
                      <div className="row">
                        {profile.status !== "APPROVED" && (
                          <Button
                            size="sm"
                            onClick={() => setStatus(profile.id, "APPROVED")}
                          >
                            Duyệt
                          </Button>
                        )}
                        {profile.status !== "SUSPENDED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setStatus(profile.id, "SUSPENDED")}
                          >
                            Đình chỉ
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
