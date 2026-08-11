import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { postApi } from "../api/endpoints";
import { PostCard } from "../components/post/PostCard";
import { Alert, Button, Card, Spinner } from "../components/ui";
import type { Post } from "../types";

/**
 * GET /v1/posts/:id là endpoint duy nhất trả kèm commentAmount và shareAmount,
 * nên trang chi tiết dùng nó thay vì lọc lại từ bảng tin.
 */
export function PostDetailPage() {
  const { id } = useParams();
  const postId = Number(id);
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPost(await postApi.detail(postId));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
      setPost(null);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner />;
  if (!post)
    return (
      <Card>
        <Alert>{error || "Không tìm thấy bài viết"}</Alert>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Quay lại
        </Button>
      </Card>
    );

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          ← Quay lại
        </Button>
        {typeof post.shareAmount === "number" && (
          <span className="faint">{post.shareAmount} lượt chia sẻ</span>
        )}
      </div>
      {/* variant="full": bình luận phân trang 10 dòng một lần, vì đây chính là
          nội dung chính của trang */}
      <PostCard
        post={post}
        variant="full"
        onChanged={() => {
          // Bài bị xoá thì không còn gì để xem
          navigate("/");
        }}
      />
    </>
  );
}
