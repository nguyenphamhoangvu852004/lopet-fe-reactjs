import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { groupApi, petProfileApi, postApi } from "../api/endpoints";
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
  timeAgo,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useActivePet } from "../context/PetContext";
import { useGroupInvites } from "../hooks/useGroupInvites";
import { prefetchPetProfiles } from "../hooks/usePetProfileLite";
import type {
  Group,
  GroupInvite,
  GroupJoinRequest,
  GroupType,
  Post,
  PublicPetProfile,
} from "../types";

type Tab = "suggest" | "joined" | "owned" | "invites";

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
  const { invites, reload: reloadInvites } = useGroupInvites();

  const load = useCallback(async () => {
    if (!user) return;
    // Tab lời mời có nguồn dữ liệu riêng (theo thú cưng, không theo tài khoản)
    // nên useGroupInvites lo phần đó, ở đây không gọi gì.
    if (tab === "invites") {
      setLoading(false);
      return;
    }
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
          {
            // Số nằm trong nhãn thay vì một huy hiệu riêng: Tabs chỉ nhận chuỗi,
            // và con số này chính là thứ khiến người dùng bấm vào tab.
            value: "invites",
            label: invites.length ? `Lời mời (${invites.length})` : "Lời mời",
          },
        ]}
      />

      <Alert>{error}</Alert>

      {tab === "invites" ? (
        <InviteInbox invites={invites} onAnswered={reloadInvites} />
      ) : loading ? (
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

/**
 * Hộp thư lời mời vào nhóm của THÚ CƯNG đang thao tác.
 *
 * Mỗi dòng nói rõ ai mời và mời vào nhóm nào: một lời mời không có ngữ cảnh thì
 * người dùng không có cơ sở gì để quyết định. Nhóm riêng tư vẫn hiện tên ở đây dù
 * người được mời chưa đọc được nội dung bên trong — biết mình được mời vào đâu là
 * điều kiện tối thiểu để trả lời.
 */
function InviteInbox({
  invites,
  onAnswered,
}: {
  invites: GroupInvite[];
  onAnswered: () => void;
}) {
  const { activePet } = useActivePet();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function answer(groupId: number, accept: boolean) {
    setBusy(groupId);
    setError("");
    try {
      if (accept) await groupApi.acceptInvite(groupId);
      else await groupApi.rejectInvite(groupId);
      onAnswered();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (!activePet) {
    return (
      <EmptyState
        icon="🐾"
        title="Chưa chọn thú cưng nào"
        hint="Lời mời gửi cho từng bé, nên hãy chọn một bé để xem hộp thư của bé đó."
      />
    );
  }

  if (invites.length === 0) {
    return (
      <EmptyState
        icon="📭"
        title="Không có lời mời nào"
        hint={`${activePet.profile.displayName} chưa được mời vào nhóm nào.`}
      />
    );
  }

  return (
    <div className="stack" style={{ marginTop: 14 }}>
      <Alert>{error}</Alert>
      {invites.map((invite) => {
        const inviter =
          invite.invitedBy?.displayName || invite.invitedBy?.name || "";
        return (
          <div key={invite.groupId} className="row">
            <Avatar name={invite.groupName} size={44} />
            <div className="grow truncate">
              <Link to={`/groups/${invite.groupId}`} className="truncate">
                <span style={{ fontWeight: 650 }}>{invite.groupName}</span>
              </Link>
              <div className="faint truncate">
                {inviter ? `${inviter} đã mời` : "Được mời"}
                {invite.invitedAt ? ` · ${timeAgo(invite.invitedAt)}` : ""}
              </div>
            </div>
            <Badge tone={invite.groupType === "PUBLIC" ? "ok" : "warn"}>
              {invite.groupType}
            </Badge>
            <Button
              size="sm"
              disabled={busy === invite.groupId}
              onClick={() => answer(invite.groupId, true)}
            >
              Chấp nhận
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === invite.groupId}
              onClick={() => answer(invite.groupId, false)}
            >
              Từ chối
            </Button>
          </div>
        );
      })}
    </div>
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
        {/* Hệ quả của lựa chọn này khác nhau rất nhiều, nên nói ngay tại chỗ chọn */}
        <div className="faint">
          {type === "PUBLIC"
            ? "Ai cũng đọc được bài trong nhóm, và tham gia được ngay."
            : "Chỉ thành viên đọc được bài. Người mới phải gửi yêu cầu và chờ quản trị viên duyệt."}
        </div>
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

/**
 * Mời thành viên — tra theo HANDLE của thú cưng.
 *
 * Thành viên nhóm nay là con vật (`group_members.pet_id`), nên danh sách tài
 * khoản không còn dùng được ở đây. Backend cũng chỉ có đúng một đường tra cứu
 * công khai: `GET /v1/pet-profiles/handle/{handle}` — tra chính xác, không có
 * tìm mờ. Vì thế ô nhập yêu cầu handle đầy đủ thay vì gợi ý khi gõ.
 *
 * MỌI thành viên đều mời được, không riêng quản trị viên: lời mời chỉ tạo một hàng
 * chờ và không cấp quyền đọc gì cho tới khi người được mời đồng ý.
 */
function InviteBox({
  groupId,
  memberPetIds,
  onInvited,
}: {
  groupId: number;
  memberPetIds: number[];
  onInvited: () => void;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PublicPetProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  async function lookup() {
    const handle = query.trim().replace(/^@/, "");
    if (!handle) return;
    setBusy(true);
    setError("");
    setSent("");
    setFound(null);
    try {
      setFound(await petProfileApi.byHandle(handle));
    } catch {
      // Hồ sơ riêng tư và hồ sơ không tồn tại đều trả 404 — backend cố ý không
      // phân biệt, nên thông báo ở đây cũng không được đoán hộ.
      setError(`Không tìm thấy thú cưng có handle “${handle}”`);
    } finally {
      setBusy(false);
    }
  }

  async function invite(petId: number, name: string) {
    try {
      await groupApi.invite(groupId, petId);
      setQuery("");
      setFound(null);
      // Nói rõ lời mời còn phải chờ: người mời rất dễ tưởng đã thêm xong, rồi thắc
      // mắc vì sao con vật đó không xuất hiện trong danh sách thành viên.
      setSent(`Đã gửi lời mời tới ${name}. Bé sẽ vào nhóm khi chấp nhận.`);
      onInvited();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const alreadyIn = found ? memberPetIds.includes(found.petId) : false;

  return (
    <div className="stack" style={{ marginTop: 14 }}>
      <div className="row">
        <input
          className="input grow"
          placeholder="Handle của thú cưng, ví dụ @milo"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
        />
        <Button onClick={lookup} disabled={busy || !query.trim()}>
          {busy ? "Đang tìm…" : "Tìm"}
        </Button>
      </div>

      {found && (
        <div className="row">
          <Avatar
            src={found.avatarUrl ?? undefined}
            name={found.displayName}
            size={32}
          />
          <div className="grow truncate">
            <div style={{ fontWeight: 650 }}>{found.displayName}</div>
            <div className="faint">@{found.handle}</div>
          </div>
          <Button
            size="sm"
            disabled={alreadyIn}
            onClick={() => invite(found.petId, found.displayName)}
          >
            {alreadyIn ? "Đã ở trong nhóm" : "Gửi lời mời"}
          </Button>
        </div>
      )}
      {sent && <Alert kind="ok">{sent}</Alert>}
      <Alert>{error}</Alert>
    </div>
  );
}

/**
 * Hộp thư yêu cầu vào nhóm — chỉ quản trị viên nhóm thấy.
 *
 * Danh sách này KHÔNG lẫn lời mời. Hai loại đều là hàng chờ, nhưng người có quyền
 * trả lời thì khác nhau: yêu cầu do quản trị viên duyệt, còn lời mời do chính bé
 * được mời trả lời. Backend tách chúng ở hai endpoint và giao diện tách theo.
 */
function JoinRequestsCard({
  groupId,
  onChanged,
}: {
  groupId: number;
  onChanged: () => void;
}) {
  const [requests, setRequests] = useState<GroupJoinRequest[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setRequests(await groupApi.joinRequests(groupId));
    } catch (e) {
      setError(errorMessage(e));
      setRequests([]);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(petId: number, approve: boolean) {
    setBusy(petId);
    setError("");
    try {
      if (approve) await groupApi.approveJoinRequest(groupId, petId);
      else await groupApi.rejectJoinRequest(groupId, petId);
      await load();
      // Duyệt xong thì danh sách thành viên và số đếm đổi theo; từ chối thì không
      if (approve) onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  // Không có yêu cầu nào thì không chiếm chỗ bằng một thẻ rỗng
  if (requests.length === 0 && !error) return null;

  return (
    <Card>
      <CardHead
        title="Yêu cầu tham gia"
        sub={requests.length ? `${requests.length} bé đang chờ duyệt` : undefined}
      />
      <Alert>{error}</Alert>
      <div className="stack">
        {requests.map((request) => (
          <div key={request.petId} className="row">
            <Avatar
              src={request.pet?.avatarUrl || undefined}
              name={request.pet?.displayName || request.pet?.name}
              size={38}
            />
            <Link to={`/pets/${request.petId}`} className="grow truncate">
              <div style={{ fontWeight: 650 }}>
                {request.pet?.displayName ||
                  request.pet?.name ||
                  `Thú cưng #${request.petId}`}
              </div>
              <div className="faint">
                {request.pet?.handle ? `@${request.pet.handle}` : ""}
                {request.requestedAt
                  ? `${request.pet?.handle ? " · " : ""}${timeAgo(request.requestedAt)}`
                  : ""}
              </div>
            </Link>
            <Button
              size="sm"
              disabled={busy === request.petId}
              onClick={() => review(request.petId, true)}
            >
              Duyệt
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === request.petId}
              onClick={() => review(request.petId, false)}
            >
              Từ chối
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Nút quan hệ với nhóm — bốn hình dạng, lấy trực tiếp từ `group.viewerStatus`.
 *
 * Trạng thái do BACKEND tính chứ không suy từ danh sách thành viên: ở nhóm riêng
 * tư danh sách đó bị che, nên suy ở phía client sẽ luôn ra "chưa tham gia" và người
 * đã gửi yêu cầu lại thấy một cái nút mời họ gửi lần nữa.
 *
 * Chủ nhóm không có nút rời nhóm: backend trả 400 cho việc đó, và một cái nút chỉ
 * để hiện lỗi thì không nên tồn tại. Cách thoát thật được nói ở phần thông tin nhóm.
 */
function MembershipControl({
  group,
  isOwner,
  onChanged,
}: {
  group: Group;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const { activePet } = useActivePet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = group.viewerStatus ?? "NONE";

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Mọi hành động ở đây đều cần `X-Pet-Id`. Nút bị chặn kèm lý do, thay vì để người
  // dùng bấm rồi nhận một lỗi 400 mà họ không biết sửa ở đâu.
  if (!activePet) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled
        title="Chọn một bé ở trang Thú cưng để tham gia nhóm"
      >
        Chọn bé để tham gia
      </Button>
    );
  }

  if (status === "MEMBER") {
    if (isOwner) return <Badge tone="brand">Chủ nhóm</Badge>;
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            if (!confirm(`Cho ${activePet.profile.displayName} rời nhóm này?`)) {
              return;
            }
            run(() => groupApi.leave(group.id));
          }}
        >
          Rời nhóm
        </Button>
        <MembershipError message={error} />
      </>
    );
  }

  if (status === "PENDING_REQUEST") {
    return (
      <>
        <Badge tone="warn">Đang chờ duyệt</Badge>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => run(() => groupApi.cancelJoinRequest(group.id))}
        >
          Huỷ yêu cầu
        </Button>
        <MembershipError message={error} />
      </>
    );
  }

  if (status === "PENDING_INVITE") {
    return (
      <>
        <Badge tone="brand">Được mời</Badge>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => run(() => groupApi.acceptInvite(group.id))}
        >
          Chấp nhận
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => run(() => groupApi.rejectInvite(group.id))}
        >
          Từ chối
        </Button>
        <MembershipError message={error} />
      </>
    );
  }

  // NONE — nhãn nói đúng việc sắp xảy ra: với nhóm riêng tư đây là GỬI YÊU CẦU chứ
  // không phải tham gia, và người dùng cần biết điều đó TRƯỚC khi bấm.
  return (
    <>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => run(() => groupApi.join(group.id))}
      >
        {group.type === "PUBLIC" ? "Tham gia nhóm" : "Gửi yêu cầu tham gia"}
      </Button>
      <MembershipError message={error} />
    </>
  );
}

/** Lỗi của hành động thành viên, xuống dòng riêng để không bóp méo hàng nút */
function MembershipError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="alert alert-error" style={{ width: "100%", marginTop: 8 }}>
      {message}
    </div>
  );
}

export function GroupDetailPage() {
  const { id } = useParams();
  const groupId = Number(id);
  const { can } = useAuth();
  const { activePet, activePetId } = useActivePet();
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
      prefetchPetProfiles(list.map((post) => post.petId));
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

  // Đổi bé đang thao tác thì phải nạp lại: `viewerStatus`, danh sách thành viên và
  // cả danh sách bài đọc được đều tính theo `X-Pet-Id`, nên dữ liệu của bé trước
  // không còn đúng cho bé sau.
  useEffect(() => {
    load();
  }, [load, activePetId]);

  if (loading) return <Spinner />;
  if (!group)
    return (
      <Card>
        <Alert>{error || "Không tìm thấy nhóm"}</Alert>
      </Card>
    );

  /**
   * `members` là bản ghi group_members, và chủ thể của nó nay là THÚ CƯNG.
   *
   * Vai trò xét theo con ĐANG THAO TÁC chứ không theo tài khoản: backend đặt
   * khoá chính `(group_id, pet_id)` và `GroupService` đọc pet từ header, nên
   * "chủ tôi có trong nhóm" không còn là câu trả lời hợp lệ. Hệ quả thấy được
   * trên giao diện: đổi sang con khác thì các nút quản trị biến mất — đúng như
   * request sẽ bị backend từ chối.
   *
   * Danh sách chỉ còn thành viên ACTIVE: bé đang chờ duyệt hoặc đang được mời không
   * nằm ở đây, và với người ngoài một nhóm riêng tư thì nó rỗng hẳn.
   */
  const members = group.members ?? [];
  const myRole = members.find((m) => m.petId === activePet?.petId)?.role;
  // Tư cách thành viên đọc từ `viewerStatus` của backend chứ không suy từ `members`:
  // nhóm riêng tư che danh sách, nên phép suy đó sai với chính thành viên của nhóm.
  const isMember = group.viewerStatus
    ? group.viewerStatus === "MEMBER"
    : Boolean(myRole);
  const isOwner = myRole === "OWNER";
  const canManage = myRole === "OWNER" || myRole === "ADMIN";
  // Chủ nhóm xoá nhóm mình; staff có group:delete xoá được nhóm bất kỳ
  const canDeleteGroup = myRole === "OWNER" || can("group:delete");
  const restricted = Boolean(group.restricted);

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
              {/* totalMembers là số ACTIVE thật — đúng cả khi danh sách bị che */}
              {group.totalMembers ?? members.length} thành viên · {group.type}
              {myRole && activePet
                ? ` · ${activePet.profile.displayName} là ${myRole}`
                : ""}
            </div>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <MembershipControl
              group={group}
              isOwner={isOwner}
              onChanged={load}
            />
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
        {isOwner && (
          <div className="faint">
            Chủ nhóm không rời nhóm được — nhóm sẽ còn lại mà không ai đủ quyền quản
            lý. Muốn dứt thì xoá nhóm.
          </div>
        )}
        <Alert>{error}</Alert>
      </Card>

      {restricted ? (
        /**
         * Nhóm riêng tư và người xem chưa phải thành viên. Backend đã che danh sách
         * thành viên và không trả về bài nào — nên phải nói rõ nội dung BỊ CHE, chứ
         * không để người dùng hiểu là nhóm trống rỗng.
         */
        <Card>
          <EmptyState
            icon="🔒"
            title="Nội dung nhóm chỉ dành cho thành viên"
            hint={
              group.viewerStatus === "PENDING_REQUEST"
                ? "Yêu cầu của bạn đang chờ quản trị viên duyệt. Được duyệt là thấy ngay bài viết và danh sách thành viên."
                : group.viewerStatus === "PENDING_INVITE"
                  ? "Bạn đang được mời vào nhóm này. Chấp nhận lời mời để xem bài viết và thành viên."
                  : "Gửi yêu cầu tham gia để xem bài viết và danh sách thành viên của nhóm."
            }
          />
        </Card>
      ) : (
        <>
          {isMember ? (
            <PostComposer groupId={groupId} onPosted={loadPosts} />
          ) : (
            <Card tight>
              <div className="faint">
                {activePet
                  ? `${activePet.profile.displayName} chưa là thành viên nhóm này nên chưa đăng bài được.`
                  : "Bạn chưa chọn thú cưng nào."}{" "}
                Tư cách thành viên gắn với từng bé, không với tài khoản — một bé
                khác của bạn có thể đang ở trong nhóm.
              </div>
            </Card>
          )}

          {canManage && <JoinRequestsCard groupId={groupId} onChanged={load} />}

          <Card>
            <CardHead
              title="Thành viên"
              sub={
                canManage
                  ? "Bé đang chờ duyệt chưa nằm trong danh sách này"
                  : undefined
              }
            />
            <div className="stack">
              {members.map((member) => (
                <div key={member.petId} className="row">
                  <Avatar
                    src={member.pet?.avatarUrl || undefined}
                    name={member.pet?.displayName || member.pet?.name}
                    size={38}
                  />
                  <Link to={`/pets/${member.petId}`} className="grow">
                    <div style={{ fontWeight: 650 }}>
                      {member.pet?.displayName ||
                        member.pet?.name ||
                        `Thú cưng #${member.petId}`}
                    </div>
                    {member.pet?.handle && (
                      <div className="faint">@{member.pet.handle}</div>
                    )}
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
                          await groupApi.removeMember(groupId, member.petId);
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

            {/* Mọi thành viên đều mời được, không riêng quản trị viên: lời mời chỉ
                là một hàng chờ, và người được mời mới là người quyết định. */}
            {isMember && (
              <InviteBox
                groupId={groupId}
                memberPetIds={members.map((m) => m.petId)}
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
        </>
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
