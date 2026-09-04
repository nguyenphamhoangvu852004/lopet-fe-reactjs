import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { postApi } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { useAccountProfileLite } from "../../hooks/useAccountProfileLite";
import type { Post } from "../../types";
import { Alert, Avatar, Button, Card, Modal, timeAgo } from "../ui";
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
  // Media cũ nào còn được tick sẽ đi trong oldIdsMedia; phần bỏ tick bị backend xoá
  const [keptMedia, setKeptMedia] = useState<number[]>(
    () =>
      post.postMedias?.map((m) => m.id).filter((id): id is number => !!id) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("content", content);
      /**
       * Field `oldIdsMedia` LUÔN phải có mặt, kể cả khi không giữ lại cái nào.
       *
       * Backend phân biệt ba trạng thái: vắng field = giữ nguyên media, field rỗng = xoá hết,
       * có id = giữ đúng những id đó. Form multipart không diễn đạt được "mảng rỗng" bằng cách
       * lặp field không lần nào — im lặng bỏ qua thì y hệt như không gửi, và người dùng bỏ tick
       * hết ảnh sẽ thấy ảnh vẫn còn nguyên sau khi lưu.
       */
      if (keptMedia.length === 0) form.append("oldIdsMedia", "");
      else keptMedia.forEach((id) => form.append("oldIdsMedia", String(id)));
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
  const { user } = useAuth();
  const author = useAccountProfileLite(post.accountId);

  /** likeList chứa những tài khoản đã thích — backend không trả cờ isLiked riêng */
  const likeList = post.likeList ?? post.listLike ?? [];
  const [liked, setLiked] = useState(
    Boolean(user && likeList.some((like) => like.id === user.id)),
  );
  const [likes, setLikes] = useState(post.likeAmount ?? 0);
  /**
   * Đếm bình luận do CommentSection báo lên. KHÔNG dùng post.commentAmount:
   * backend khai báo trường đó trong DTO nhưng chưa bao giờ gán giá trị, nên
   * mọi endpoint bài viết đều trả về undefined và số luôn hiện 0.
   */
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);

  /**
   * Chỉ tác giả sửa/xoá được bài của mình.
   *
   * Không còn ngoại lệ nào cho quản trị viên: backend đã gỡ phân quyền, và
   * PostService kiểm đúng một điều kiện — người gọi có phải chủ bài không.
   */
  const isMine = Boolean(post.accountId && post.accountId === user?.id);

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      if (next) {
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
          name={author?.fullName ?? author?.username ?? `#${post.accountId ?? "?"}`}
        />
        <div className="grow">
          {/* Bài dữ liệu cũ không quy được về tài khoản nào thì không có gì để
              dẫn tới — hiện chữ trơ thay vì một link hỏng. */}
          {post.accountId ? (
            <Link to={`/profile/${post.accountId}`} style={{ fontWeight: 700 }}>
              {author?.fullName ||
                author?.username ||
                `Người dùng #${post.accountId}`}
            </Link>
          ) : (
            <span style={{ fontWeight: 700 }}>Tác giả không xác định</span>
          )}
          <div className="faint">
            {author?.username ? `@${author.username} · ` : ""}
            {timeAgo(post.createdAt)}
          </div>
        </div>
        {isMine && (
          <>
            <Button
              variant="icon"
              onClick={() => setEditing(true)}
              title="Sửa bài"
            >
              ✏️
            </Button>
            <Button variant="icon" onClick={remove} title="Xoá bài">
              🗑️
            </Button>
          </>
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
        postAuthorId={post.accountId}
        onCountChange={setCommentCount}
        inputRef={commentInputRef}
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
