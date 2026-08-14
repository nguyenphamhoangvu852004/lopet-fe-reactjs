import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage, isForbidden } from "../api/client";
import {
  accountApi,
  friendApi,
  notificationApi,
  postApi,
  profileApi,
} from "../api/endpoints";
import { PostCard } from "../components/post/PostCard";
import { ReportDialog } from "../components/report/ReportDialog";
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
import type { Account, FriendEntry, Post, Profile } from "../types";

/** Quan hệ giữa người xem và tài khoản đang mở */
type Relation = "self" | "friend" | "sent" | "received" | "none";

export function ProfilePage() {
  const { id } = useParams();
  const accountId = Number(id);
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const isMe = accountId === user?.id;

  const [account, setAccount] = useState<Account | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [friendsBlocked, setFriendsBlocked] = useState(false);
  const [relation, setRelation] = useState<Relation>("none");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);

  const loadRelation = useCallback(async () => {
    if (!user || isMe) {
      setRelation(isMe ? "self" : "none");
      return;
    }
    try {
      const [mine, sent, received] = await Promise.all([
        friendApi.listOf(user.id).catch(() => null),
        friendApi.sent(user.id).catch(() => null),
        friendApi.received(user.id).catch(() => null),
      ]);
      if (mine?.others?.some((f) => f.id === accountId)) setRelation("friend");
      else if (sent?.others?.some((f) => f.id === accountId))
        setRelation("sent");
      else if (received?.others?.some((f) => f.id === accountId))
        setRelation("received");
      else setRelation("none");
    } catch {
      setRelation("none");
    }
  }, [user, isMe, accountId]);

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

    // Danh sách bạn bè giờ chỉ chính chủ và bạn bè xem được; 403 là kết quả
    // hợp lệ chứ không phải lỗi, nên hiển thị thành thông báo riêng.
    try {
      const data = await friendApi.listOf(accountId);
      setFriends(data?.others ?? []);
      setFriendsBlocked(false);
    } catch (e) {
      setFriends([]);
      setFriendsBlocked(isForbidden(e));
    }

    await loadRelation();
  }, [accountId, loadRelation]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await loadRelation();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

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
            {account.roles && account.roles.length > 0 && (
              <div className="row" style={{ marginTop: 4 }}>
                {account.roles.map((role) => (
                  <Badge key={role} tone="brand">
                    {role}
                  </Badge>
                ))}
              </div>
            )}
            {account.isBanned ? <Badge tone="danger">Đã bị khoá</Badge> : null}
          </div>

          <div className="profile-actions">
            {/* Không còn nhánh "Tạo hồ sơ": mỗi tài khoản được backend cấp sẵn hồ sơ ngay khi
                đăng ký, nên với chính chủ luôn chỉ có một hành động là sửa. */}
            {isMe ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Sửa hồ sơ
              </Button>
            ) : (
              <>
                {relation === "friend" && (
                  <>
                    <Button onClick={() => navigate(`/messages/${accountId}`)}>
                      Nhắn tin
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => act(() => friendApi.remove(accountId))}
                    >
                      Huỷ kết bạn
                    </Button>
                  </>
                )}
                {relation === "sent" && (
                  <Button
                    variant="ghost"
                    onClick={() => act(() => friendApi.remove(accountId))}
                  >
                    Thu hồi lời mời
                  </Button>
                )}
                {relation === "received" && (
                  <>
                    <Button
                      onClick={() => act(() => friendApi.accept(accountId))}
                    >
                      Chấp nhận
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => act(() => friendApi.reject(accountId))}
                    >
                      Từ chối
                    </Button>
                  </>
                )}
                {relation === "none" && (
                  <Button
                    onClick={() =>
                      act(async () => {
                        await friendApi.request(accountId);
                        await notificationApi
                          .create(
                            accountId,
                            `${user?.username ?? "Ai đó"} đã gửi cho bạn lời mời kết bạn`,
                            "POST",
                          )
                          .catch(() => undefined);
                      })
                    }
                  >
                    Kết bạn
                  </Button>
                )}
                <Button
                  variant="icon"
                  title="Báo cáo người dùng"
                  onClick={() => setReporting(true)}
                >
                  🚩
                </Button>
              </>
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

      <Card tight>
        <CardHead
          title="Bạn bè"
          sub={friendsBlocked ? undefined : `${friends.length} người`}
        />
        {friendsBlocked ? (
          <div className="faint">
            🔒 Chỉ bạn bè của tài khoản này mới xem được danh sách bạn bè.
          </div>
        ) : friends.length === 0 ? (
          <div className="faint">Chưa có bạn bè</div>
        ) : (
          <div className="row" style={{ flexWrap: "wrap", gap: 14 }}>
            {friends.map((friend) => (
              <Link
                key={friend.id}
                to={`/profile/${friend.id}`}
                style={{ textAlign: "center", width: 72 }}
              >
                <Avatar src={friend.imageUrl} name={friend.username} size={56} />
                <div className="faint truncate" style={{ marginTop: 4 }}>
                  {friend.username}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

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

      <ReportDialog
        open={reporting}
        type="USER"
        targetId={accountId}
        onClose={() => setReporting(false)}
      />
    </>
  );
}

/**
 * Sửa hồ sơ của chính người gọi: MỘT bước PUT /v1/profiles, không kèm id.
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
      await profileApi.update(buildForm());
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
