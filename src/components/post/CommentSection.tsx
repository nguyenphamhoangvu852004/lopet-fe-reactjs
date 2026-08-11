import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { commentApi, notificationApi } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import type { Comment } from "../../types";
import { Alert, Avatar, Button, timeAgo } from "../ui";

/** Số luồng gốc hiện sẵn dưới mỗi bài trong bảng tin */
const PREVIEW_SIZE = 3;
/** Số luồng gốc hiện lần đầu ở trang chi tiết, và mỗi lần bấm "Xem thêm" */
const PAGE_SIZE = 10;
/** Số phản hồi hiện sẵn trong một luồng trước khi phải bấm mở thêm */
const REPLY_PREVIEW = 3;

/**
 * Backend trả bình luận theo `createdAt DESC` (CommentRepoImpl), tức mới nhất
 * đứng đầu. Hiển thị thì cần cũ → mới như mọi luồng hội thoại.
 */
function sortAscending(list: Comment[]): Comment[] {
  return [...list].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
  });
}

/** Một phản hồi đã được kéo lên tầng 2, kèm người mà nó thực sự trả lời */
interface ReplyNode {
  comment: Comment;
  /** Chỉ có giá trị khi đây là "trả lời của một trả lời" — dùng để gắn @tên */
  replyingTo?: Comment;
}

interface Thread {
  root: Comment;
  replies: ReplyNode[];
}

/**
 * Dựng cây hiển thị kiểu Facebook: CHỈ HAI TẦNG.
 *
 * Cây lưu trữ ở DB sâu tuỳ ý (comments.parentId tự tham chiếu), nhưng mọi nhánh
 * sâu hơn tầng 2 đều được kéo phẳng lên nằm cùng tầng với phản hồi trực tiếp.
 * Ngữ cảnh "ai trả lời ai" không mất đi mà được giữ bằng `replyingTo`, sau đó
 * render thành tiền tố @tên — đúng cách Facebook làm.
 *
 * Chạy một lượt O(n) bằng hai Map, không lồng filter.
 */
function buildThreads(list: Comment[]): Thread[] {
  const byId = new Map(list.map((comment) => [comment.id, comment]));

  /** Leo ngược tới bình luận gốc của nhánh; undefined nghĩa là chính nó là gốc */
  function rootOf(comment: Comment): Comment | undefined {
    let current = comment;
    // Chặn chu trình: dữ liệu lỗi một lần là treo cả tab
    const seen = new Set<number>([current.id]);
    while (current.replyToCommentId) {
      const parent = byId.get(current.replyToCommentId);
      // Cha không nằm trong tập đã tải (bị xoá, hoặc do phân trang) thì coi
      // node hiện tại là gốc thay vì đánh rơi bình luận
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      current = parent;
    }
    return current.id === comment.id ? undefined : current;
  }

  const threads = new Map<number, Thread>();
  const pendingReplies: { comment: Comment; root: Comment }[] = [];

  for (const comment of list) {
    const root = rootOf(comment);
    if (!root) threads.set(comment.id, { root: comment, replies: [] });
    else pendingReplies.push({ comment, root });
  }

  for (const { comment, root } of pendingReplies) {
    const thread = threads.get(root.id);
    if (!thread) continue;
    const parent = comment.replyToCommentId
      ? byId.get(comment.replyToCommentId)
      : undefined;

    /**
     * Chỉ gắn @tên khi nó thật sự bổ sung ngữ cảnh. Hai trường hợp bỏ qua:
     *
     *  - Trả lời thẳng bình luận gốc: vị trí trong nhánh đã nói rõ rồi.
     *  - Tự trả lời chính mình: "A: @A ..." không cho biết thêm gì, vì avatar
     *    và tên ngay bên trên đã là A.
     */
    const addsContext =
      parent &&
      parent.id !== root.id &&
      parent.account?.id !== comment.account?.id;

    thread.replies.push({
      comment,
      replyingTo: addsContext ? parent : undefined,
    });
  }

  return [...threads.values()].map((thread) => ({
    ...thread,
    replies: sortAscending(thread.replies.map((r) => r.comment)).map(
      (comment) => thread.replies.find((r) => r.comment.id === comment.id)!,
    ),
  }));
}

function CommentRow({
  comment,
  replyingTo,
  onChanged,
  onReply,
  size = "root",
}: {
  comment: Comment;
  replyingTo?: Comment;
  onChanged: () => void;
  onReply?: (comment: Comment) => void;
  size?: "root" | "reply";
}) {
  const { user, can } = useAuth();
  const [error, setError] = useState("");
  // Chủ bình luận xoá được của mình; staff có post:delete xoá được của bất kỳ ai
  const canDelete = comment.account?.id === user?.id || can("post:delete");

  return (
    <div className="comment-row">
      <Avatar
        src={comment.account?.profile?.avatarUrl}
        name={comment.account?.username}
        size={size === "reply" ? 26 : 32}
      />
      <div className="grow">
        <div className="comment-bubble">
          <div className="comment-author">
            {comment.account?.id ? (
              <Link to={`/profile/${comment.account.id}`}>
                {comment.account.username ?? "Ẩn danh"}
              </Link>
            ) : (
              "Ẩn danh"
            )}
          </div>
          <div className="comment-text">
            {/* Nhánh sâu bị kéo phẳng lên tầng 2, @tên là thứ giữ lại ngữ cảnh */}
            {replyingTo && (
              <Link
                to={`/profile/${replyingTo.account?.id}`}
                className="comment-mention"
              >
                @{replyingTo.account?.username ?? "ẩn danh"}
              </Link>
            )}
            {comment.content}
          </div>
          {comment.imageUrl && (
            <img className="comment-image" src={comment.imageUrl} alt="" />
          )}
        </div>
        <div className="comment-meta">
          <span className="faint">{timeAgo(comment.createdAt)}</span>
          {onReply && (
            <button className="link-btn" onClick={() => onReply(comment)}>
              Trả lời
            </button>
          )}
          {canDelete && (
            <button
              className="link-btn"
              onClick={async () => {
                // Backend đặt onDelete CASCADE trên parent: xoá bình luận gốc là
                // xoá luôn mọi phản hồi bên dưới, nên phải hỏi lại cho rõ.
                const hasReplies = size === "root";
                if (
                  hasReplies &&
                  !confirm(
                    "Xoá bình luận này sẽ xoá luôn toàn bộ phản hồi bên dưới. Tiếp tục?",
                  )
                )
                  return;
                try {
                  await commentApi.remove(comment.id);
                  onChanged();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Xoá
            </button>
          )}
        </div>
        <Alert>{error}</Alert>
      </div>
    </div>
  );
}

/** Một luồng = bình luận gốc + danh sách phản hồi đã kéo phẳng về tầng 2 */
function ThreadView({
  thread,
  expandedByDefault,
  onChanged,
  onReply,
}: {
  thread: Thread;
  expandedByDefault: boolean;
  onChanged: () => void;
  onReply: (comment: Comment) => void;
}) {
  const total = thread.replies.length;
  const [collapsed, setCollapsed] = useState(false);
  const [shown, setShown] = useState(
    expandedByDefault ? REPLY_PREVIEW : 0,
  );

  // Phản hồi mới nhất nằm cuối, nên "xem thêm" phải mở dần từ dưới lên
  const visible = thread.replies.slice(Math.max(0, total - shown));
  const hidden = total - visible.length;

  return (
    <div className="comment-thread">
      <CommentRow
        comment={thread.root}
        onChanged={onChanged}
        onReply={onReply}
      />

      {total > 0 && (
        <div className="reply-block">
          {/* Đường kẻ dọc vừa là mốc nhánh vừa là nút gập cả luồng */}
          <button
            className="thread-line"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Mở lại phản hồi" : "Thu gọn phản hồi"}
            aria-label={collapsed ? "Mở lại phản hồi" : "Thu gọn phản hồi"}
          />

          <div className="reply-list">
            {collapsed ? (
              <button className="link-btn" onClick={() => setCollapsed(false)}>
                Mở lại {total} phản hồi
              </button>
            ) : (
              <>
                {hidden > 0 && (
                  <button
                    className="link-btn reply-more"
                    onClick={() => setShown((n) => n + REPLY_PREVIEW)}
                  >
                    ↳ Xem {Math.min(hidden, REPLY_PREVIEW)} phản hồi trước
                    {hidden > REPLY_PREVIEW ? ` (còn ${hidden})` : ""}
                  </button>
                )}
                {visible.map((reply) => (
                  <CommentRow
                    key={reply.comment.id}
                    comment={reply.comment}
                    replyingTo={reply.replyingTo}
                    onChanged={onChanged}
                    onReply={onReply}
                    size="reply"
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Khu bình luận dùng chung cho hai ngữ cảnh:
 *
 *  - `preview` (bảng tin): 3 luồng gần nhất, phản hồi gập sẵn + ô nhập luôn mở.
 *  - `full` (trang chi tiết): 10 luồng, phản hồi mở sẵn, có "Xem thêm".
 *
 * Số bình luận LUÔN đếm từ đây chứ không lấy từ DTO bài viết: backend khai báo
 * `commentAmount` nhưng không bao giờ gán giá trị cho nó, nên mọi endpoint bài
 * viết đều trả về undefined.
 */
export function CommentSection({
  postId,
  postAuthorId,
  variant,
  onCountChange,
  inputRef,
}: {
  postId: number;
  postAuthorId: number;
  variant: "preview" | "full";
  onCountChange?: (count: number) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const { user, can } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [visible, setVisible] = useState(
    variant === "preview" ? PREVIEW_SIZE : PAGE_SIZE,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const field = inputRef ?? localInputRef;

  const load = useCallback(async () => {
    try {
      const list = sortAscending(await commentApi.byPost(postId));
      setComments(list);
      onCountChange?.(list.length);
    } catch (e) {
      setError(errorMessage(e));
    }
    // onCountChange do component cha tạo mới mỗi lần render; đưa vào deps sẽ
    // thành vòng lặp tải vô hạn nên cố tình bỏ ra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const threads = useMemo(() => buildThreads(comments), [comments]);

  function startReply(comment: Comment) {
    setReplyTo(comment);
    field.current?.focus();
  }

  async function submit() {
    if (!draft.trim() && !image) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("content", draft);
      form.append("postId", String(postId));
      // Gửi đúng id bình luận đang trả lời, kể cả khi nó là một phản hồi:
      // DB giữ nguyên quan hệ sâu, phần hiển thị mới là chỗ kéo phẳng.
      if (replyTo) form.append("replyCommentId", String(replyTo.id));
      if (image) form.append("image", image);
      // accountId lấy từ token ở backend
      await commentApi.create(form);
      setDraft("");
      setReplyTo(null);
      setImage(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
      if (postAuthorId !== user?.id) {
        await notificationApi
          .create(
            postAuthorId,
            `${user?.username ?? "Ai đó"} đã bình luận bài viết của bạn`,
            "POST",
          )
          .catch(() => undefined);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const total = comments.length;
  // Luồng mới nhất nằm cuối; bảng tin lấy 3 luồng gần nhất, chi tiết lấy từ đầu
  const shownThreads =
    variant === "preview"
      ? threads.slice(Math.max(0, threads.length - visible))
      : threads.slice(0, visible);
  const remaining = threads.length - shownThreads.length;

  const composer = (
    <Composer
      user={user}
      canComment={can("comment:create")}
      draft={draft}
      setDraft={setDraft}
      image={image}
      setImage={setImage}
      fileRef={fileRef}
      field={field}
      busy={busy}
      onSubmit={submit}
      replyTo={replyTo}
      clearReply={() => setReplyTo(null)}
    />
  );

  return (
    <div className="comment-section">
      {variant === "full" ? (
        <>
          <div className="comment-count">
            {total === 0 ? "Chưa có bình luận" : `${total} bình luận`}
          </div>
          {composer}
        </>
      ) : (
        remaining > 0 && (
          <Link to={`/posts/${postId}`} className="comment-more">
            Xem tất cả {total} bình luận
          </Link>
        )
      )}

      {shownThreads.map((thread) => (
        <ThreadView
          key={thread.root.id}
          thread={thread}
          // Bảng tin gập sẵn phản hồi cho gọn; trang chi tiết mở sẵn
          expandedByDefault={variant === "full"}
          onChanged={load}
          onReply={startReply}
        />
      ))}

      {variant === "full" && remaining > 0 && (
        <Button
          variant="ghost"
          onClick={() => setVisible((n) => n + PAGE_SIZE)}
          style={{ width: "100%" }}
        >
          Xem thêm {Math.min(remaining, PAGE_SIZE)} bình luận
        </Button>
      )}

      {variant === "preview" && composer}

      <Alert>{error}</Alert>
    </div>
  );
}

function Composer({
  user,
  canComment,
  draft,
  setDraft,
  image,
  setImage,
  fileRef,
  field,
  busy,
  onSubmit,
  replyTo,
  clearReply,
}: {
  user: ReturnType<typeof useAuth>["user"];
  canComment: boolean;
  draft: string;
  setDraft: (value: string) => void;
  image: File | null;
  setImage: (file: File | null) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  field: React.RefObject<HTMLInputElement | null>;
  busy: boolean;
  onSubmit: () => void;
  replyTo: Comment | null;
  clearReply: () => void;
}) {
  if (!canComment) return null;
  // Chip vẫn cần hiện để biết phản hồi sẽ rơi vào nhánh nào, nhưng xưng @tên của
  // chính người đang gõ thì vô nghĩa — đổi thành "chính bạn".
  const replyingToSelf = Boolean(
    replyTo && user && replyTo.account?.id === user.id,
  );
  return (
    <div className="comment-composer">
      {replyTo && (
        <div className="reply-chip">
          Đang trả lời{" "}
          <b>{replyingToSelf ? "chính bạn" : `@${replyTo.account?.username}`}</b>
          <button className="link-btn" onClick={clearReply}>
            huỷ
          </button>
        </div>
      )}
      {image && (
        <div className="row faint">
          🖼️ {image.name}
          <button
            className="link-btn"
            onClick={() => {
              setImage(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            bỏ ảnh
          </button>
        </div>
      )}
      <div className="row">
        <Avatar src={user?.avatarUrl} name={user?.username} size={30} />
        <input
          ref={field}
          className="input grow"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            !replyTo
              ? "Viết bình luận…"
              : replyingToSelf
                ? "Viết trả lời…"
                : `Trả lời @${replyTo.account?.username}…`
          }
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => setImage(e.target.files?.[0] ?? null)}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileRef.current?.click()}
          title="Đính kèm ảnh"
        >
          🖼️
        </Button>
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={busy || (!draft.trim() && !image)}
        >
          Gửi
        </Button>
      </div>
    </div>
  );
}
