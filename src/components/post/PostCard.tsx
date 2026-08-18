import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { postApi } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { useActivePet } from "../../context/PetContext";
import { usePetProfileLite } from "../../hooks/usePetProfileLite";
import type { Post, PostScope } from "../../types";
import { ReportDialog } from "../report/ReportDialog";
import { Alert, Avatar, Badge, Button, Card, Modal, timeAgo } from "../ui";
import { CommentSection } from "./CommentSection";

function EditPostModal({
  post,
  open,
  onClose,
  onSaved,
}: {
  post: Post;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState(post.content ?? "");
  const [scope, setScope] = useState<PostScope>(post.postScope ?? "PUBLIC");
  // Media cũ nào còn được tick sẽ đi trong oldIdsMedia; phần bỏ tick bị backend xoá
  const [keptMedia, setKeptMedia] = useState<number[]>(
    () =>
      post.postMedias?.map((m) => m.id).filter((id): id is number => !!id) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const inGroup = Boolean(post.groupId);
  const scopes: PostScope[] = inGroup
    ? ["PUBLIC", "PRIVATE"]
    : ["PUBLIC", "FRIEND", "PRIVATE"];

  async function save() {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("content", content);
      form.append("scope", scope);
      if (post.groupId) form.append("groupId", String(post.groupId));
      keptMedia.forEach((id) => form.append("oldIdsMedia", String(id)));
      Array.from(fileRef.current?.files ?? []).forEach((file) =>
        form.append(file.type.startsWith("video") ? "videos" : "images", file),
      );
      await postApi.update(post.postId, form);
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
      title="Sửa bài viết"
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
        <label>Nội dung</label>
        <textarea
          className="textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Ai xem được</label>
        <select
          className="select"
          value={scope}
          onChange={(e) => setScope(e.target.value as PostScope)}
        >
          {scopes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        {inGroup && (
          <div className="faint">Bài trong nhóm không dùng phạm vi “Bạn bè”.</div>
        )}
      </div>

      {post.postMedias && post.postMedias.length > 0 && (
        <div className="field">
          <label>Ảnh / video hiện có</label>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {post.postMedias.map((media) =>
              media.id ? (
                <label
                  key={media.id}
                  className="row"
                  style={{ gap: 6, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={keptMedia.includes(media.id)}
                    onChange={(e) =>
                      setKeptMedia((list) =>
                        e.target.checked
                          ? [...list, media.id as number]
                          : list.filter((id) => id !== media.id),
                      )
                    }
                  />
                  {media.mediaType === "VIDEO" ? (
                    <video
                      src={media.mediaUrl}
                      style={{
                        width: 72,
                        height: 72,
                        objectFit: "cover",
                        borderRadius: 10,
                      }}
                    />
                  ) : (
                    <img
                      src={media.mediaUrl}
                      alt=""
                      style={{
                        width: 72,
                        height: 72,
                        objectFit: "cover",
                        borderRadius: 10,
                      }}
                    />
                  )}
                </label>
              ) : null,
            )}
          </div>
          <div className="faint">Bỏ tick để xoá khỏi bài viết.</div>
        </div>
      )}

      <div className="field">
        <label>Thêm ảnh / video mới</label>
        <input
          ref={fileRef}
          className="input"
          type="file"
          multiple
          accept="image/*,video/*"
        />
      </div>
      <Alert>{error}</Alert>
    </Modal>
  );
}

export function PostCard({
  post,
  onChanged,
  variant = "preview",
}: {
  post: Post;
  onChanged?: () => void;
  /** `full` dùng ở trang chi tiết: bình luận phân trang thay vì chỉ 3 dòng */
  variant?: "preview" | "full";
}) {
  const { can } = useAuth();
  const { pets, activePetId } = useActivePet();
  const author = usePetProfileLite(post.petId);

  /**
   * likeList chứa những THÚ CƯNG đã thích — backend không trả cờ isLiked riêng.
   * So theo pet đang thao tác chứ không theo tài khoản: một lượt thích thuộc về
   * con vật, và hai con cùng chủ thả tim cùng một bài là hai lượt khác nhau.
   */
  const likeList = post.likeList ?? post.listLike ?? [];
  const [liked, setLiked] = useState(
    Boolean(activePetId && likeList.some((like) => like.petId === activePetId)),
  );
  const [likes, setLikes] = useState(post.likeAmount ?? 0);
  /**
   * Đếm bình luận do CommentSection báo lên. KHÔNG dùng post.commentAmount:
   * backend khai báo trường đó trong DTO nhưng chưa bao giờ gán giá trị, nên
   * mọi endpoint bài viết đều trả về undefined và số luôn hiện 0.
   */
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);

  /**
   * "Bài của tôi" = bài do BẤT KỲ thú cưng nào của tôi đăng, không chỉ con đang
   * chọn. Backend cũng xét quyền sửa/xoá ở mức TÀI KHOẢN (chủ của pet tác giả)
   * — người dùng không được mất quyền lên nội dung của chính mình chỉ vì đang
   * thao tác nhân danh con khác.
   */
  const isMine = Boolean(
    post.petId && pets.some((pet) => pet.petId === post.petId),
  );
  // Chủ bài xoá được bài mình; staff có post:delete xoá được của bất kỳ ai.
  const canDelete = (isMine && can("post:delete:own")) || can("post:delete");
  // Sửa bài thì KHÔNG có ngoại lệ cho staff — backend đặt bypassRoles rỗng.
  const canEdit = isMine && can("post:update:own");

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      if (next) {
        // Backend tự báo cho chủ bài trong PostService.like, và tự bỏ qua khi
        // người thích chính là chủ bài
        await postApi.like(post.postId);
      } else {
        await postApi.unlike(post.postId);
      }
    } catch (e) {
      setLiked(!next);
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
      setError(errorMessage(e));
    }
  }

  async function remove() {
    if (!confirm("Xoá bài viết này?")) return;
    try {
      await postApi.remove(post.postId);
      onChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card>
      <div className="row">
        <Avatar
          src={author?.avatarUrl ?? undefined}
          name={author?.displayName ?? `#${post.petId ?? "?"}`}
        />
        <div className="grow">
          {/* Tác giả là thú cưng: dẫn sang hồ sơ CON VẬT, không phải trang tài
              khoản của chủ. Bài chưa di trú xong (pet_id rỗng) thì không có gì
              để dẫn tới — hiện chữ trơ thay vì một link hỏng. */}
          {post.petId ? (
            <Link to={`/pets/${post.petId}`} style={{ fontWeight: 700 }}>
              {author?.displayName || `Thú cưng #${post.petId}`}
            </Link>
          ) : (
            <span style={{ fontWeight: 700 }}>Tác giả không xác định</span>
          )}
          <div className="faint">
            {author?.handle ? `@${author.handle} · ` : ""}
            {timeAgo(post.createdAt)}
            {post.groupId ? " · trong nhóm" : ""}
            {post.postScope ? ` · ${post.postScope}` : ""}
          </div>
        </div>
        {post.groupId && (
          <Link to={`/groups/${post.groupId}`}>
            <Badge tone="brand">Nhóm #{post.groupId}</Badge>
          </Link>
        )}
        {canEdit && (
          <Button variant="icon" onClick={() => setEditing(true)} title="Sửa bài">
            ✏️
          </Button>
        )}
        {canDelete && (
          <Button variant="icon" onClick={remove} title="Xoá bài">
            🗑️
          </Button>
        )}
        {!isMine && (
          <Button
            variant="icon"
            onClick={() => setReporting(true)}
            title="Báo cáo"
          >
            🚩
          </Button>
        )}
      </div>

      {post.content &&
        (variant === "full" ? (
          <p style={{ marginBottom: 0 }}>{post.content}</p>
        ) : (
          <Link to={`/posts/${post.postId}`} className="post-body">
            <p style={{ marginBottom: 0 }}>{post.content}</p>
          </Link>
        ))}

      {post.postMedias && post.postMedias.length > 0 && (
        <div className="post-media">
          {post.postMedias.map((media, i) =>
            media.mediaType === "VIDEO" ? (
              <video key={media.id ?? i} src={media.mediaUrl} controls />
            ) : (
              <img key={media.id ?? i} src={media.mediaUrl} alt="" />
            ),
          )}
        </div>
      )}

      <Alert>{error}</Alert>

      {/* Ở trang chi tiết, CommentSection đã có dòng tiêu đề đếm riêng nên chỉ
          hiện lượt thích, tránh lặp cùng một con số hai lần */}
      {(likes > 0 || (variant === "preview" && (commentCount ?? 0) > 0)) && (
        <div className="post-stats">
          <span>{likes > 0 ? `❤️ ${likes}` : ""}</span>
          <span>
            {variant === "preview" && (commentCount ?? 0) > 0
              ? `${commentCount} bình luận`
              : ""}
          </span>
        </div>
      )}

      <div className="post-actions">
        <button
          className={`post-action ${liked ? "on" : ""}`}
          onClick={toggleLike}
        >
          {liked ? "❤️" : "🤍"} Thích
        </button>
        {/* Ô nhập đã hiện sẵn bên dưới nên nút này chỉ đưa con trỏ vào đó */}
        <button
          className="post-action"
          onClick={() => commentInputRef.current?.focus()}
        >
          💬 Bình luận{commentCount ? ` (${commentCount})` : ""}
        </button>
        {variant === "preview" && (
          <Link className="post-action" to={`/posts/${post.postId}`}>
            🔗 Chi tiết
          </Link>
        )}
      </div>

      <CommentSection
        postId={post.postId}
        variant={variant}
        onCountChange={setCommentCount}
        inputRef={commentInputRef}
      />

      <ReportDialog
        open={reporting}
        type="POST"
        targetId={post.postId}
        onClose={() => setReporting(false)}
      />

      {editing && (
        <EditPostModal
          post={post}
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged?.();
          }}
        />
      )}
    </Card>
  );
}
