import { useCallback, useEffect, useState } from "react";
import { groupApi } from "../api/endpoints";
import { useActivePet } from "../context/PetContext";
import type { GroupInvite } from "../types";

/**
 * Lời mời vào nhóm đang chờ THÚ CƯNG ĐANG THAO TÁC trả lời.
 *
 * Hộp thư này gắn với con vật, không với tài khoản: backend đọc `X-Pet-Id` và
 * không nhận id nào trong URL. Vì thế danh sách phải tải LẠI mỗi khi người dùng
 * đổi bé — giữ nguyên kết quả cũ sẽ hiện lời mời của con trước cho con sau, và
 * bấm chấp nhận thì backend trả 404 vì không có lời mời nào cho con đang chọn.
 *
 * Chưa chọn bé thì trả mảng rỗng mà KHÔNG gọi API: request thiếu `X-Pet-Id` chỉ
 * nhận về 400 rồi hiện một lỗi mà người dùng không sửa được bằng cách nào.
 */
export function useGroupInvites() {
  const { activePetId } = useActivePet();
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!activePetId) {
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
  }, [activePetId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { invites, loading, reload };
}
