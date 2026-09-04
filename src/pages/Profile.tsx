import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { accountApi, accountProfileApi, postApi } from "../api/endpoints";
import { PostCard } from "../components/post/PostCard";
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
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import type { Account, Post, Profile } from "../types";

/**
 * Trang cá nhân.
 *
 * Không còn khối bạn bè, nút kết bạn / nhắn tin và nút báo cáo: backend đã gỡ
 * các module friendship, message, notification và report. Hành động duy nhất
 * còn lại trên trang của người khác là xem — với chính mình thì thêm "Sửa hồ sơ".
 */
export function ProfilePage() {
  const { id } = useParams();
  const accountId = Number(id);
  const { user, refresh } = useAuth();
  const isMe = accountId === user?.id;

  const [account, setAccount] = useState<Account | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [acc, list] = await Promise.all([
        accountApi.detail(accountId),
        postApi.byAccount(accountId).catch(() => []),
      ]);
      setAccount(acc);
      setPosts(list);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner />;
  if (!account)
    return (
      <Card>
        <Alert>{error || "Không tìm thấy tài khoản"}</Alert>
      </Card>
    );

  return (
    <>
      <Card>
        {account.profile?.coverUrl ? (
          <img className="cover" src={account.profile.coverUrl} alt="" />
        ) : (
          <div className="cover" />
        )}
        {/* Bố cục do CSS lo (xem .profile-head): trên mobile khối này xuống
            hàng và căn giữa thay vì tràn ngang như khi dùng .row */}
        <div className="profile-head">
          <div className="profile-avatar">
            <Avatar
              src={account.profile?.avatarUrl}
              name={account.username}
              size={88}
            />
          </div>
          <div className="profile-identity grow">
            <div className="profile-name">
              {account.profile?.fullName || account.username}
            </div>
            <div className="faint">@{account.username}</div>
            {account.isBanned ? <Badge tone="danger">Đã bị khoá</Badge> : null}
          </div>

          <div className="profile-actions">
            {/* Không còn nhánh "Tạo hồ sơ": mỗi tài khoản được backend cấp sẵn hồ sơ ngay khi
                đăng ký, nên với chính chủ luôn chỉ có một hành động là sửa. */}
            {isMe && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Sửa hồ sơ
              </Button>
            )}
          </div>
        </div>

        {account.profile?.bio && (
          <p className="muted" style={{ marginTop: 14 }}>
            {account.profile.bio}
          </p>
        )}

        {account.profile && (
          <div className="row" style={{ gap: 20, flexWrap: "wrap" }}>
            {account.profile.hometown && (
              <span className="faint">🏠 {account.profile.hometown}</span>
            )}
            {account.profile.phoneNumber && (
              <span className="faint">📞 {account.profile.phoneNumber}</span>
            )}
            {account.profile.dateOfBirth && (
              <span className="faint">
                🎂{" "}
                {new Date(account.profile.dateOfBirth).toLocaleDateString(
                  "vi-VN",
                )}
              </span>
            )}
          </div>
        )}

        <Alert>{error}</Alert>
      </Card>

      <CardHead title="Bài viết" />
      {posts.length === 0 ? (
        <Card>
          <EmptyState title="Chưa có bài viết" />
        </Card>
      ) : (
        posts.map((post) => (
          <PostCard key={post.postId} post={post} onChanged={load} />
        ))
      )}

      {isMe && (
        <ProfileFormModal
          /* Remount khi hồ sơ đổi: state của form được khởi tạo từ prop nên nếu không remount,
             lần mở sau vẫn giữ giá trị của lần nạp trước. */
          key={account.profile?.id ?? "no-profile"}
          open={editing}
          profile={account.profile}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await refresh();
            load();
          }}
        />
      )}
    </>
  );
}

/**
 * Sửa hồ sơ của chính người gọi: MỘT bước PUT /v1/account-profiles, không kèm id.
 *
 * Mô hình hai bước cũ (POST /v1/profiles tạo bản ghi rời → POST /v1/profiles/:id gắn vào tài
 * khoản) đã bị bỏ ở backend: bước thứ hai không kiểm sở hữu nên gắn được hồ sơ của người khác
 * vào tài khoản mình. Giờ hồ sơ được cấp sẵn lúc đăng ký và chỉ tra được bằng token.
 *
 * `profile` vẫn để optional cho tài khoản cũ chưa chạy backfill — khi đó form mở với giá trị
 * rỗng và PUT sẽ trả lỗi của backend chỉ rõ cần backfill.
 */
function ProfileFormModal({
  open,
  profile,
  onClose,
  onSaved,
}: {
  open: boolean;
  profile?: Profile | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [phoneNumber, setPhoneNumber] = useState(profile?.phoneNumber ?? "");
  const [hometown, setHometown] = useState(profile?.hometown ?? "");
  const [sex, setSex] = useState(String(profile?.sex ?? 0));
  const [dateOfBirth, setDateOfBirth] = useState(
    profile?.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  function buildForm() {
    const form = new FormData();
    form.append("fullName", fullName);
    form.append("bio", bio);
    form.append("phoneNumber", phoneNumber);
    form.append("hometown", hometown);
    form.append("sex", sex);
    if (dateOfBirth) form.append("dateOfBirth", dateOfBirth);
    const avatar = avatarRef.current?.files?.[0];
    const cover = coverRef.current?.files?.[0];
    if (avatar) form.append("avatar", avatar);
    if (cover) form.append("cover", cover);
    return form;
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await accountProfileApi.update(buildForm());
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Sửa hồ sơ"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label>Họ tên</label>
        <input
          className="input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Giới thiệu</label>
        <textarea
          className="textarea"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Số điện thoại</label>
        <input
          className="input"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Quê quán</label>
        <input
          className="input"
          value={hometown}
          onChange={(e) => setHometown(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Giới tính</label>
        <select
          className="select"
          value={sex}
          onChange={(e) => setSex(e.target.value)}
        >
          <option value="0">Chưa xác định</option>
          <option value="1">Nam</option>
          <option value="2">Nữ</option>
        </select>
      </div>
      <div className="field">
        <label>Ngày sinh</label>
        <input
          className="input"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Ảnh đại diện</label>
        <input ref={avatarRef} className="input" type="file" accept="image/*" />
      </div>
      <div className="field">
        <label>Ảnh bìa</label>
        <input ref={coverRef} className="input" type="file" accept="image/*" />
      </div>
      <Alert>{error}</Alert>
    </Modal>
  );
}
