import { useEffect, useState } from "react";
import { accountApi } from "../api/endpoints";
import type { Account } from "../types";

/**
 * DTO của bài viết / bình luận chỉ mang `accountId`, không kèm tên hay ảnh đại
 * diện, nên muốn hiện tác giả tử tế thì phải tra thêm một lượt.
 *
 * Cache ở cấp module: một bảng tin có hàng chục bài của cùng vài người, tra lại
 * mỗi lần là thừa. `pending` gom các lời gọi trùng id đang bay về một request.
 */
const cache = new Map<number, Account>();
const pending = new Map<number, Promise<Account | null>>();

function fetchAccount(id: number): Promise<Account | null> {
  const cached = cache.get(id);
  if (cached) return Promise.resolve(cached);

  const inflight = pending.get(id);
  if (inflight) return inflight;

  const request = accountApi
    .detail(id)
    .then((account) => {
      cache.set(id, account);
      return account;
    })
    .catch(() => null)
    .finally(() => pending.delete(id));

  pending.set(id, request);
  return request;
}

export function useAccountLite(id?: number | null): Account | null {
  const [account, setAccount] = useState<Account | null>(() =>
    id ? (cache.get(id) ?? null) : null,
  );

  useEffect(() => {
    if (!id) {
      setAccount(null);
      return;
    }
    let alive = true;
    fetchAccount(id).then((result) => {
      if (alive) setAccount(result);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  return account;
}

/** Nạp sẵn nhiều tài khoản một lượt, dùng khi vừa tải xong một danh sách bài */
export function prefetchAccounts(ids: (number | null | undefined)[]) {
  const unique = new Set(
    ids.filter((id): id is number => typeof id === "number" && id > 0),
  );
  unique.forEach((id) => {
    if (!cache.has(id)) void fetchAccount(id);
  });
}
