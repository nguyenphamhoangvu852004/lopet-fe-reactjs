import { useEffect, useState } from "react";
import { accountProfileApi } from "../api/endpoints";
import type { PublicProfile } from "../types";

/**
 * DTO của bài viết chỉ mang `accountId`, không kèm tên hay ảnh đại diện, nên
 * muốn hiện tác giả tử tế thì phải tra thêm một lượt.
 *
 * Cache ở cấp module: một bảng tin có hàng chục bài của cùng vài người, tra lại
 * mỗi lần là thừa. `pending` gom các lời gọi trùng id đang bay về một request.
 *
 * Hồ sơ PRIVATE, và hồ sơ FRIEND của người không phải bạn, trả 404 — đó là kết
 * quả HỢP LỆ, không phải lỗi. Cache luôn giá trị `null` cho những id đó để không
 * hỏi lại ở mỗi lần render: nội dung công khai của một người vẫn hiện được, chỉ
 * là hiện dưới dạng rút gọn.
 */
const cache = new Map<number, PublicProfile | null>();
const pending = new Map<number, Promise<PublicProfile | null>>();

function fetchProfile(accountId: number): Promise<PublicProfile | null> {
  if (cache.has(accountId)) return Promise.resolve(cache.get(accountId) ?? null);

  const inflight = pending.get(accountId);
  if (inflight) return inflight;

  const request = accountProfileApi
    .byAccountId(accountId)
    .then((profile) => {
      cache.set(accountId, profile);
      return profile;
    })
    .catch(() => {
      cache.set(accountId, null);
      return null;
    })
    .finally(() => pending.delete(accountId));

  pending.set(accountId, request);
  return request;
}

export function useAccountProfileLite(
  accountId?: number | null,
): PublicProfile | null {
  const [profile, setProfile] = useState<PublicProfile | null>(() =>
    accountId ? (cache.get(accountId) ?? null) : null,
  );

  useEffect(() => {
    if (!accountId) {
      setProfile(null);
      return;
    }
    let alive = true;
    void fetchProfile(accountId).then((result) => {
      if (alive) setProfile(result);
    });
    return () => {
      alive = false;
    };
  }, [accountId]);

  return profile;
}

/** Nạp sẵn nhiều hồ sơ một lượt, dùng khi vừa tải xong một danh sách bài */
export function prefetchAccountProfiles(ids: (number | null | undefined)[]) {
  const unique = new Set(
    ids.filter((id): id is number => typeof id === "number" && id > 0),
  );
  unique.forEach((id) => {
    if (!cache.has(id)) void fetchProfile(id);
  });
}

/**
 * Xoá cache sau khi người dùng tự sửa hồ sơ của mình — nếu không, tên và ảnh cũ
 * còn dính lại trên mọi bài đã render cho tới khi tải lại trang.
 *
 * Cũng phải gọi khi đổi `visibility`: hạ hồ sơ xuống PRIVATE mà không dọn cache
 * thì bản công khai cũ vẫn hiện với chính người vừa ẩn nó đi.
 */
export function invalidateAccountProfile(accountId: number) {
  cache.delete(accountId);
}
