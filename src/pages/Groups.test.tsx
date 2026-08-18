import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Group, GroupInvite, PetListItem } from "../types";
import { GroupDetailPage, GroupsPage } from "./Groups";

/**
 * Tầng API bị mock hoàn toàn: bài test này kiểm phần giao diện QUYẾT ĐỊNH gì —
 * hiện nút nào cho trạng thái nào, và bấm vào thì gọi endpoint nào — chứ không
 * kiểm đường dây HTTP.
 *
 * Giá trị chính nằm ở chỗ khẳng định giao diện đọc `viewerStatus` của backend chứ
 * không tự suy từ danh sách thành viên. Phép suy đó sai đúng ở chỗ nguy hiểm nhất:
 * nhóm riêng tư che `members`, nên một thành viên thật sẽ bị hiện nút "gửi yêu cầu
 * tham gia", và người đã gửi yêu cầu thì được mời gửi thêm lần nữa.
 */
vi.mock("../api/endpoints", () => ({
  groupApi: {
    suggest: vi.fn(),
    joined: vi.fn(),
    owned: vi.fn(),
    detail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removeMember: vi.fn(),
    join: vi.fn(),
    cancelJoinRequest: vi.fn(),
    leave: vi.fn(),
    joinRequests: vi.fn(),
    approveJoinRequest: vi.fn(),
    rejectJoinRequest: vi.fn(),
    invite: vi.fn(),
    myInvites: vi.fn(),
    acceptInvite: vi.fn(),
    rejectInvite: vi.fn(),
  },
  petProfileApi: { byHandle: vi.fn() },
  postApi: { feed: vi.fn() },
}));

/** Hai component này kéo theo cả AuthContext và tầng api — ngoài phạm vi test */
vi.mock("../components/post/PostCard", () => ({ PostCard: () => null }));
vi.mock("../components/post/PostComposer", () => ({
  PostComposer: () => <div data-testid="composer" />,
}));
vi.mock("../components/report/ReportDialog", () => ({
  ReportDialog: () => null,
}));
vi.mock("../hooks/usePetProfileLite", () => ({
  prefetchPetProfiles: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => vi.fn() };
});

let auth = {
  user: { id: 7, username: "vu", roles: [] as never[] },
  can: (_permission: string) => true,
};
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));

const activePet: PetListItem = {
  petId: 1,
  name: "Milo",
  species: "DOG",
  gender: "MALE",
  dateOfBirth: "2023-03-12",
  status: "ACTIVE",
  profile: {
    handle: "milo",
    displayName: "Milo",
    avatarUrl: null,
    bio: "",
    visibility: "PUBLIC",
  },
};

let petCtx = {
  pets: [activePet],
  activePet: activePet as PetListItem | null,
  activePetId: 1 as number | null,
  ready: true,
  select: vi.fn(),
  reload: vi.fn().mockResolvedValue(undefined),
};
vi.mock("../context/PetContext", () => ({ useActivePet: () => petCtx }));

const { groupApi, postApi } = await import("../api/endpoints");

function group(over: Partial<Group> = {}): Group {
  return {
    id: 5,
    name: "Hội những người nuôi mèo",
    type: "PUBLIC",
    bio: "",
    coverUrl: "",
    ownerPetId: 99,
    totalMembers: 3,
    members: [],
    restricted: false,
    viewerStatus: "NONE",
    ...over,
  };
}

function invite(over: Partial<GroupInvite> = {}): GroupInvite {
  return {
    groupId: 5,
    groupName: "Hội những người nuôi mèo",
    groupType: "PRIVATE",
    petId: 1,
    invitedBy: {
      petId: 42,
      name: "Bơ",
      handle: "bo",
      displayName: "Bơ",
      avatarUrl: "",
    },
    invitedAt: new Date().toISOString(),
    ...over,
  };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/groups/5"]}>
      <Routes>
        <Route path="/groups/:id" element={<GroupDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth = { user: { id: 7, username: "vu", roles: [] }, can: () => true };
  petCtx = {
    pets: [activePet],
    activePet,
    activePetId: 1,
    ready: true,
    select: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(postApi.feed).mockResolvedValue([]);
  vi.mocked(groupApi.joinRequests).mockResolvedValue([]);
  vi.mocked(groupApi.myInvites).mockResolvedValue([]);
  vi.mocked(groupApi.suggest).mockResolvedValue([]);
});

describe("Nút quan hệ với nhóm", () => {
  it("nhóm PUBLIC chưa tham gia: mời tham gia ngay", async () => {
    vi.mocked(groupApi.detail).mockResolvedValue(
      group({ type: "PUBLIC", viewerStatus: "NONE" }),
    );
    vi.mocked(groupApi.join).mockResolvedValue({
      groupId: 5,
      petId: 1,
      status: "ACTIVE",
    });
    renderDetail();

    const button = await screen.findByRole("button", { name: "Tham gia nhóm" });
    await userEvent.click(button);
    expect(groupApi.join).toHaveBeenCalledWith(5);
  });

  /**
   * Nhãn phải nói đúng việc sắp xảy ra. Ở nhóm riêng tư, bấm nút này KHÔNG đưa
   * người dùng vào nhóm — nó gửi một yêu cầu chờ duyệt, và họ cần biết trước.
   */
  it("nhóm PRIVATE chưa tham gia: nhãn là gửi yêu cầu, không phải tham gia", async () => {
    vi.mocked(groupApi.detail).mockResolvedValue(
      group({ type: "PRIVATE", viewerStatus: "NONE", restricted: true }),
    );
    renderDetail();

    expect(
      await screen.findByRole("button", { name: "Gửi yêu cầu tham gia" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Tham gia nhóm" }),
    ).not.toBeInTheDocument();
  });

  it("đang chờ duyệt: hiện trạng thái và cho huỷ yêu cầu", async () => {
    vi.mocked(groupApi.detail).mockResolvedValue(
      group({ type: "PRIVATE", viewerStatus: "PENDING_REQUEST", restricted: true }),
    );
    renderDetail();

    expect(await screen.findByText("Đang chờ duyệt")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Huỷ yêu cầu" }));
    expect(groupApi.cancelJoinRequest).toHaveBeenCalledWith(5);
    // Không được mời họ gửi lại một yêu cầu đang tồn tại — backend sẽ trả 409
    expect(
      screen.queryByRole("button", { name: "Gửi yêu cầu tham gia" }),
    ).not.toBeInTheDocument();
  });

  it("đang được mời: trả lời ngay tại trang nhóm", async () => {
    vi.mocked(groupApi.detail).mockResolvedValue(
      group({ type: "PRIVATE", viewerStatus: "PENDING_INVITE", restricted: true }),
    );
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Chấp nhận" }),
    );
    expect(groupApi.acceptInvite).toHaveBeenCalledWith(5);
  });

  it("thành viên thường: rời được nhóm sau khi xác nhận", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(groupApi.detail).mockResolvedValue(
      group({
        viewerStatus: "MEMBER",
        members: [{ groupId: 5, petId: 1, role: "MEMBER" }],
      }),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole("button", { name: "Rời nhóm" }));
    expect(groupApi.leave).toHaveBeenCalledWith(5);
  });

  /** Backend trả 400 cho việc này, nên một cái nút chỉ để hiện lỗi thì không nên có */
  it("chủ nhóm: không có nút rời nhóm, và được nói vì sao", async () => {
    vi.mocked(groupApi.detail).mockResolvedValue(
      group({
        viewerStatus: "MEMBER",
        members: [{ groupId: 5, petId: 1, role: "OWNER" }],
      }),
    );
    renderDetail();

    expect(await screen.findByText("Chủ nhóm")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rời nhóm" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/không rời nhóm được/i)).toBeInTheDocument();
  });

  /** Mọi hành động ở đây cần `X-Pet-Id`; chặn kèm lý do thay vì để nhận lỗi 400 */
  it("chưa chọn thú cưng: nút bị chặn", async () => {
    petCtx = { ...petCtx, activePet: null, activePetId: null };
    vi.mocked(groupApi.detail).mockResolvedValue(group());
    renderDetail();

    expect(
      await screen.findByRole("button", { name: "Chọn bé để tham gia" }),
    ).toBeDisabled();
  });
});

describe("Nhóm riêng tư với người ngoài", () => {
  it("nói rõ nội dung bị che, không phải nhóm trống", async () => {
    vi.mocked(groupApi.detail).mockResolvedValue(
      group({
        type: "PRIVATE",
        restricted: true,
        viewerStatus: "NONE",
        members: [],
        totalMembers: 12,
      }),
    );
    renderDetail();

    expect(
      await screen.findByText("Nội dung nhóm chỉ dành cho thành viên"),
    ).toBeInTheDocument();
    // "Nhóm chưa có bài viết nào" ở đây sẽ là một lời nói dối
    expect(
      screen.queryByText("Nhóm chưa có bài viết nào"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("composer")).not.toBeInTheDocument();
    // totalMembers vẫn đúng dù danh sách bị rút rỗng
    expect(screen.getByText(/12 thành viên/)).toBeInTheDocument();
  });

  it("thành viên của nhóm riêng tư thì thấy đầy đủ", async () => {
    vi.mocked(groupApi.detail).mockResolvedValue(
      group({
        type: "PRIVATE",
        restricted: false,
        viewerStatus: "MEMBER",
        members: [{ groupId: 5, petId: 1, role: "MEMBER" }],
      }),
    );
    renderDetail();

    expect(await screen.findByTestId("composer")).toBeInTheDocument();
    expect(
      screen.queryByText("Nội dung nhóm chỉ dành cho thành viên"),
    ).not.toBeInTheDocument();
  });
});

describe("Yêu cầu tham gia — phía quản trị nhóm", () => {
  const asAdmin = () =>
    group({
      type: "PRIVATE",
      viewerStatus: "MEMBER",
      members: [{ groupId: 5, petId: 1, role: "ADMIN" }],
    });

  it("quản trị viên duyệt được yêu cầu", async () => {
    vi.mocked(groupApi.detail).mockResolvedValue(asAdmin());
    vi.mocked(groupApi.joinRequests).mockResolvedValue([
      {
        groupId: 5,
        petId: 77,
        pet: {
          petId: 77,
          name: "Đậu",
          handle: "dau",
          displayName: "Đậu",
          avatarUrl: "",
        },
        requestedAt: new Date().toISOString(),
      },
    ]);
    renderDetail();

    expect(await screen.findByText("Yêu cầu tham gia")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Duyệt" }));
    expect(groupApi.approveJoinRequest).toHaveBeenCalledWith(5, 77);
  });

  it("không có yêu cầu nào thì không hiện thẻ rỗng", async () => {
    vi.mocked(groupApi.detail).mockResolvedValue(asAdmin());
    renderDetail();

    await waitFor(() => expect(groupApi.joinRequests).toHaveBeenCalled());
    expect(screen.queryByText("Yêu cầu tham gia")).not.toBeInTheDocument();
  });

  /** Thành viên thường không được gọi endpoint duyệt — backend trả 403 */
  it("thành viên thường không thấy hộp thư yêu cầu", async () => {
    vi.mocked(groupApi.detail).mockResolvedValue(
      group({
        viewerStatus: "MEMBER",
        members: [{ groupId: 5, petId: 1, role: "MEMBER" }],
      }),
    );
    renderDetail();

    await waitFor(() => expect(groupApi.detail).toHaveBeenCalled());
    expect(groupApi.joinRequests).not.toHaveBeenCalled();
  });
});

describe("Hộp thư lời mời", () => {
  function renderList() {
    return render(
      <MemoryRouter>
        <GroupsPage />
      </MemoryRouter>,
    );
  }

  it("nhãn tab đếm số lời mời đang chờ", async () => {
    vi.mocked(groupApi.myInvites).mockResolvedValue([invite()]);
    renderList();

    expect(
      await screen.findByRole("button", { name: "Lời mời (1)" }),
    ).toBeInTheDocument();
  });

  it("hiện ai mời vào nhóm nào, và chấp nhận được", async () => {
    vi.mocked(groupApi.myInvites).mockResolvedValue([invite()]);
    renderList();

    await userEvent.click(
      await screen.findByRole("button", { name: "Lời mời (1)" }),
    );
    expect(screen.getByText(/Bơ đã mời/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Chấp nhận" }));
    expect(groupApi.acceptInvite).toHaveBeenCalledWith(5);
  });

  it("chưa chọn bé thì không gọi API và nói rõ lý do", async () => {
    petCtx = { ...petCtx, activePet: null, activePetId: null };
    renderList();

    await userEvent.click(await screen.findByRole("button", { name: "Lời mời" }));
    expect(screen.getByText("Chưa chọn thú cưng nào")).toBeInTheDocument();
    // Thiếu X-Pet-Id thì request chỉ nhận 400 mà người dùng không sửa được
    expect(groupApi.myInvites).not.toHaveBeenCalled();
  });
});
