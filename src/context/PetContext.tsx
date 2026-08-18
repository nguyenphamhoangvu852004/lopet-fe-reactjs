import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getActivePetId, setActivePetId } from "../api/client";
import { petApi } from "../api/endpoints";
import type { PetListItem } from "../types";
import { useAuth } from "./AuthContext";

/**
 * "Thú cưng đang thao tác" — đối xứng với AuthContext, và là mảnh còn thiếu để
 * frontend nói cùng một mô hình với backend.
 *
 * Backend lấy PET làm chủ thể của nội dung xã hội: bài viết, bình luận, lượt
 * thích, tư cách thành viên nhóm đều gắn với `pets.id`, và mọi endpoint ghi đòi
 * header `X-Pet-Id`. Một tài khoản có nhiều thú cưng, nên "tôi đang là ai" là
 * một lựa chọn của người dùng chứ không suy ra được từ token — đó là lý do
 * context này tồn tại thay vì lấy bừa con đầu tiên ở mỗi lời gọi.
 *
 * KHÔNG nhúng petId vào JWT (backend cũng không): đổi pet là việc xảy ra liên
 * tục, gắn vào token nghĩa là mỗi lần đổi phải cấp lại token.
 */
interface PetContextValue {
  /** Thú cưng của người đang đăng nhập; rỗng khi tài khoản chưa tạo con nào */
  pets: PetListItem[];
  activePet: PetListItem | null;
  activePetId: number | null;
  /** Đã nạp xong danh sách lần đầu — dùng để không nháy UI "chưa có thú cưng" */
  ready: boolean;
  /** Đổi con đang thao tác; null nghĩa là bỏ chọn */
  select: (petId: number | null) => void;
  /** Nạp lại sau khi tạo/sửa/ngừng hoạt động một thú cưng */
  reload: () => Promise<void>;
}

const PetCtx = createContext<PetContextValue | null>(null);

export function PetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [pets, setPets] = useState<PetListItem[]>([]);
  const [activeId, setActiveId] = useState<number | null>(getActivePetId);
  const [ready, setReady] = useState(false);

  const select = useCallback((petId: number | null) => {
    setActiveId(petId);
    setActivePetId(petId);
  }, []);

  const reload = useCallback(async () => {
    if (!user) {
      setPets([]);
      select(null);
      setReady(true);
      return;
    }
    try {
      const list = await petApi.mine();
      setPets(list);

      /**
       * Con đang chọn phải LUÔN nằm trong danh sách. Ba trường hợp phải sửa lại
       * lựa chọn, và bỏ sót cái nào cũng dẫn tới 403 khó hiểu ở lần ghi kế:
       * chưa chọn gì, con đã chọn vừa bị ngừng hoạt động, hoặc localStorage còn
       * giữ petId của tài khoản đăng nhập trước đó trên cùng máy.
       */
      const current = getActivePetId();
      const stillValid = list.some((pet) => pet.petId === current);
      if (!stillValid) select(list[0]?.petId ?? null);
    } catch {
      // Mạng lỗi thì giữ nguyên lựa chọn cũ: xoá nó đi sẽ khoá người dùng khỏi
      // mọi thao tác ghi cho tới khi tải lại trang.
      setPets([]);
    } finally {
      setReady(true);
    }
  }, [user, select]);

  useEffect(() => {
    setReady(false);
    void reload();
  }, [reload]);

  const value = useMemo<PetContextValue>(() => {
    const activePet = pets.find((pet) => pet.petId === activeId) ?? null;
    return {
      pets,
      activePet,
      activePetId: activePet?.petId ?? null,
      ready,
      select,
      reload,
    };
  }, [pets, activeId, ready, select, reload]);

  return <PetCtx.Provider value={value}>{children}</PetCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useActivePet() {
  const ctx = useContext(PetCtx);
  if (!ctx) throw new Error("useActivePet phải nằm trong <PetProvider>");
  return ctx;
}
