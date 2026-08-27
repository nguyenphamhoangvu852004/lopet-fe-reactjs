import { useCallback, useEffect, useState } from "react";
import { groupApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import type { GroupInvite } from "../types";

/**
 * Lời mời vào nhóm đang chờ NGƯỜI DÙNG trả lời.
 *
 * Backend đọc danh tính từ token và không nhận id nào trong URL. Khách chưa đăng
 * nhập thì trả mảng rỗng mà KHÔNG gọi API: request không có token chỉ nhận về
 * 401 rồi hiện một lỗi mà người dùng không sửa được bằng cách nào.
 */
export function useGroupInvites() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setInvites([]);
      return;
    }
    setLoading(true);
    try {
      setInvites(await groupApi.myInvites());
    } catch {
      // Hộp thư mời là thông tin phụ trợ: lỗi ở đây không được chặn cả trang
      // nhóm, nên chỉ coi như không có lời mời nào.
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { invites, loading, reload };
}
