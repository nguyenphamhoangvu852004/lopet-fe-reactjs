import { useEffect, useState } from "react";
import { petProfileApi } from "../api/endpoints";
import type { PublicPetProfile } from "../types";

/**
 * DTO của bài viết chỉ mang `petId`, không kèm handle hay ảnh đại diện, nên
 * muốn hiện tác giả tử tế thì phải tra thêm một lượt.
 *
 * Cache ở cấp module: một bảng tin có hàng chục bài của cùng vài con vật, tra
 * lại mỗi lần là thừa. `pending` gom các lời gọi trùng id đang bay về một
 * request.
 *
 * Hồ sơ PRIVATE/FOLLOWERS của người khác trả 404 — đó là kết quả HỢP LỆ, không
 * phải lỗi. Cache luôn giá trị `null` cho những id đó để không hỏi lại ở mỗi
 * lần render: nội dung công khai của một con vật vẫn hiện được, chỉ là hiện
 * dưới dạng rút gọn.
 */
const cache = new Map<number, PublicPetProfile | null>();
const pending = new Map<number, Promise<PublicPetProfile | null>>();

function fetchProfile(petId: number): Promise<PublicPetProfile | null> {
  if (cache.has(petId)) return Promise.resolve(cache.get(petId) ?? null);

  const inflight = pending.get(petId);
  if (inflight) return inflight;

  const request = petProfileApi
    .byPetId(petId)
    .then((profile) => {
      cache.set(petId, profile);
      return profile;
    })
    .catch(() => {
      cache.set(petId, null);
      return null;
    })
    .finally(() => pending.delete(petId));

  pending.set(petId, request);
  return request;
}

export function usePetProfileLite(
  petId?: number | null,
): PublicPetProfile | null {
  const [profile, setProfile] = useState<PublicPetProfile | null>(() =>
    petId ? (cache.get(petId) ?? null) : null,
  );

  useEffect(() => {
    if (!petId) {
      setProfile(null);
      return;
    }
    let alive = true;
    void fetchProfile(petId).then((result) => {
      if (alive) setProfile(result);
    });
    return () => {
      alive = false;
    };
  }, [petId]);

  return profile;
}

/** Nạp sẵn nhiều hồ sơ một lượt, dùng khi vừa tải xong một danh sách bài */
export function prefetchPetProfiles(ids: (number | null | undefined)[]) {
  const unique = new Set(
    ids.filter((id): id is number => typeof id === "number" && id > 0),
  );
  unique.forEach((id) => {
    if (!cache.has(id)) void fetchProfile(id);
  });
}

/**
 * Xoá cache sau khi người dùng tự sửa hồ sơ thú cưng của mình — nếu không, tên
 * và ảnh cũ còn dính lại trên mọi bài đã render cho tới khi tải lại trang.
 */
export function invalidatePetProfile(petId: number) {
  cache.delete(petId);
}
