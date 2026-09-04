import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { accountApi, postApi } from "../api/endpoints";
import { PostCard } from "../components/post/PostCard";
import {
  Alert,
  Avatar,
  Card,
  CardHead,
  EmptyState,
  Spinner,
  Tabs,
} from "../components/ui";
import { prefetchAccountProfiles } from "../hooks/useAccountProfileLite";
import type { Account, Post } from "../types";

type Tab = "people" | "posts";

export function SearchPage() {
  const [params] = useSearchParams();
  const query = (params.get("q") ?? "").trim();

  const [tab, setTab] = useState<Tab>("people");
  const [people, setPeople] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /**
   * Backend vẫn không có endpoint tìm tài khoản theo tên, nhưng `GET /v1/accounts`
   * nay mở cho mọi tài khoản đã đăng nhập (phân quyền đã bị gỡ), nên chỉ cần nạp
   * danh sách rồi lọc tại client — không còn phải chắp vá danh bạ từ bạn bè +
   * gợi ý như bản trước.
   *
   * Bài viết thì ngược lại: `GET /v1/posts?content=` lọc ngay ở database và trả
   * về một trang OffsetPage, nên phải đọc `.content`.
   */
  useEffect(() => {
    if (!query) {
      setPeople([]);
      setPosts([]);
      return;
    }
    setLoading(true);
    setError("");

    const needle = query.toLowerCase();
    Promise.all([
      accountApi.list().catch(() => [] as Account[]),
      postApi
        .feed({ content: query, page: 1, limit: 20 })
        .then((page) => page.content)
        .catch(() => [] as Post[]),
    ])
      .then(([accounts, postHits]) => {
        setPeople(
          accounts.filter((account) =>
            `${account.username} ${account.profile?.fullName ?? ""}`
              .toLowerCase()
              .includes(needle),
          ),
        );
        prefetchAccountProfiles(postHits.map((post) => post.accountId));
        setPosts(postHits);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [query]);

  if (!query)
    return (
      <Card>
        <CardHead title="Tìm kiếm" sub="Nhập từ khoá ở ô tìm kiếm phía trên" />
        <EmptyState
          icon="🔍"
          title="Chưa có từ khoá"
          hint="Tìm người hoặc bài viết"
        />
      </Card>
    );

  return (
    <>
      <Card tight>
        <CardHead title={`Kết quả cho “${query}”`} />
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "people", label: `Người (${people.length})` },
            { value: "posts", label: `Bài viết (${posts.length})` },
          ]}
        />
        <Alert>{error}</Alert>
      </Card>

      {loading ? (
        <Spinner />
      ) : tab === "people" ? (
        <Card>
          {people.length === 0 ? (
            <EmptyState icon="🔍" title="Không tìm thấy ai" />
          ) : (
            <div className="stack">
              {people.map((person) => (
                <div key={person.id} className="row">
                  <Avatar
                    src={person.profile?.avatarUrl}
                    name={person.username}
                  />
                  <div className="grow truncate">
                    <div style={{ fontWeight: 650 }}>{person.username}</div>
                    <div className="faint truncate">
                      {person.profile?.fullName ?? ""}
                    </div>
                  </div>
                  <Link
                    to={`/profile/${person.id}`}
                    className="btn btn-outline btn-sm"
                  >
                    Xem trang
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : posts.length === 0 ? (
        <Card>
          <EmptyState icon="📝" title="Không có bài viết nào khớp" />
        </Card>
      ) : (
        posts.map((post) => <PostCard key={post.postId} post={post} />)
      )}
    </>
  );
}
