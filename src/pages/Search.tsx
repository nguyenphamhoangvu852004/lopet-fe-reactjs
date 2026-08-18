import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import {
  accountApi,
  friendApi,
  groupApi,
  petProfileApi,
  postApi,
} from "../api/endpoints";
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
import { prefetchPetProfiles } from "../hooks/usePetProfileLite";
import type { Group, Post, PublicPetProfile } from "../types";

type Tab = "pets" | "people" | "posts" | "groups";

/** Người dùng tra được kèm id tài khoản — dùng cho kết bạn và nhắn tin */
interface PersonHit {
  accountId: number;
  username: string;
  avatarUrl?: string;
}

export function SearchPage() {
  const [params] = useSearchParams();
  const query = (params.get("q") ?? "").trim();
  const { user, can } = useAuth();

  const [tab, setTab] = useState<Tab>("pets");
  const [pets, setPets] = useState<PublicPetProfile[]>([]);
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /**
   * Tìm THÚ CƯNG là đường tìm kiếm chính của mạng xã hội này — pet mới là thực
   * thể hoạt động, và `handle` đóng vai trò username.
   *
   * Backend chỉ có tra CHÍNH XÁC theo handle (`GET /v1/pet-profiles/handle/:h`),
   * không có tìm mờ: mở một endpoint quét bảng `pet_profiles` sẽ thành đường
   * liệt kê toàn bộ hồ sơ. Vì thế kết quả ở đây tối đa một dòng, và phần gợi ý
   * nói rõ điều đó thay vì để người dùng tưởng mình gõ sai.
   */
  const findPet = useCallback(async (needle: string) => {
    const handle = needle.replace(/^@/, "").toLowerCase();
    if (!handle) return [];
    try {
      return [await petProfileApi.byHandle(handle)];
    } catch {
      // 404 = không tồn tại HOẶC hồ sơ riêng tư; backend cố ý không phân biệt
      return [];
    }
  }, []);

  /**
   * Backend không có endpoint tìm tài khoản theo username, và hồ sơ chủ tài
   * khoản (`/v1/account-profiles`) nay chỉ đọc được của CHÍNH MÌNH — không còn
   * đường liệt kê nào để lọc.
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
      setPets([]);
      setPeople([]);
      setPosts([]);
      setGroups([]);
      return;
    }
    setLoading(true);
    setError("");

    const needle = query.toLowerCase();
    Promise.all([
      findPet(needle),
      buildDirectory(),
      postApi.feed({ content: query }).catch(() => []),
      // Backend chưa có tìm nhóm — lọc trên danh sách gợi ý
      groupApi.suggest().catch(() => []),
    ])
      .then(([petHits, directory, postHits, groupHits]) => {
        setPets(petHits);
        setPeople(
          directory.filter((person) =>
            person.username.toLowerCase().includes(needle),
          ),
        );
        prefetchPetProfiles(postHits.map((post) => post.petId));
        setPosts(postHits);
        setGroups(
          groupHits.filter((group) =>
            group.name?.toLowerCase().includes(needle),
          ),
        );
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [query, findPet, buildDirectory]);

  if (!query)
    return (
      <Card>
        <CardHead title="Tìm kiếm" sub="Nhập từ khoá ở ô tìm kiếm phía trên" />
        <EmptyState
          icon="🔍"
          title="Chưa có từ khoá"
          hint="Tìm thú cưng bằng handle (@milo), hoặc tìm người, bài viết, nhóm"
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
            { value: "pets", label: `Thú cưng (${pets.length})` },
            { value: "people", label: `Người (${people.length})` },
            { value: "posts", label: `Bài viết (${posts.length})` },
            { value: "groups", label: `Nhóm (${groups.length})` },
          ]}
        />
        <Alert>{error}</Alert>
      </Card>

      {loading ? (
        <Spinner />
      ) : tab === "pets" ? (
        <Card>
          {pets.length === 0 ? (
            <EmptyState
              icon="🐾"
              title="Không tìm thấy thú cưng nào"
              hint="Handle phải gõ chính xác — API chỉ tra đúng tên, không tìm gần đúng"
            />
          ) : (
            <div className="stack">
              {pets.map((pet) => (
                <Link key={pet.petId} to={`/pets/${pet.petId}`} className="row">
                  <Avatar
                    src={pet.avatarUrl ?? undefined}
                    name={pet.displayName}
                    size={44}
                  />
                  <div className="grow truncate">
                    <div style={{ fontWeight: 650 }}>{pet.displayName}</div>
                    <div className="faint truncate">
                      @{pet.handle}
                      {pet.bio ? ` · ${pet.bio}` : ""}
                    </div>
                  </div>
                  <Badge tone={pet.visibility === "PUBLIC" ? "ok" : "default"}>
                    {pet.visibility}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      ) : tab === "people" ? (
        <Card>
          {people.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="Không tìm thấy ai"
              hint="Chỉ tìm được trong bạn bè và gợi ý kết bạn — API không có đường tra tài khoản công khai"
            />
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
