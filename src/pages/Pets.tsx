import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { groupApi, petApi, petProfileApi, postApi } from "../api/endpoints";
import { PostCard } from "../components/post/PostCard";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  Modal,
  Spinner,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useActivePet } from "../context/PetContext";
import { invalidatePetProfile } from "../hooks/usePetProfileLite";
import type {
  Group,
  OwnedPetProfile,
  PetDetail,
  PetGender,
  PetInput,
  PetListItem,
  PetSpecies,
  PetVisibility,
  Post,
} from "../types";

/* ─────────────────────── nhãn hiển thị ─────────────────────── */

/**
 * Giá trị bên trái phải khớp TỪNG KÝ TỰ với enum của backend — chúng được gửi
 * thẳng lên API.
 */
const SPECIES: { value: PetSpecies; label: string; glyph: string }[] = [
  { value: "DOG", label: "Chó", glyph: "🐶" },
  { value: "CAT", label: "Mèo", glyph: "🐱" },
  { value: "BIRD", label: "Chim", glyph: "🐦" },
  { value: "RABBIT", label: "Thỏ", glyph: "🐰" },
  { value: "HAMSTER", label: "Hamster", glyph: "🐹" },
  { value: "FISH", label: "Cá", glyph: "🐠" },
  { value: "REPTILE", label: "Bò sát", glyph: "🦎" },
  { value: "OTHER", label: "Khác", glyph: "🐾" },
];

const GENDERS: { value: PetGender; label: string }[] = [
  { value: "MALE", label: "Đực" },
  { value: "FEMALE", label: "Cái" },
  { value: "UNKNOWN", label: "Chưa rõ" },
];

const VISIBILITIES: { value: PetVisibility; label: string; hint: string }[] = [
  { value: "PUBLIC", label: "Công khai", hint: "Ai cũng xem được hồ sơ này" },
  {
    value: "FOLLOWERS",
    label: "Người theo dõi",
    hint: "Đồ thị theo dõi chưa có — backend tạm xử lý như Riêng tư",
  },
  { value: "PRIVATE", label: "Riêng tư", hint: "Chỉ chủ sở hữu xem được" },
];

function speciesOf(value: PetSpecies) {
  return SPECIES.find((s) => s.value === value) ?? SPECIES[SPECIES.length - 1];
}

function genderLabel(value: PetGender) {
  return GENDERS.find((g) => g.value === value)?.label ?? value;
}

function visibilityLabel(value: PetVisibility) {
  return VISIBILITIES.find((v) => v.value === value)?.label ?? value;
}

/** Tuổi tính theo năm/tháng — dễ đọc hơn ngày sinh trần */
export function ageFrom(dateOfBirth?: string) {
  if (!dateOfBirth) return "";
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return "";

  const now = new Date();
  let months =
    (now.getFullYear() - born.getFullYear()) * 12 +
    (now.getMonth() - born.getMonth());
  if (now.getDate() < born.getDate()) months -= 1;
  if (months < 0) return "";
  if (months < 1) return "chưa đầy 1 tháng";
  if (months < 24) return `${months} tháng`;
  return `${Math.floor(months / 12)} tuổi`;
}

/** yyyy-MM-dd của hôm nay — chặn chọn ngày tương lai ngay trên input */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ───────────────────────── danh sách ───────────────────────── */

function PetRow({
  pet,
  active,
  onSelect,
}: {
  pet: PetListItem;
  active: boolean;
  onSelect: () => void;
}) {
  const species = speciesOf(pet.species);
  const age = ageFrom(pet.dateOfBirth);

  return (
    <div className="row">
      <Link to={`/pets/${pet.petId}`} className="row grow truncate">
        {pet.profile.avatarUrl ? (
          <img
            src={pet.profile.avatarUrl}
            alt=""
            className="avatar"
            style={{ width: 44, height: 44, objectFit: "cover" }}
          />
        ) : (
          <div
            className="avatar"
            style={{ width: 44, height: 44, fontSize: 22 }}
            title={species.label}
          >
            {species.glyph}
          </div>
        )}
        <div className="grow truncate">
          <div style={{ fontWeight: 650 }} className="truncate">
            {pet.profile.displayName}
            {pet.profile.displayName !== pet.name ? ` (${pet.name})` : ""}
          </div>
          <div className="faint truncate">
            @{pet.profile.handle} · {species.label}
            {pet.breed ? ` · ${pet.breed}` : ""} · {genderLabel(pet.gender)}
            {age ? ` · ${age}` : ""}
          </div>
        </div>
      </Link>

      <Badge tone={pet.profile.visibility === "PUBLIC" ? "ok" : "default"}>
        {visibilityLabel(pet.profile.visibility)}
      </Badge>

      {/* Đây là chỗ đổi "đang thao tác nhân danh ai" ngay tại danh sách; bản rút
          gọn của nó nằm thường trực trên thanh header. */}
      {active ? (
        <Badge tone="brand">Đang thao tác</Badge>
      ) : (
        <Button size="sm" variant="outline" onClick={onSelect}>
          Thao tác với bé này
        </Button>
      )}
    </div>
  );
}

export function PetsPage() {
  const { user, can } = useAuth();
  const { pets, activePetId, select, reload, ready } = useActivePet();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) void reload();
  }, [user, reload]);

  return (
    <Card>
      <CardHead
        title="Thú cưng"
        sub="Mỗi bé là một danh tính riêng trên mạng xã hội"
        action={
          // pet:create nằm trong baseline — mọi tài khoản đã đăng nhập đều tạo được
          can("pet:create") ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              + Thêm thú cưng
            </Button>
          ) : null
        }
      />

      <Alert>{error}</Alert>

      {!ready ? (
        <Spinner />
      ) : pets.length === 0 ? (
        <EmptyState
          icon="🐾"
          title="Bạn chưa có thú cưng nào"
          hint="Bài viết, bình luận và nhóm đều gắn với một bé cụ thể — tạo hồ sơ đầu tiên để bắt đầu"
        />
      ) : (
        <div className="stack" style={{ marginTop: 14 }}>
          {pets.map((pet) => (
            <PetRow
              key={pet.petId}
              pet={pet}
              active={pet.petId === activePetId}
              onSelect={() => select(pet.petId)}
            />
          ))}
        </div>
      )}

      <PetFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={async (saved) => {
          setCreating(false);
          await reload();
          // Bé vừa tạo trở thành con đang thao tác: người dùng vừa nói rõ mình
          // quan tâm tới nó, và tài khoản mới thì đây là con duy nhất.
          select(saved.petId);
          setError("");
        }}
      />
    </Card>
  );
}

/* ──────────────── form dữ liệu sinh học (bảng pets) ────────────── */

/**
 * Tạo (POST /v1/pets) và sửa (PUT /v1/pets/:petId) phần SINH HỌC.
 *
 * `bio`, `avatar` và `visibility` KHÔNG nằm ở đây — chúng thuộc hồ sơ công khai
 * (`pet_profiles`) và sửa qua {@link PetProfileFormModal}. Ranh giới đó là của
 * backend: loài, giống, ngày sinh là sự thật về con vật và không đổi theo cách
 * nó xuất hiện trước người khác.
 *
 * Ngoại lệ duy nhất là lúc TẠO: hồ sơ công khai sinh cùng transaction nên
 * `visibility` được chọn ngay ở bước này.
 */
export function PetFormModal({
  open,
  pet,
  onClose,
  onSaved,
}: {
  open: boolean;
  pet?: PetDetail;
  onClose: () => void;
  onSaved: (saved: PetDetail) => void | Promise<void>;
}) {
  const editing = Boolean(pet);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<PetSpecies>("DOG");
  const [breed, setBreed] = useState("");
  const [gender, setGender] = useState<PetGender>("UNKNOWN");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [visibility, setVisibility] = useState<PetVisibility>("PUBLIC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Nạp lại mỗi lần mở: modal không bị unmount giữa hai lần mở nên state cũ sẽ
  // dính sang hồ sơ khác nếu không đồng bộ ở đây.
  useEffect(() => {
    if (!open) return;
    setName(pet?.name ?? "");
    setSpecies(pet?.species ?? "DOG");
    setBreed(pet?.breed ?? "");
    setGender(pet?.gender ?? "UNKNOWN");
    setDateOfBirth(pet?.dateOfBirth ?? "");
    setVisibility(pet?.profile?.visibility ?? "PUBLIC");
    setError("");
  }, [open, pet]);

  async function submit() {
    // Ràng buộc dưới đây trùng với Bean Validation của backend. Kiểm ở đây để
    // người dùng không phải chờ một vòng request mới biết mình gõ sai.
    if (!name.trim()) return setError("Tên thú cưng không được để trống");
    if (name.trim().length > 50) return setError("Tên tối đa 50 ký tự");
    if (!dateOfBirth) return setError("Vui lòng chọn ngày sinh");
    if (dateOfBirth > today())
      return setError("Ngày sinh không được ở tương lai");
    if (breed.length > 100) return setError("Giống tối đa 100 ký tự");

    setBusy(true);
    setError("");
    try {
      const base = {
        name: name.trim(),
        species,
        breed: breed.trim() || null,
        gender,
        dateOfBirth,
      };
      const saved = pet
        ? await petApi.update(pet.petId, base)
        : await petApi.create({ ...base, visibility } as PetInput);
      await onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={editing ? "Sửa thông tin thú cưng" : "Thêm thú cưng"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {editing ? "Lưu" : "Tạo hồ sơ"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="pet-name">Tên</label>
        <input
          id="pet-name"
          className="input"
          value={name}
          maxLength={50}
          onChange={(e) => setName(e.target.value)}
          placeholder="Milo"
        />
        <div className="faint">
          Tên thật của bé, chỉ bạn thấy trong danh sách này. Tên hiển thị ra
          ngoài đặt riêng ở hồ sơ công khai.
        </div>
      </div>

      <div className="field">
        <label htmlFor="pet-species">Loài</label>
        <select
          id="pet-species"
          className="select"
          value={species}
          onChange={(e) => setSpecies(e.target.value as PetSpecies)}
        >
          {SPECIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.glyph} {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="pet-breed">Giống</label>
        <input
          id="pet-breed"
          className="input"
          value={breed}
          maxLength={100}
          onChange={(e) => setBreed(e.target.value)}
          placeholder="Golden Retriever (không bắt buộc)"
        />
      </div>

      <div className="field">
        <label htmlFor="pet-gender">Giới tính</label>
        <select
          id="pet-gender"
          className="select"
          value={gender}
          onChange={(e) => setGender(e.target.value as PetGender)}
        >
          {GENDERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="pet-dob">Ngày sinh</label>
        {/* max=today: cột date_of_birth đang NOT NULL và backend từ chối ngày
            tương lai, nên chặn ngay ở input cho khỏi mất một vòng request */}
        <input
          id="pet-dob"
          className="input"
          type="date"
          value={dateOfBirth}
          max={today()}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
      </div>

      {/* Chỉ ở bước TẠO: sau đó phạm vi riêng tư thuộc về hồ sơ công khai và
          sửa ở PUT /v1/pet-profiles/:petId, gửi kèm tại đây sẽ bị bỏ qua. */}
      {!editing && (
        <div className="field">
          <label htmlFor="pet-visibility">Ai được xem hồ sơ</label>
          <select
            id="pet-visibility"
            className="select"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as PetVisibility)}
          >
            {VISIBILITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="faint">
            {VISIBILITIES.find((v) => v.value === visibility)?.hint}
          </div>
        </div>
      )}

      <Alert>{error}</Alert>
    </Modal>
  );
}

/* ─────────── form hồ sơ công khai (bảng pet_profiles) ────────── */

/**
 * PUT /v1/pet-profiles/:petId — mặt công khai của con vật.
 *
 * Ảnh gửi bằng FILE qua multipart, cùng luồng với hồ sơ tài khoản: backend đẩy
 * lên Cloudinary rồi lưu URL trả về.
 *
 * Quy ước ba trạng thái của mỗi ô ảnh, và cả ba đều cần thiết:
 *  - không đụng gì  -> không gửi trường nào, backend giữ nguyên ảnh cũ
 *  - chọn file mới  -> gửi phần `avatar`/`cover`, backend upload và thay
 *  - tick "xoá ảnh" -> gửi `avatarUrl`/`coverUrl` là chuỗi rỗng
 *
 * Thiếu trạng thái thứ nhất thì mỗi lần sửa bio không kèm ảnh là mất avatar —
 * đúng lỗi mà hồ sơ tài khoản đã phải sửa trước đây.
 */
export function PetProfileFormModal({
  open,
  petId,
  profile,
  onClose,
  onSaved,
}: {
  open: boolean;
  petId: number;
  profile?: OwnedPetProfile | null;
  onClose: () => void;
  onSaved: (saved: OwnedPetProfile) => void | Promise<void>;
}) {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [visibility, setVisibility] = useState<PetVisibility>("PUBLIC");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeCover, setRemoveCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setHandle(profile?.handle ?? "");
    setDisplayName(profile?.displayName ?? "");
    setBio(profile?.bio ?? "");
    setVisibility(profile?.visibility ?? "PUBLIC");
    setRemoveAvatar(false);
    setRemoveCover(false);
    if (avatarRef.current) avatarRef.current.value = "";
    if (coverRef.current) coverRef.current.value = "";
    setError("");
  }, [open, profile]);

  async function submit() {
    if (!handle.trim()) return setError("Handle không được để trống");
    if (handle.trim().length > 30) return setError("Handle tối đa 30 ký tự");
    if (!displayName.trim()) return setError("Tên hiển thị không được để trống");
    if (displayName.trim().length > 50)
      return setError("Tên hiển thị tối đa 50 ký tự");
    if (bio.length > 500) return setError("Giới thiệu tối đa 500 ký tự");

    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      // Backend chuẩn hoá về chữ thường ở PetPolicy; gửi sẵn dạng đó để giá trị
      // hiện trên form khớp với thứ sẽ được lưu.
      form.append("handle", handle.trim().toLowerCase());
      form.append("displayName", displayName.trim());
      form.append("bio", bio.trim());
      form.append("visibility", visibility);

      const avatarFile = avatarRef.current?.files?.[0];
      const coverFile = coverRef.current?.files?.[0];
      // Ba trạng thái, xem ghi chú ở đầu component. Nhánh "giữ nguyên" là nhánh
      // KHÔNG gửi gì cả — im lặng chính là tín hiệu.
      if (avatarFile) form.append("avatar", avatarFile);
      else if (removeAvatar) form.append("avatarUrl", "");
      if (coverFile) form.append("cover", coverFile);
      else if (removeCover) form.append("coverUrl", "");

      const saved = await petProfileApi.update(petId, form);
      // Tên/ảnh cũ còn nằm trong cache của mọi bài đã render
      invalidatePetProfile(petId);
      await onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Sửa hồ sơ công khai"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="pp-handle">Handle</label>
        <input
          id="pp-handle"
          className="input"
          value={handle}
          maxLength={30}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="milo"
        />
        <div className="faint">
          Định danh duy nhất, dùng để người khác tìm ra bé. Trùng handle sẽ bị
          backend từ chối (409).
        </div>
      </div>

      <div className="field">
        <label htmlFor="pp-name">Tên hiển thị</label>
        <input
          id="pp-name"
          className="input"
          value={displayName}
          maxLength={50}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="pp-bio">Giới thiệu</label>
        <textarea
          id="pp-bio"
          className="textarea"
          value={bio}
          maxLength={500}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Lúc nào cũng đói."
        />
        <div className="faint">{bio.length}/500</div>
      </div>

      <div className="field">
        <label htmlFor="pp-avatar">Ảnh đại diện</label>
        {profile?.avatarUrl && !removeAvatar && (
          <img
            src={profile.avatarUrl}
            alt=""
            style={{
              width: 72,
              height: 72,
              objectFit: "cover",
              borderRadius: 12,
              marginBottom: 8,
            }}
          />
        )}
        <input
          ref={avatarRef}
          id="pp-avatar"
          className="input"
          type="file"
          accept="image/*"
          onChange={() => setRemoveAvatar(false)}
        />
        <div className="faint">
          Không chọn file thì ảnh hiện tại được giữ nguyên.
        </div>
        {profile?.avatarUrl && (
          <label className="row" style={{ gap: 6, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={removeAvatar}
              onChange={(e) => setRemoveAvatar(e.target.checked)}
            />
            <span className="faint">Xoá ảnh đại diện hiện tại</span>
          </label>
        )}
      </div>

      <div className="field">
        <label htmlFor="pp-cover">Ảnh bìa</label>
        {profile?.coverUrl && !removeCover && (
          <img
            src={profile.coverUrl}
            alt=""
            style={{
              width: "100%",
              maxHeight: 120,
              objectFit: "cover",
              borderRadius: 12,
              marginBottom: 8,
            }}
          />
        )}
        <input
          ref={coverRef}
          id="pp-cover"
          className="input"
          type="file"
          accept="image/*"
          onChange={() => setRemoveCover(false)}
        />
        {profile?.coverUrl && (
          <label className="row" style={{ gap: 6, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={removeCover}
              onChange={(e) => setRemoveCover(e.target.checked)}
            />
            <span className="faint">Xoá ảnh bìa hiện tại</span>
          </label>
        )}
      </div>

      <div className="field">
        <label htmlFor="pp-visibility">Ai được xem</label>
        <select
          id="pp-visibility"
          className="select"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as PetVisibility)}
        >
          {VISIBILITIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="faint">
          {VISIBILITIES.find((v) => v.value === visibility)?.hint}
        </div>
      </div>

      <Alert>{error}</Alert>
    </Modal>
  );
}

/* ─────────────────────── trang chi tiết ────────────────────── */

export function PetDetailPage() {
  const { id } = useParams();
  const petId = Number(id);
  const { user } = useAuth();
  const { activePetId, select, reload } = useActivePet();
  const navigate = useNavigate();

  const [pet, setPet] = useState<PetDetail | null>(null);
  const [ownedProfile, setOwnedProfile] = useState<OwnedPetProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingPet, setEditingPet] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await petApi.detail(petId);
      setPet(detail);
      setError("");

      /**
       * Bản hồ sơ CHỦ SỞ HỮU chỉ nạp khi đúng là chủ: `/owned` trả 403 với
       * người ngoài, và một lời gọi chắc chắn hỏng không nên nằm trên đường đi
       * thường. Người ngoài vẫn thấy đủ phần công khai qua `detail.profile`.
       */
      if (user && detail.ownerAccountId === user.id) {
        setOwnedProfile(await petProfileApi.owned(petId).catch(() => null));
      } else {
        setOwnedProfile(null);
      }
    } catch (e) {
      setError(errorMessage(e));
      setPet(null);
    } finally {
      setLoading(false);
    }

    // Bài viết và nhóm của BÉ NÀY — cả hai đều lọc theo quyền xem ở backend,
    // nên lỗi ở đây chỉ nghĩa là không có gì để hiện.
    setPosts(await postApi.byPet(petId).catch(() => []));
    setGroups(await groupApi.joinedByPet(petId).catch(() => []));
  }, [petId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;
  if (!pet)
    return (
      <Card>
        {/* Backend cố ý trả 404 cho cả "không tồn tại" lẫn "không được xem" —
            không phân biệt được hai trường hợp, và cũng không nên đoán hộ. */}
        <EmptyState
          icon="🐾"
          title="Không tìm thấy hồ sơ thú cưng"
          hint={error || "Hồ sơ không tồn tại hoặc bạn không có quyền xem"}
        />
      </Card>
    );

  const species = speciesOf(pet.species);
  const age = ageFrom(pet.dateOfBirth);
  const isOwner = Boolean(user && pet.ownerAccountId === user.id);
  const isActive = pet.petId === activePetId;

  return (
    <>
      <Card>
        {ownedProfile?.coverUrl ? (
          <img className="cover" src={ownedProfile.coverUrl} alt="" />
        ) : null}

        <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="row">
            {pet.profile.avatarUrl ? (
              <img
                src={pet.profile.avatarUrl}
                alt=""
                className="avatar"
                style={{ width: 64, height: 64, objectFit: "cover" }}
              />
            ) : (
              <div
                className="avatar"
                style={{ width: 64, height: 64, fontSize: 32 }}
                title={species.label}
              >
                {species.glyph}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>
                {pet.profile.displayName}
              </div>
              <div className="faint">@{pet.profile.handle}</div>
              <div className="faint">
                {species.label}
                {pet.breed ? ` · ${pet.breed}` : ""} · {genderLabel(pet.gender)}
                {age ? ` · ${age}` : ""}
              </div>
            </div>
          </div>

          <div className="row">
            <Badge tone={pet.profile.visibility === "PUBLIC" ? "ok" : "default"}>
              {visibilityLabel(pet.profile.visibility)}
            </Badge>
            {pet.status === "DEACTIVATED" && (
              <Badge tone="danger">Đã ngừng hoạt động</Badge>
            )}

            {isOwner && (
              <>
                {isActive ? (
                  <Badge tone="brand">Đang thao tác</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => select(pet.petId)}
                  >
                    Thao tác với bé này
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingProfile(true)}
                >
                  Sửa hồ sơ công khai
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingPet(true)}
                >
                  Sửa thông tin
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeactivating(true)}
                >
                  Ngừng hoạt động
                </Button>
              </>
            )}
          </div>
        </div>

        {pet.profile.bio && <p className="muted">{pet.profile.bio}</p>}

        <div className="stack" style={{ marginTop: 14 }}>
          <div className="row-between">
            <span className="faint">Ngày sinh</span>
            <span>{new Date(pet.dateOfBirth).toLocaleDateString("vi-VN")}</span>
          </div>
          <div className="row-between">
            <span className="faint">Chủ sở hữu</span>
            <span>
              {pet.ownerAccountId ? (
                isOwner ? (
                  "Bạn"
                ) : (
                  <Link to={`/profile/${pet.ownerAccountId}`}>
                    #{pet.ownerAccountId}
                  </Link>
                )
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>

        <Alert>{error}</Alert>
      </Card>

      {groups.length > 0 && (
        <Card tight>
          <CardHead title="Nhóm của bé" sub={`${groups.length} nhóm`} />
          <div className="stack">
            {groups.map((group) => (
              <Link key={group.id} to={`/groups/${group.id}`} className="row">
                <div className="grow truncate">{group.name}</div>
                <Badge tone={group.type === "PUBLIC" ? "ok" : "warn"}>
                  {group.type}
                </Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <CardHead title="Bài viết của bé" />
      {posts.length === 0 ? (
        <Card>
          <EmptyState icon="📝" title="Chưa có bài viết nào" />
        </Card>
      ) : (
        posts.map((post) => (
          <PostCard key={post.postId} post={post} onChanged={load} />
        ))
      )}

      <PetFormModal
        open={editingPet}
        pet={pet}
        onClose={() => setEditingPet(false)}
        onSaved={async (saved) => {
          setEditingPet(false);
          setPet(saved);
          await reload();
        }}
      />

      <PetProfileFormModal
        open={editingProfile}
        petId={pet.petId}
        profile={ownedProfile}
        onClose={() => setEditingProfile(false)}
        onSaved={async (saved) => {
          setEditingProfile(false);
          setOwnedProfile(saved);
          await load();
          await reload();
        }}
      />

      <Modal
        open={deactivating}
        title="Ngừng hoạt động hồ sơ?"
        onClose={() => setDeactivating(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeactivating(false)}>
              Huỷ
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await petApi.deactivate(pet.petId);
                  await reload();
                  navigate("/pets");
                } catch (e) {
                  setDeactivating(false);
                  setError(errorMessage(e));
                }
              }}
            >
              Ngừng hoạt động
            </Button>
          </>
        }
      >
        <p className="muted">
          <strong>{pet.profile.displayName}</strong> sẽ biến mất khỏi mọi luồng
          đọc, kể cả danh sách của bạn. Bài viết và bình luận cũ vẫn nằm trong hệ
          thống vì chúng trỏ tới danh tính của bé (xoá mềm), nhưng giao diện hiện
          chưa có cách khôi phục.
        </p>
      </Modal>
    </>
  );
}
