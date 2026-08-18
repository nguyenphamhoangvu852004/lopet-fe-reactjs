import { useRef, useState } from "react";
import { errorMessage } from "../../api/client";
import { postApi } from "../../api/endpoints";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useActivePet } from "../../context/PetContext";
import type { PostScope } from "../../types";
import { Alert, Avatar, Badge, Button, Card, EmptyState } from "../ui";

/**
 * Backend BẮT BUỘC trường `scope` và từ chối request nếu giá trị không hợp lệ
 * (PostController.create ném BadRequest). Ngoài ra bài trong nhóm chỉ nhận
 * PUBLIC / PRIVATE — FRIEND không có ý nghĩa trong ngữ cảnh nhóm.
 */
const PERSONAL_SCOPES: { value: PostScope; label: string }[] = [
  { value: "PUBLIC", label: "🌍 Công khai" },
  { value: "FRIEND", label: "👥 Bạn bè" },
  { value: "PRIVATE", label: "🔒 Chỉ mình tôi" },
];

const GROUP_SCOPES: { value: PostScope; label: string }[] = [
  { value: "PUBLIC", label: "🌍 Công khai" },
  { value: "PRIVATE", label: "🔒 Chỉ trong nhóm" },
];

export function PostComposer({
  groupId,
  onPosted,
}: {
  /** Có giá trị nghĩa là đăng vào nhóm — backend sẽ đặt postType = GROUP */
  groupId?: number;
  onPosted: () => void;
}) {
  const { can } = useAuth();
  const { activePet, pets, ready } = useActivePet();
  const [content, setContent] = useState("");
  const [scope, setScope] = useState<PostScope>("PUBLIC");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const scopes = groupId ? GROUP_SCOPES : PERSONAL_SCOPES;

  if (!can("post:create")) return null;

  /**
   * Không có thú cưng thì KHÔNG đăng bài được — backend đòi header `X-Pet-Id`
   * và tác giả ghi xuống DB là `pets.id`. Chặn ở đây thay vì để người dùng gõ
   * xong cả bài rồi mới nhận 403.
   */
  if (ready && pets.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="🐾"
          title="Tạo thú cưng để bắt đầu đăng bài"
          hint="Mạng xã hội này lấy thú cưng làm chủ thể: mọi bài viết, bình luận và nhóm đều gắn với một bé cụ thể."
        />
        <Link to="/pets" className="btn btn-primary">
          + Thêm thú cưng
        </Link>
      </Card>
    );
  }

  async function submit() {
    if (!content.trim() && files.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("content", content);
      form.append("scope", scope);
      if (groupId) form.append("groupId", String(groupId));
      // Tác giả KHÔNG gửi trong body — backend đọc từ header X-Pet-Id, thứ mà
      // api/client.ts tự gắn từ PetContext.
      files.forEach((file) =>
        form.append(file.type.startsWith("video") ? "videos" : "images", file),
      );
      await postApi.create(form);
      setContent("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      onPosted();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Avatar
          src={activePet?.profile?.avatarUrl ?? undefined}
          name={activePet?.profile?.displayName ?? activePet?.name}
        />
        <textarea
          className="textarea grow"
          style={{ minHeight: 62 }}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            groupId
              ? `Đăng vào nhóm với tư cách ${activePet?.profile?.displayName ?? "thú cưng của bạn"}…`
              : `${activePet?.profile?.displayName ?? "Bé nhà bạn"} hôm nay thế nào?`
          }
        />
      </div>

      {/* Người dùng phải THẤY mình đang đăng nhân danh con nào: cùng một ô soạn
          thảo cho ra hai tác giả khác nhau tuỳ lựa chọn ở thanh trên cùng. */}
      {activePet && (
        <div className="faint" style={{ marginTop: 6 }}>
          Đăng với tư cách <b>{activePet.profile.displayName}</b>
          {activePet.profile.handle ? ` (@${activePet.profile.handle})` : ""}
        </div>
      )}

      {files.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", marginTop: 10 }}>
          {files.map((file, index) => (
            <Badge key={`${file.name}-${index}`}>
              {file.name}
              <button
                onClick={() =>
                  setFiles((list) => list.filter((_, j) => j !== index))
                }
                style={{ border: 0, background: "none", cursor: "pointer" }}
                aria-label="Bỏ tệp"
              >
                ✕
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Alert>{error}</Alert>

      <div className="row-between" style={{ marginTop: 12, flexWrap: "wrap" }}>
        <div className="row">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            🖼️ Ảnh / Video
          </Button>
          <select
            className="select"
            style={{ padding: "8px 10px" }}
            value={scope}
            onChange={(e) => setScope(e.target.value as PostScope)}
            title="Ai xem được bài này"
          >
            {scopes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          onClick={submit}
          disabled={busy || (!content.trim() && !files.length)}
        >
          {busy ? "Đang đăng…" : "Đăng bài"}
        </Button>
      </div>
    </Card>
  );
}
