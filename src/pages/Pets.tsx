import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { petApi } from "../api/endpoints";
import {
  Alert,
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
import type {
  PetDetail,
  PetGender,
  PetInput,
  PetListItem,
  PetSpecies,
  PetVisibility,
} from "../types";

/* ─────────────────────── nhãn hiển thị ─────────────────────── */

/**
 * Giá trị bên trái phải khớp TỪNG KÝ TỰ với enum của backend — chúng được gửi
 * thẳng lên API. Backend chấp nhận cả chữ thường nhưng vẫn gửi chữ hoa cho
 * thống nhất với dữ liệu trả về.
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
    hint: "Tính năng theo dõi chưa có — tạm thời chỉ chủ sở hữu xem được",
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

type Tab = "all" | "primary" | "shared";

function PetRow({ pet }: { pet: PetListItem }) {
  const species = speciesOf(pet.species);
  const age = ageFrom(pet.dateOfBirth);

  return (
    <Link to={`/pets/${pet.petId}`} className="row">
      <div
        className="avatar"
        style={{ width: 44, height: 44, fontSize: 22 }}
        title={species.label}
      >
        {species.glyph}
      </div>
      <div className="grow truncate">
        <div style={{ fontWeight: 650 }} className="truncate">
          {pet.name}
        </div>
        <div className="faint">
          {species.label}
          {pet.breed ? ` · ${pet.breed}` : ""} · {genderLabel(pet.gender)}
          {age ? ` · ${age}` : ""}
        </div>
      </div>
      {pet.myOwnershipType === "CO_OWNER" && (
        <Badge tone="warn">Đồng sở hữu</Badge>
      )}
      <Badge tone={pet.visibility === "PUBLIC" ? "ok" : "default"}>
        {visibilityLabel(pet.visibility)}
      </Badge>
    </Link>
  );
}

export function PetsPage() {
  const { user, can } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const [items, setItems] = useState<PetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      // Chỉ MỘT endpoint danh sách: /v1/pets/me. Lọc theo vai trò làm ở client
      // vì backend không nhận tham số lọc nào — và cũng không nên nhận, id
      // người dùng phải đến từ token.
      setItems(await petApi.mine());
    } catch (e) {
      setError(errorMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = items.filter((pet) =>
    tab === "all"
      ? true
      : tab === "primary"
        ? pet.myOwnershipType === "PRIMARY_OWNER"
        : pet.myOwnershipType === "CO_OWNER",
  );

  return (
    <Card>
      <CardHead
        title="Thú cưng"
        sub="Hồ sơ những bé bạn đang chăm"
        action={
          // pet:create nằm trong baseline — mọi tài khoản đã đăng nhập đều tạo được
          can("pet:create") ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              + Thêm thú cưng
            </Button>
          ) : null
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "all", label: "Tất cả" },
          { value: "primary", label: "Tôi là chủ" },
          { value: "shared", label: "Đồng sở hữu" },
        ]}
      />

      <Alert>{error}</Alert>

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="🐾"
          title={
            items.length === 0
              ? "Bạn chưa có thú cưng nào"
              : "Không có hồ sơ nào ở mục này"
          }
          hint={
            items.length === 0
              ? "Bấm “Thêm thú cưng” để tạo hồ sơ đầu tiên"
              : undefined
          }
        />
      ) : (
        <div className="stack" style={{ marginTop: 14 }}>
          {visible.map((pet) => (
            <PetRow key={pet.petId} pet={pet} />
          ))}
        </div>
      )}

      <PetFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          setTab("all");
          load();
        }}
      />
    </Card>
  );
}

/* ──────────────────────── form tạo/sửa ─────────────────────── */

/** Dùng chung cho tạo mới (POST /v1/pets) và sửa (PUT /v1/pets/:petId) */
export function PetFormModal({
  open,
  pet,
  onClose,
  onSaved,
}: {
  open: boolean;
  pet?: PetDetail;
  onClose: () => void;
  onSaved: (saved: PetDetail) => void;
}) {
  const editing = Boolean(pet);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<PetSpecies>("DOG");
  const [breed, setBreed] = useState("");
  const [gender, setGender] = useState<PetGender>("UNKNOWN");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [bio, setBio] = useState("");
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
    setBio(pet?.bio ?? "");
    setVisibility(pet?.visibility ?? "PUBLIC");
    setError("");
  }, [open, pet]);

  async function submit() {
    // Ba ràng buộc dưới đây trùng với Bean Validation của backend. Kiểm ở đây
    // để người dùng không phải chờ một vòng request mới biết mình gõ sai.
    if (!name.trim()) return setError("Tên thú cưng không được để trống");
    if (name.trim().length > 50) return setError("Tên tối đa 50 ký tự");
    if (!dateOfBirth) return setError("Vui lòng chọn ngày sinh");
    if (dateOfBirth > today())
      return setError("Ngày sinh không được ở tương lai");
    if (breed.length > 100) return setError("Giống tối đa 100 ký tự");
    if (bio.length > 500) return setError("Giới thiệu tối đa 500 ký tự");

    setBusy(true);
    setError("");
    try {
      // Không gửi ownerId/ownershipType/status: backend suy chủ sở hữu từ token
      // và DTO phía server cũng không khai những trường đó.
      const body: PetInput = {
        name: name.trim(),
        species,
        breed: breed.trim() || null,
        gender,
        dateOfBirth,
        bio: bio.trim() || null,
        visibility,
      };
      const saved = pet
        ? await petApi.update(pet.petId, body)
        : await petApi.create(body);
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={editing ? "Sửa hồ sơ thú cưng" : "Thêm thú cưng"}
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

      <div className="field">
        <label htmlFor="pet-visibility">Ai được xem</label>
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

      <div className="field">
        <label htmlFor="pet-bio">Giới thiệu</label>
        <textarea
          id="pet-bio"
          className="textarea"
          value={bio}
          maxLength={500}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Lúc nào cũng đói."
        />
        <div className="faint">{bio.length}/500</div>
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
  const navigate = useNavigate();
  const [pet, setPet] = useState<PetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPet(await petApi.detail(petId));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
      setPet(null);
    } finally {
      setLoading(false);
    }
  }, [petId]);

  useEffect(() => {
    load();
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
  // Chỉ chủ sở hữu chính mới lưu trữ được; co-owner sửa được nhưng không xoá.
  // Backend vẫn là nơi thực thi — đây chỉ để khỏi hiện nút chắc chắn nhận 403.
  const isPrimaryOwner = Boolean(user && pet.primaryOwnerId === user.id);

  return (
    <>
      <Card>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="row">
            <div
              className="avatar"
              style={{ width: 64, height: 64, fontSize: 32 }}
              title={species.label}
            >
              {species.glyph}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>{pet.name}</div>
              <div className="faint">
                {species.label}
                {pet.breed ? ` · ${pet.breed}` : ""} ·{" "}
                {genderLabel(pet.gender)}
                {age ? ` · ${age}` : ""}
              </div>
            </div>
          </div>

          <div className="row">
            <Badge tone={pet.visibility === "PUBLIC" ? "ok" : "default"}>
              {visibilityLabel(pet.visibility)}
            </Badge>
            {pet.status === "ARCHIVED" && (
              <Badge tone="danger">Đã lưu trữ</Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Sửa hồ sơ
            </Button>
            {isPrimaryOwner && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setArchiving(true)}
              >
                Lưu trữ
              </Button>
            )}
          </div>
        </div>

        {pet.bio && <p className="muted">{pet.bio}</p>}

        <div className="stack" style={{ marginTop: 14 }}>
          <div className="row-between">
            <span className="faint">Ngày sinh</span>
            <span>{new Date(pet.dateOfBirth).toLocaleDateString("vi-VN")}</span>
          </div>
          <div className="row-between">
            <span className="faint">Chủ sở hữu chính</span>
            <span>
              {pet.primaryOwnerId ? (
                isPrimaryOwner ? (
                  "Bạn"
                ) : (
                  <Link to={`/profile/${pet.primaryOwnerId}`}>
                    #{pet.primaryOwnerId}
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

      <PetFormModal
        open={editing}
        pet={pet}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setEditing(false);
          setPet(saved);
        }}
      />

      <Modal
        open={archiving}
        title="Lưu trữ hồ sơ?"
        onClose={() => setArchiving(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setArchiving(false)}>
              Huỷ
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await petApi.archive(pet.petId);
                  navigate("/pets");
                } catch (e) {
                  setArchiving(false);
                  setError(errorMessage(e));
                }
              }}
            >
              Lưu trữ
            </Button>
          </>
        }
      >
        <p className="muted">
          Hồ sơ của <strong>{pet.name}</strong> sẽ biến mất khỏi danh sách và
          không còn xem được nữa. Dữ liệu vẫn được giữ trong hệ thống (xoá mềm),
          nhưng giao diện hiện chưa có cách khôi phục.
        </p>
      </Modal>
    </>
  );
}
