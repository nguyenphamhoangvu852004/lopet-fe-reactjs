import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { accountApi, friendApi, groupApi, postApi, profileApi } from "../api/endpoints";
import { PostCard } from "../components/post/PostCard";
import {
  Alert,
  Avatar,
  Badge,
  Card,
  CardHead,
  EmptyState,
  Spinner,
  Tabs,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { prefetchAccounts } from "../hooks/useAccountLite";
import type { Group, Post, Profile } from "../types";

type Tab = "people" | "posts" | "groups";

/** Người dùng tra được kèm id tài khoản (khác với hồ sơ, xem ghi chú bên dưới) */
interface PersonHit {
  accountId: number;
  username: string;
  avatarUrl?: string;
}

export function SearchPage() {
  const [params] = useSearchParams();
  const query = (params.get("q") ?? "").trim();
  const { user, can } = useAuth();

  const [tab, setTab] = useState<Tab>("people");
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /**
   * Backend không có endpoint tìm tài khoản theo username, chỉ có tìm HỒ SƠ
   * theo fullName (GET /v1/profiles?fullName=). Mà DTO hồ sơ không mang
   * accountId, nên từ kết quả đó không mở được trang cá nhân.
   *
   * Cách vòng: dựng một danh bạ cục bộ từ những nguồn có kèm id tài khoản —
   * bạn bè, gợi ý kết bạn, và (nếu là staff) toàn bộ danh sách tài khoản — rồi
   * lọc theo tên ngay tại client.
   */
  const buildDirectory = useCallback(async (): Promise<PersonHit[]> => {
    if (!user) return [];
    const directory = new Map<number, PersonHit>();

    const [friends, suggestions] = await Promise.all([
      friendApi.listOf(user.id).catch(() => null),
      accountApi.suggest(user.id, 50).catch(() => []),
    ]);

    friends?.others?.forEach((friend) =>
      directory.set(friend.id, {
        accountId: friend.id,
        username: friend.username,
        avatarUrl: friend.imageUrl,
      }),
    );
    suggestions.forEach((account) =>
      directory.set(account.id, {
        accountId: account.id,
        username: account.username,
        avatarUrl: account.profile?.avatarUrl ?? undefined,
      }),
    );

    if (can("account:read")) {
      const all = await accountApi.list().catch(() => []);
      all.forEach((account) =>
        directory.set(account.id, {
          accountId: account.id,
          username: account.username,
          avatarUrl: account.profile?.avatarUrl ?? undefined,
        }),
      );
    }

    return [...directory.values()];
  }, [user, can]);

  useEffect(() => {
    if (!query) {
      setPeople([]);
      setProfiles([]);
      setPosts([]);
      setGroups([]);
      return;
    }
    setLoading(true);
    setError("");

    const needle = query.toLowerCase();
    Promise.all([
      buildDirectory(),
      profileApi.search(query).catch(() => []),
      postApi.feed({ content: query }).catch(() => []),
      // Backend chưa có tìm nhóm — lọc trên danh sách gợi ý
      groupApi.suggest().catch(() => []),
    ])
      .then(([directory, profileHits, postHits, groupHits]) => {
        setPeople(
          directory.filter((person) =>
            person.username.toLowerCase().includes(needle),
          ),
        );
        setProfiles(profileHits);
        prefetchAccounts(postHits.map((post) => post.accountId));
        setPosts(postHits);
        setGroups(
          groupHits.filter((group) =>
            group.name?.toLowerCase().includes(needle),
          ),
        );
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [query, buildDirectory]);

  if (!query)
    return (
      <Card>
        <CardHead title="Tìm kiếm" sub="Nhập từ khoá ở ô tìm kiếm phía trên" />
        <EmptyState icon="🔍" title="Chưa có từ khoá" />
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
            { value: "people", label: `Người (${people.length + profiles.length})` },
            { value: "posts", label: `Bài viết (${posts.length})` },
            { value: "groups", label: `Nhóm (${groups.length})` },
          ]}
        />
        <Alert>{error}</Alert>
      </Card>

      {loading ? (
        <Spinner />
      ) : tab === "people" ? (
        <Card>
          {people.length === 0 && profiles.length === 0 ? (
            <EmptyState icon="🔍" title="Không tìm thấy ai" hint="Thử từ khoá khác" />
          ) : (
            <div className="stack">
              {people.map((person) => (
                <div key={person.accountId} className="row">
                  <Avatar src={person.avatarUrl} name={person.username} />
                  <div className="grow truncate">
                    <div style={{ fontWeight: 650 }}>{person.username}</div>
                  </div>
                  <Link
                    to={`/profile/${person.accountId}`}
                    className="btn btn-outline btn-sm"
                  >
                    Xem trang
                  </Link>
                </div>
              ))}

              {profiles.length > 0 && (
                <>
                  <div className="card-sub" style={{ marginTop: 10 }}>
                    Hồ sơ khớp tên
                  </div>
                  {profiles.map((profile) => (
                    <div key={profile.id} className="row">
                      <Avatar
                        src={profile.avatarUrl}
                        name={profile.fullName ?? "?"}
                      />
                      <div className="grow truncate">
                        <div style={{ fontWeight: 650 }}>
                          {profile.fullName ?? "Chưa đặt tên"}
                        </div>
                        <div className="faint truncate">
                          {profile.bio ?? profile.hometown ?? ""}
                        </div>
                      </div>
                      {/* DTO hồ sơ không kèm accountId nên không mở được trang
                          cá nhân từ đây — chỉ hiển thị thông tin. */}
                      <Badge>Hồ sơ #{profile.id}</Badge>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </Card>
      ) : tab === "posts" ? (
        posts.length === 0 ? (
          <Card>
            <EmptyState icon="📝" title="Không có bài viết nào khớp" />
          </Card>
        ) : (
          posts.map((post) => <PostCard key={post.postId} post={post} />)
        )
      ) : (
        <Card>
          {groups.length === 0 ? (
            <EmptyState icon="🧩" title="Không tìm thấy nhóm" />
          ) : (
            <div className="stack">
              {groups.map((group) => (
                <Link key={group.id} to={`/groups/${group.id}`} className="row">
                  <Avatar src={group.coverUrl} name={group.name} size={44} />
                  <div className="grow truncate">
                    <div style={{ fontWeight: 650 }}>{group.name}</div>
                    <div className="faint">
                      {group.totalMembers ?? group.members?.length ?? 0} thành
                      viên
                    </div>
                  </div>
                  <Badge tone={group.type === "PUBLIC" ? "ok" : "warn"}>
                    {group.type}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
