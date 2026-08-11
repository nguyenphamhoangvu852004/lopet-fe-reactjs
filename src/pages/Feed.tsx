import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../api/client";
import { accountApi, adsApi, friendApi, groupApi, postApi } from "../api/endpoints";
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
import { prefetchAccounts } from "../hooks/useAccountLite";
import type { Account, Advertisement, Group, Post } from "../types";

type FeedTab = "latest" | "suggest";

function SuggestionRail() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Account[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [adIndex, setAdIndex] = useState(0);
  const [sent, setSent] = useState<number[]>([]);

  useEffect(() => {
    if (!user) return;
    accountApi
      .suggest(user.id, 5)
      .then(setPeople)
      .catch(() => setPeople([]));
    groupApi
      .suggest()
      .then(setGroups)
      .catch(() => setGroups([]));
    adsApi
      .list()
      .then(setAds)
      .catch(() => setAds([]));
  }, [user]);

  // Luân phiên quảng cáo để không phải lúc nào cũng chỉ hiện đúng một cái
  useEffect(() => {
    if (ads.length < 2) return;
    const timer = setInterval(
      () => setAdIndex((i) => (i + 1) % ads.length),
      8000,
    );
    return () => clearInterval(timer);
  }, [ads.length]);

  const ad = ads[adIndex];

  return (
    <div className="stack">
      <Card tight>
        <CardHead title="Gợi ý kết bạn" />
        <div className="stack">
          {people.length === 0 && <div className="faint">Chưa có gợi ý</div>}
          {people.map((person) => (
            <div key={person.id} className="row">
              <Link to={`/profile/${person.id}`} className="row grow truncate">
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
              <Button
                size="sm"
                variant={sent.includes(person.id) ? "ghost" : "outline"}
                disabled={sent.includes(person.id)}
                onClick={async () => {
                  try {
                    await friendApi.request(person.id);
                    setSent((list) => [...list, person.id]);
                  } catch {
                    // Lời mời trùng hoặc bị chặn — giữ nút nguyên trạng
                  }
                }}
              >
                {sent.includes(person.id) ? "Đã gửi" : "Kết bạn"}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card tight>
        <CardHead title="Nhóm nổi bật" />
        <div className="stack">
          {groups.length === 0 && <div className="faint">Chưa có nhóm nào</div>}
          {groups.slice(0, 5).map((group) => (
            <Link key={group.id} to={`/groups/${group.id}`} className="row">
              <Avatar src={group.coverUrl} name={group.name} size={36} />
              <div className="grow truncate">
                <div style={{ fontWeight: 650 }} className="truncate">
                  {group.name}
                </div>
                <div className="faint">
                  {group.totalMembers ?? group.members?.length ?? 0} thành viên
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {ad && (
        <Card tight>
          <CardHead
            title="Được tài trợ"
            sub={ad.author?.username ? `bởi ${ad.author.username}` : undefined}
          />
          <a href={ad.linkReferfence} target="_blank" rel="noreferrer">
            {ad.imageUrl && (
              <img
                src={ad.imageUrl}
                alt=""
                style={{ width: "100%", borderRadius: 12, marginBottom: 8 }}
              />
            )}
            <div style={{ fontWeight: 700 }}>{ad.title}</div>
            <div className="faint">{ad.description}</div>
          </a>
        </Card>
      )}
    </div>
  );
}

export function FeedPage() {
  const [tab, setTab] = useState<FeedTab>("latest");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list =
        tab === "suggest" ? await postApi.suggest() : await postApi.feed();
      // Bài viết chỉ mang accountId — nạp trước tác giả để card không nhấp nháy
      prefetchAccounts(list.map((post) => post.accountId));
      setPosts(list);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [tab]);

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
        posts.map((post) => (
          <PostCard key={post.postId} post={post} onChanged={load} />
        ))
      )}
    </>
  );
}

export { SuggestionRail };
