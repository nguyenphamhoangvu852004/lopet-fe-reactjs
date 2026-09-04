import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../api/client";
import { accountApi } from "../api/endpoints";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  Spinner,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import type { Account } from "../types";

/**
 * Danh bạ tài khoản.
 *
 * Thay cho ba trang quản trị cũ (tài khoản / báo cáo / duyệt quảng cáo). Backend
 * đã gỡ phân quyền nên không còn khái niệm "trang dành cho staff": mọi tài khoản
 * đã đăng nhập đều gọi được `GET /v1/accounts`, và cũng đều gọi được khoá / mở
 * khoá / xoá. Vì thế những nút đó KHÔNG bị ẩn theo vai trò nữa — không có vai
 * trò nào để ẩn theo — nhưng vẫn hỏi xác nhận trước khi làm việc không lùi được.
 */
export function AccountsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Account[]>([]);
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
        title="Tài khoản"
        sub={`${items.length} tài khoản trong hệ thống`}
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
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((account) => {
                const isMe = account.id === user?.id;
                return (
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
                        {isMe && <Badge tone="brand">Bạn</Badge>}
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
                      {/* Không cho tự khoá / tự xoá chính mình: người dùng sẽ mất
                          phiên ngay giữa thao tác mà không hiểu vì sao. */}
                      {isMe ? (
                        <span className="muted">—</span>
                      ) : (
                        <div className="row">
                          {account.isBanned ? (
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
                              onClick={() =>
                                act(() => accountApi.ban(account.id))
                              }
                            >
                              Khoá
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              if (
                                confirm(
                                  `Xoá vĩnh viễn tài khoản ${account.username}?`,
                                )
                              )
                                act(() => accountApi.remove(account.id));
                            }}
                          >
                            Xoá
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
