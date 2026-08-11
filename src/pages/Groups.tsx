import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { accountApi, groupApi, postApi } from "../api/endpoints";
import { PostCard } from "../components/post/PostCard";
import { PostComposer } from "../components/post/PostComposer";
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
  Tabs,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { prefetchAccounts } from "../hooks/useAccountLite";
import type { Account, Group, GroupType, Post } from "../types";

type Tab = "suggest" | "joined" | "owned";

function GroupRow({ g }: { g: Group }) {
  return (
    <Link to={`/groups/${g.id}`} className="row">
      <Avatar src={g.coverUrl} name={g.name} size={44} />
      <div className="grow truncate">
        <div style={{ fontWeight: 650 }} className="truncate">
          {g.name}
        </div>
        <div className="faint">
          {g.totalMembers ?? g.members?.length ?? 0} thành viên · {g.type}
        </div>
      </div>
      <Badge tone={g.type === "PUBLIC" ? "ok" : "warn"}>{g.type}</Badge>
    </Link>
  );
}

export function GroupsPage() {
  const { user, can } = useAuth();
  const [tab, setTab] = useState<Tab>("suggest");
  const [items, setItems] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const data =
        tab === "suggest"
          ? await groupApi.suggest()
          : tab === "joined"
            ? await groupApi.joined(user.id)
            : await groupApi.owned(user.id);
      setItems(data);
    } catch (e) {
      setError(errorMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHead
        title="Nhóm"
        sub="Cộng đồng của những người nuôi thú cưng"
        action={
          // group:create nằm trong baseline — mọi user đã đăng nhập đều tạo được.
          can("group:create") ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              + Tạo nhóm
            </Button>
          ) : null
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "suggest", label: "Khám phá" },
          { value: "joined", label: "Đã tham gia" },
          { value: "owned", label: "Tôi quản lý" },
        ]}
      />

      <Alert>{error}</Alert>

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="🧩" title="Không có nhóm nào" />
      ) : (
        <div className="stack" style={{ marginTop: 14 }}>
          {items.map((g) => (
            <GroupRow key={g.id} g={g} />
          ))}
        </div>
      )}

      <GroupFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          setTab("owned");
        }}
      />
    </Card>
  );
}

/** Dùng chung cho tạo mới (POST /v1/groups) và sửa (PUT /v1/groups/:id) */
function GroupFormModal({
  open,
  group,
  onClose,
  onSaved,
}: {
  open: boolean;
  group?: Group;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(group);
  const [name, setName] = useState(group?.name ?? "");
  const [type, setType] = useState<GroupType>(group?.type ?? "PUBLIC");
  const [bio, setBio] = useState(group?.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    const file = fileRef.current?.files?.[0];
    // GroupController.modifyGroup đọc thẳng `uploadedImage.secure_url` nên
    // request PUT thiếu ảnh sẽ làm backend ném lỗi 500. Chặn tại đây cho rõ
    // ràng thay vì để người dùng nhận "Internal server error".
    if (editing && !file) {
      setError("Cập nhật nhóm bắt buộc chọn lại ảnh bìa (yêu cầu của API).");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("type", type);
      form.append("bio", bio);
      // owner KHÔNG gửi lên — backend lấy từ token và tự tạo bản ghi OWNER
      if (file) form.append("image", file);

      if (group) await groupApi.update(group.id, form);
      else await groupApi.create(form);

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
      title={editing ? "Sửa thông tin nhóm" : "Tạo nhóm mới"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {editing ? "Lưu" : "Tạo nhóm"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label>Tên nhóm</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Loại nhóm</label>
        <select
          className="select"
          value={type}
          onChange={(e) => setType(e.target.value as GroupType)}
        >
          <option value="PUBLIC">Công khai</option>
          <option value="PRIVATE">Riêng tư</option>
        </select>
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
        <label>Ảnh bìa</label>
        <input ref={fileRef} className="input" type="file" accept="image/*" />
        {editing && (
          <div className="faint">
            Bắt buộc khi cập nhật: API luôn đọc ảnh mới, bỏ trống sẽ lỗi.
          </div>
        )}
      </div>
      <Alert>{error}</Alert>
    </Modal>
  );
}

/** Mời thành viên: chọn từ danh sách tài khoản thay vì bắt gõ id bằng tay */
function InviteBox({
  groupId,
  memberIds,
  onInvited,
}: {
  groupId: number;
  memberIds: number[];
  onInvited: () => void;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [canList, setCanList] = useState(true);

  useEffect(() => {
    // GET /v1/accounts cần quyền account:read (staff). Người dùng thường sẽ
    // nhận 403 — khi đó rơi về ô nhập id thủ công.
    accountApi
      .list()
      .then(setCandidates)
      .catch(() => setCanList(false));
  }, []);

  async function invite(accountId: number) {
    try {
      await groupApi.addMember(groupId, accountId);
      setQuery("");
      onInvited();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const matches = candidates
    .filter((a) => !memberIds.includes(a.id))
    .filter((a) =>
      query.trim()
        ? a.username.toLowerCase().includes(query.trim().toLowerCase())
        : false,
    )
    .slice(0, 5);

  return (
    <div className="stack" style={{ marginTop: 14 }}>
      <div className="row">
        <input
          className="input grow"
          placeholder={
            canList ? "Tìm tài khoản để mời…" : "ID tài khoản muốn mời"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!canList && (
          <Button onClick={() => invite(Number(query))} disabled={!query}>
            Mời
          </Button>
        )}
      </div>
      {matches.map((account) => (
        <div key={account.id} className="row">
          <Avatar
            src={account.profile?.avatarUrl}
            name={account.username}
            size={32}
          />
          <div className="grow truncate">{account.username}</div>
          <Button size="sm" onClick={() => invite(account.id)}>
            Mời
          </Button>
        </div>
      ))}
      <Alert>{error}</Alert>
    </div>
  );
}

export function GroupDetailPage() {
  const { id } = useParams();
  const groupId = Number(id);
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      // Bảng tin của nhóm = lọc GET /v1/posts theo groupId
      const list = await postApi.feed({ groupId });
      prefetchAccounts(list.map((post) => post.accountId));
      setPosts(list);
    } catch {
      setPosts([]);
    }
  }, [groupId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroup(await groupApi.detail(groupId));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
    await loadPosts();
  }, [groupId, loadPosts]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner />;
  if (!group)
    return (
      <Card>
        <Alert>{error || "Không tìm thấy nhóm"}</Alert>
      </Card>
    );

  // `members` từ backend là bản ghi group_members (có cột role), không còn là
  // mảng Accounts như trước.
  const members = group.members ?? [];
  const myRole = members.find((m) => m.accountId === user?.id)?.role;
  const isMember = Boolean(myRole);
  const canManage = myRole === "OWNER" || myRole === "ADMIN";
  // Chủ nhóm xoá nhóm mình; staff có group:delete xoá được nhóm bất kỳ
  const canDeleteGroup = myRole === "OWNER" || can("group:delete");

  return (
    <>
      <Card>
        {group.coverUrl ? (
          <img className="cover" src={group.coverUrl} alt="" />
        ) : (
          <div className="cover" />
        )}
        <div className="row-between" style={{ marginTop: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20 }}>{group.name}</div>
            <div className="faint">
              {members.length} thành viên · {group.type}
              {myRole && ` · Bạn là ${myRole}`}
            </div>
          </div>
          <div className="row">
            <Button variant="ghost" size="sm" onClick={() => setReporting(true)}>
              🚩 Báo cáo
            </Button>
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Sửa nhóm
              </Button>
            )}
            {canDeleteGroup && (
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  if (!confirm("Xoá nhóm này?")) return;
                  try {
                    await groupApi.remove(groupId);
                    navigate("/groups");
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                Xoá nhóm
              </Button>
            )}
          </div>
        </div>
        {group.bio && <p className="muted">{group.bio}</p>}
        <Alert>{error}</Alert>
      </Card>

      {isMember ? (
        <PostComposer groupId={groupId} onPosted={loadPosts} />
      ) : (
        <Card tight>
          <div className="faint">
            Bạn chưa là thành viên nhóm này. Backend chưa có luồng tự xin gia
            nhập — cần quản trị viên nhóm mời bạn vào.
          </div>
        </Card>
      )}

      <Card>
        <CardHead title="Thành viên" />
        <div className="stack">
          {members.map((member) => (
            <div key={member.accountId} className="row">
              <Avatar
                src={member.account?.profile?.avatarUrl}
                name={member.account?.username}
                size={38}
              />
              <Link to={`/profile/${member.accountId}`} className="grow">
                <div style={{ fontWeight: 650 }}>
                  {member.account?.username ?? `#${member.accountId}`}
                </div>
              </Link>
              <Badge
                tone={
                  member.role === "OWNER"
                    ? "brand"
                    : member.role === "ADMIN"
                      ? "warn"
                      : "default"
                }
              >
                {member.role}
              </Badge>
              {canManage && member.role !== "OWNER" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await groupApi.removeMember(groupId, member.accountId);
                      load();
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                >
                  Xoá
                </Button>
              )}
            </div>
          ))}
        </div>

        {canManage && (
          <InviteBox
            groupId={groupId}
            memberIds={members.map((m) => m.accountId)}
            onInvited={load}
          />
        )}
      </Card>

      <CardHead title="Bài viết trong nhóm" />
      {posts.length === 0 ? (
        <Card>
          <EmptyState icon="📝" title="Nhóm chưa có bài viết nào" />
        </Card>
      ) : (
        posts.map((post) => (
          <PostCard key={post.postId} post={post} onChanged={loadPosts} />
        ))
      )}

      <GroupFormModal
        open={editing}
        group={group}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          load();
        }}
      />

      <ReportDialog
        open={reporting}
        type="GROUP"
        targetId={groupId}
        onClose={() => setReporting(false)}
      />
    </>
  );
}
