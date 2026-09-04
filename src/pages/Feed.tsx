import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../api/client";
import { accountApi, postApi } from "../api/endpoints";
import { PostCard } from "../components/post/PostCard";
import { PostComposer } from "../components/post/PostComposer";
import {
  Alert,
  Avatar,
  Button,
  Card,
  CardHead,
  EmptyState,
  Spinner,
  Tabs,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { prefetchAccountProfiles } from "../hooks/useAccountProfileLite";
import type { Account, Post } from "../types";

type FeedTab = "latest" | "cursor" | "suggest";

/**
 * Cột phải chỉ còn gợi ý người dùng.
 *
 * Không còn nút "Kết bạn" (backend đã gỡ module friendship) nên mỗi dòng chỉ là
 * một đường dẫn sang trang cá nhân — nút duy nhất trước đây gọi một endpoint
 * nay trả 404. Khối "Nhóm nổi bật" và khối quảng cáo cũng biến mất cùng lý do.
 */
function SuggestionRail() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Account[]>([]);

  useEffect(() => {
    if (!user) return;
    accountApi
      .suggest(5)
      .then(setPeople)
      .catch(() => setPeople([]));
  }, [user]);

  return (
    <div className="stack">
      <Card tight>
        <CardHead title="Gợi ý theo dõi" />
        <div className="stack">
          {people.length === 0 && <div className="faint">Chưa có gợi ý</div>}
          {people.map((person) => (
            <Link
              key={person.id}
              to={`/profile/${person.id}`}
              className="row truncate"
            >
              <Avatar
                src={person.profile?.avatarUrl}
                name={person.username}
                size={36}
              />
              <div className="grow truncate">
                <div style={{ fontWeight: 650 }}>{person.username}</div>
                <div className="faint truncate">
                  {person.profile?.fullName ?? ""}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Số bài mỗi lô khi cuộn theo con trỏ */
const CURSOR_PAGE_SIZE = 5;

export function FeedPage() {
  const [tab, setTab] = useState<FeedTab>("latest");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /**
   * Con trỏ của lô kế tiếp, chỉ dùng cho tab "Cuộn tiếp".
   *
   * `null` mang hai nghĩa khác nhau tuỳ `hasNext`: trước lần tải đầu thì nghĩa là
   * "bắt đầu từ đầu", sau khi `hasNext` thành false thì nghĩa là "hết bài".
   */
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let list: Post[];
      if (tab === "suggest") {
        list = await postApi.suggest();
      } else if (tab === "cursor") {
        // Lô đầu tiên: không gửi cursor, backend tự lấy từ bài cũ nhất
        const page = await postApi.feedByCursor(null, CURSOR_PAGE_SIZE);
        list = page.content;
        setCursor(page.nextCursor);
        setHasNext(page.hasNext);
      } else {
        list = (await postApi.feed({ page: 1, limit: 20 })).content;
      }
      // Bài viết chỉ mang accountId — nạp trước hồ sơ tác giả để card
      // không nhấp nháy khi hiện tên và ảnh
      prefetchAccountProfiles(list.map((post) => post.accountId));
      setPosts(list);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  /**
   * Nối thêm một lô vào cuối danh sách.
   *
   * Lọc trùng theo `postId` thay vì nối thẳng: nếu có bài bị xoá giữa hai lần gọi,
   * cửa sổ con trỏ có thể trượt và trả lại một bài đã nằm trên màn hình — React sẽ
   * cảnh báo key trùng và bài đó hiện hai lần.
   */
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasNext) return;
    setLoadingMore(true);
    try {
      const page = await postApi.feedByCursor(cursor, CURSOR_PAGE_SIZE);
      prefetchAccountProfiles(page.content.map((post) => post.accountId));
      setPosts((current) => {
        const seen = new Set(current.map((post) => post.postId));
        return [...current, ...page.content.filter((p) => !seen.has(p.postId))];
      });
      setCursor(page.nextCursor);
      setHasNext(page.hasNext);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasNext, loadingMore]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PostComposer onPosted={load} />

      <Card tight>
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "latest", label: "Mới nhất" },
            { value: "cursor", label: "Cuộn tiếp" },
            { value: "suggest", label: "Gợi ý cho bạn" },
          ]}
        />
      </Card>

      <Alert>{error}</Alert>
      {loading ? (
        <Spinner />
      ) : posts.length === 0 ? (
        <Card>
          <EmptyState
            title="Chưa có bài viết nào"
            hint="Hãy là người đăng đầu tiên!"
          />
        </Card>
      ) : (
        <>
          {posts.map((post) => (
            <PostCard key={post.postId} post={post} onChanged={load} />
          ))}

          {tab === "cursor" && (
            <Card tight>
              {hasNext ? (
                <Button
                  variant="ghost"
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{ width: "100%" }}
                >
                  {loadingMore
                    ? "Đang tải…"
                    : `Tải thêm ${CURSOR_PAGE_SIZE} bài`}
                </Button>
              ) : (
                <div className="faint" style={{ textAlign: "center" }}>
                  Đã xem hết {posts.length} bài
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}

export { SuggestionRail };
