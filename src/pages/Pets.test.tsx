import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnedPetProfile, PetDetail, PetListItem } from "../types";
import { PetDetailPage, PetsPage, ageFrom } from "./Pets";

/**
 * Tầng API bị mock hoàn toàn: bài test này kiểm phần giao diện quyết định gì —
 * hiện nút nào, gửi body ra sao — chứ không kiểm đường dây HTTP.
 *
 * `petApi` và `petProfileApi` là HAI mock riêng vì chúng là hai bảng riêng ở
 * backend: dữ liệu sinh học (`pets`) và mặt công khai (`pet_profiles`). Phần
 * lớn giá trị của bộ test này nằm ở chỗ khẳng định trường nào đi vào endpoint
 * nào — gộp mock lại là mất đúng thứ đó.
 */
vi.mock("../api/endpoints", () => ({
  petApi: {
    mine: vi.fn(),
    detail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
  },
  petProfileApi: {
    byPetId: vi.fn(),
    owned: vi.fn(),
    update: vi.fn(),
  },
  postApi: { byPet: vi.fn() },
  groupApi: { joinedByPet: vi.fn() },
}));

/** PostCard kéo theo cả AuthContext, PetContext và tầng api — ngoài phạm vi test này */
vi.mock("../components/post/PostCard", () => ({
  PostCard: () => null,
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => mockNavigate };
});

/** Danh tính người gọi + tập quyền, đổi được theo từng test */
let auth = {
  user: { id: 7, username: "vu", roles: [] as never[] },
  can: (_permission: string) => true,
};
vi.mock("../context/AuthContext", () => ({
  useAuth: () => auth,
}));

/**
 * Danh sách thú cưng nay đến từ PetContext chứ không phải từ một lời gọi trong
 * trang: con đang thao tác là trạng thái dùng chung cho cả app (nó quyết định
 * header `X-Pet-Id` của mọi request ghi), nên trang chỉ đọc lại.
 */
const select = vi.fn();
const reload = vi.fn().mockResolvedValue(undefined);
let petCtx = {
  pets: [] as PetListItem[],
  activePet: null as PetListItem | null,
  activePetId: null as number | null,
  ready: true,
  select,
  reload,
};
vi.mock("../context/PetContext", () => ({
  useActivePet: () => petCtx,
}));

vi.mock("../hooks/usePetProfileLite", () => ({
  invalidatePetProfile: vi.fn(),
}));

const { petApi, petProfileApi, postApi, groupApi } = await import(
  "../api/endpoints"
);

function profile(over: Partial<PetListItem["profile"]> = {}) {
  return {
    handle: "milo",
    displayName: "Milo",
    avatarUrl: null,
    bio: "Lúc nào cũng đói.",
    visibility: "PUBLIC" as const,
    ...over,
  };
}

function pet(over: Partial<PetListItem> = {}): PetListItem {
  return {
    petId: 1,
    name: "Milo",
    species: "DOG",
    breed: "Golden Retriever",
    gender: "MALE",
    dateOfBirth: "2023-03-12",
    status: "ACTIVE",
    profile: profile(),
    ...over,
  };
}

function detail(over: Partial<PetDetail> = {}): PetDetail {
  return {
    petId: 1,
    name: "Milo",
    species: "DOG",
    breed: "Golden Retriever",
    gender: "MALE",
    dateOfBirth: "2023-03-12",
    status: "ACTIVE",
    ownerAccountId: 7,
    profile: profile(),
    ...over,
  };
}

function owned(over: Partial<OwnedPetProfile> = {}): OwnedPetProfile {
  return {
    petId: 1,
    handle: "milo",
    displayName: "Milo",
    avatarUrl: null,
    coverUrl: null,
    bio: "Lúc nào cũng đói.",
    status: "ACTIVE",
    visibility: "PUBLIC",
    ...over,
  };
}

function renderList() {
  return render(
    <MemoryRouter>
      <PetsPage />
    </MemoryRouter>,
  );
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/pets/1"]}>
      <Routes>
        <Route path="/pets/:id" element={<PetDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth = { user: { id: 7, username: "vu", roles: [] }, can: () => true };
  petCtx = {
    pets: [],
    activePet: null,
    activePetId: null,
    ready: true,
    select,
    reload,
  };
  vi.mocked(postApi.byPet).mockResolvedValue([]);
  vi.mocked(groupApi.joinedByPet).mockResolvedValue([]);
  vi.mocked(petProfileApi.owned).mockResolvedValue(owned());
});

describe("ageFrom", () => {
  it("dưới một tháng thì không hiện số 0", () => {
    const born = new Date();
    born.setDate(born.getDate() - 3);
    expect(ageFrom(born.toISOString().slice(0, 10))).toBe("chưa đầy 1 tháng");
  });

  it("dưới hai năm thì đếm theo tháng", () => {
    const born = new Date();
    born.setMonth(born.getMonth() - 8);
    expect(ageFrom(born.toISOString().slice(0, 10))).toBe("8 tháng");
  });

  it("từ hai năm trở lên thì đếm theo tuổi", () => {
    const born = new Date();
    born.setFullYear(born.getFullYear() - 3);
    expect(ageFrom(born.toISOString().slice(0, 10))).toBe("3 tuổi");
  });

  it("bỏ trống hoặc ngày rác thì trả chuỗi rỗng", () => {
    expect(ageFrom(undefined)).toBe("");
    expect(ageFrom("không-phải-ngày")).toBe("");
  });
});

describe("PetsPage", () => {
  it("hiện handle, loài, giống, giới tính và tuổi của từng hồ sơ", async () => {
    petCtx.pets = [pet()];
    renderList();

    expect(await screen.findByText("Milo")).toBeInTheDocument();
    expect(
      screen.getByText(/@milo · Chó · Golden Retriever · Đực/),
    ).toBeInTheDocument();
  });

  it("phân biệt tên hiển thị với tên thật khi hai giá trị khác nhau", async () => {
    petCtx.pets = [pet({ name: "Milo", profile: profile({ displayName: "Milo Bự" }) })];
    renderList();

    // displayName là thứ ra ngoài, name là dữ liệu của chủ — danh sách của chủ
    // phải cho thấy cả hai, nếu không họ không biết mình đang chọn con nào.
    expect(await screen.findByText("Milo Bự (Milo)")).toBeInTheDocument();
  });

  it("đánh dấu con đang thao tác và cho đổi sang con khác", async () => {
    petCtx.pets = [pet(), pet({ petId: 2, name: "Luna", profile: profile({ handle: "luna", displayName: "Luna" }) })];
    petCtx.activePetId = 1;
    renderList();

    expect(await screen.findByText("Đang thao tác")).toBeInTheDocument();

    // Đổi con đang thao tác đổi luôn tác giả của mọi bài viết sau đó — nó phải
    // đi qua PetContext chứ không phải state cục bộ của trang.
    await userEvent.click(
      screen.getByRole("button", { name: "Thao tác với bé này" }),
    );
    expect(select).toHaveBeenCalledWith(2);
  });

  it("danh sách rỗng thì gợi ý tạo hồ sơ đầu tiên", async () => {
    petCtx.pets = [];
    renderList();

    expect(
      await screen.findByText("Bạn chưa có thú cưng nào"),
    ).toBeInTheDocument();
  });

  it("thiếu quyền pet:create thì không hiện nút thêm", async () => {
    auth = { ...auth, can: (permission) => permission !== "pet:create" };
    renderList();

    await screen.findByText("Bạn chưa có thú cưng nào");
    expect(
      screen.queryByRole("button", { name: "+ Thêm thú cưng" }),
    ).not.toBeInTheDocument();
  });
});

describe("Form tạo hồ sơ", () => {
  async function openForm() {
    renderList();
    await screen.findByText("Bạn chưa có thú cưng nào");
    await userEvent.click(
      screen.getByRole("button", { name: "+ Thêm thú cưng" }),
    );
  }

  it("gửi đúng các trường được phép, KHÔNG có ownerId/status/bio", async () => {
    vi.mocked(petApi.create).mockResolvedValue(detail());
    await openForm();

    await userEvent.type(screen.getByLabelText("Tên"), "Milo");
    await userEvent.selectOptions(screen.getByLabelText("Loài"), "CAT");
    await userEvent.type(screen.getByLabelText("Giống"), "Munchkin");
    await userEvent.selectOptions(screen.getByLabelText("Giới tính"), "FEMALE");
    await userEvent.type(screen.getByLabelText("Ngày sinh"), "2023-03-12");
    await userEvent.selectOptions(
      screen.getByLabelText("Ai được xem hồ sơ"),
      "PRIVATE",
    );
    await userEvent.click(screen.getByRole("button", { name: "Tạo hồ sơ" }));

    await waitFor(() => expect(petApi.create).toHaveBeenCalled());
    const body = vi.mocked(petApi.create).mock.calls[0][0];
    expect(body).toEqual({
      name: "Milo",
      species: "CAT",
      breed: "Munchkin",
      gender: "FEMALE",
      dateOfBirth: "2023-03-12",
      visibility: "PRIVATE",
    });
    // Ba trường do domain quản lý không được rò vào body dù ở bất kỳ dạng nào
    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("status");
    // bio đã chuyển sang hồ sơ công khai — gửi ở đây là gửi vào endpoint sai
    expect(body).not.toHaveProperty("bio");
  });

  it("bé vừa tạo trở thành con đang thao tác", async () => {
    vi.mocked(petApi.create).mockResolvedValue(detail({ petId: 42 }));
    await openForm();

    await userEvent.type(screen.getByLabelText("Tên"), "Milo");
    await userEvent.type(screen.getByLabelText("Ngày sinh"), "2023-03-12");
    await userEvent.click(screen.getByRole("button", { name: "Tạo hồ sơ" }));

    // Không tự chọn thì tài khoản mới vừa tạo bé xong vẫn không đăng được bài:
    // mọi endpoint ghi đòi X-Pet-Id.
    await waitFor(() => expect(select).toHaveBeenCalledWith(42));
  });

  it("cắt khoảng trắng thừa và gửi null cho trường tuỳ chọn bỏ trống", async () => {
    vi.mocked(petApi.create).mockResolvedValue(detail());
    await openForm();

    await userEvent.type(screen.getByLabelText("Tên"), "  Milo  ");
    await userEvent.type(screen.getByLabelText("Ngày sinh"), "2023-03-12");
    await userEvent.click(screen.getByRole("button", { name: "Tạo hồ sơ" }));

    await waitFor(() => expect(petApi.create).toHaveBeenCalled());
    const body = vi.mocked(petApi.create).mock.calls[0][0];
    expect(body.name).toBe("Milo");
    expect(body.breed).toBeNull();
  });

  it("thiếu ngày sinh thì chặn tại chỗ, không gọi API", async () => {
    await openForm();

    await userEvent.type(screen.getByLabelText("Tên"), "Milo");
    await userEvent.click(screen.getByRole("button", { name: "Tạo hồ sơ" }));

    expect(await screen.findByText("Vui lòng chọn ngày sinh")).toBeInTheDocument();
    expect(petApi.create).not.toHaveBeenCalled();
  });

  it("ngày sinh ở tương lai bị chặn — cả bằng thuộc tính max lẫn khi submit", async () => {
    await openForm();

    const dob = screen.getByLabelText("Ngày sinh");
    expect(dob).toHaveAttribute("max", new Date().toISOString().slice(0, 10));

    await userEvent.type(screen.getByLabelText("Tên"), "Milo");
    await userEvent.type(dob, "2999-01-01");
    await userEvent.click(screen.getByRole("button", { name: "Tạo hồ sơ" }));

    expect(
      await screen.findByText("Ngày sinh không được ở tương lai"),
    ).toBeInTheDocument();
    expect(petApi.create).not.toHaveBeenCalled();
  });

  it("nút tạo bị khoá khi chưa nhập tên", async () => {
    await openForm();
    expect(screen.getByRole("button", { name: "Tạo hồ sơ" })).toBeDisabled();
  });

  it("giới hạn độ dài khớp với Bean Validation của backend", async () => {
    await openForm();
    expect(screen.getByLabelText("Tên")).toHaveAttribute("maxLength", "50");
    expect(screen.getByLabelText("Giống")).toHaveAttribute("maxLength", "100");
  });

  it("lỗi 400 từ backend hiện lại nguyên văn cho người dùng", async () => {
    vi.mocked(petApi.create).mockRejectedValue({
      response: {
        data: { message: '"species" must be one of [DOG, CAT, BIRD]' },
      },
    });
    await openForm();

    await userEvent.type(screen.getByLabelText("Tên"), "Milo");
    await userEvent.type(screen.getByLabelText("Ngày sinh"), "2023-03-12");
    await userEvent.click(screen.getByRole("button", { name: "Tạo hồ sơ" }));

    expect(
      await screen.findByText('"species" must be one of [DOG, CAT, BIRD]'),
    ).toBeInTheDocument();
  });
});

describe("PetDetailPage", () => {
  it("chủ sở hữu thấy đủ nút sửa hai phần hồ sơ và nút ngừng hoạt động", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail({ ownerAccountId: 7 }));
    renderDetail();

    expect(await screen.findByText("Milo")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sửa thông tin" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sửa hồ sơ công khai" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ngừng hoạt động" }),
    ).toBeInTheDocument();
  });

  it("người ngoài không thấy nút sửa hay ngừng hoạt động", async () => {
    // Quyền sở hữu là 1-N trực tiếp (pets.account_id): không còn khái niệm
    // đồng sở hữu, nên người khác chủ là người ngoài.
    vi.mocked(petApi.detail).mockResolvedValue(detail({ ownerAccountId: 99 }));
    renderDetail();

    expect(await screen.findByText("Milo")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sửa thông tin" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ngừng hoạt động" }),
    ).not.toBeInTheDocument();
  });

  it("không gọi /owned khi người xem không phải chủ", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail({ ownerAccountId: 99 }));
    renderDetail();

    await screen.findByText("Milo");
    // Endpoint đó trả 403 với người ngoài — một request chắc chắn hỏng không
    // nên nằm trên đường đi thường.
    expect(petProfileApi.owned).not.toHaveBeenCalled();
  });

  it("404 hiện chung một thông điệp cho cả 'không tồn tại' lẫn 'không được xem'", async () => {
    vi.mocked(petApi.detail).mockRejectedValue({
      response: { status: 404, data: { message: "NOT FOUND" } },
    });
    renderDetail();

    expect(
      await screen.findByText("Không tìm thấy hồ sơ thú cưng"),
    ).toBeInTheDocument();
  });

  it("ngừng hoạt động phải qua bước xác nhận rồi mới gọi API và rời trang", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail());
    vi.mocked(petApi.deactivate).mockResolvedValue({
      petId: 1,
      status: "DEACTIVATED",
    });
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Ngừng hoạt động" }),
    );
    expect(petApi.deactivate).not.toHaveBeenCalled();

    const dialog = screen
      .getByText("Ngừng hoạt động hồ sơ?")
      .closest(".modal");
    await userEvent.click(
      within(dialog as HTMLElement).getByRole("button", {
        name: "Ngừng hoạt động",
      }),
    );

    await waitFor(() => expect(petApi.deactivate).toHaveBeenCalledWith(1));
    expect(mockNavigate).toHaveBeenCalledWith("/pets");
  });

  it("sửa thông tin sinh học gửi PUT /v1/pets kèm id, KHÔNG kèm visibility", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail());
    vi.mocked(petApi.update).mockResolvedValue(
      detail({ profile: profile({ displayName: "Milo Bự" }) }),
    );
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Sửa thông tin" }),
    );

    // Phạm vi riêng tư thuộc hồ sơ công khai, không thuộc bảng pets — form sửa
    // không được để nó lọt vào đây.
    expect(screen.queryByLabelText("Ai được xem hồ sơ")).not.toBeInTheDocument();

    const name = screen.getByLabelText("Tên");
    await userEvent.clear(name);
    await userEvent.type(name, "Milo Bự");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(petApi.update).toHaveBeenCalled());
    expect(vi.mocked(petApi.update).mock.calls[0][0]).toBe(1);
    expect(vi.mocked(petApi.update).mock.calls[0][1]).not.toHaveProperty(
      "visibility",
    );
  });

  it("sửa hồ sơ công khai gửi multipart và chuẩn hoá handle về chữ thường", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail());
    vi.mocked(petProfileApi.update).mockResolvedValue(
      owned({ handle: "milobu" }),
    );
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Sửa hồ sơ công khai" }),
    );

    const handle = screen.getByLabelText("Handle");
    await userEvent.clear(handle);
    await userEvent.type(handle, "MiloBu");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(petProfileApi.update).toHaveBeenCalled());
    const [petId, form] = vi.mocked(petProfileApi.update).mock.calls[0];
    expect(petId).toBe(1);
    // Backend chuẩn hoá về chữ thường; gửi sẵn dạng đó để giá trị trên form
    // khớp với thứ thật sự được lưu.
    expect(form.get("handle")).toBe("milobu");
  });

  it("không chọn file thì KHÔNG gửi trường ảnh nào — backend giữ nguyên ảnh cũ", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail());
    vi.mocked(petProfileApi.update).mockResolvedValue(owned());
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Sửa hồ sơ công khai" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(petProfileApi.update).toHaveBeenCalled());
    const form = vi.mocked(petProfileApi.update).mock.calls[0][1];
    // Im lặng chính là tín hiệu "giữ nguyên": gửi chuỗi rỗng ở đây sẽ XOÁ avatar
    // mỗi lần người dùng chỉ sửa bio.
    expect(form.has("avatar")).toBe(false);
    expect(form.has("avatarUrl")).toBe(false);
    expect(form.has("cover")).toBe(false);
    expect(form.has("coverUrl")).toBe(false);
  });

  it("chọn file thì gửi phần avatar để backend upload lên Cloudinary", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail());
    vi.mocked(petProfileApi.update).mockResolvedValue(owned());
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Sửa hồ sơ công khai" }),
    );

    const file = new File(["x"], "milo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh đại diện"), file);
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(petProfileApi.update).toHaveBeenCalled());
    const form = vi.mocked(petProfileApi.update).mock.calls[0][1];
    expect(form.get("avatar")).toBe(file);
    // File thắng URL: không gửi kèm avatarUrl để backend khỏi phải phân xử
    expect(form.has("avatarUrl")).toBe(false);
  });

  it("tick xoá ảnh thì gửi avatarUrl rỗng", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail());
    vi.mocked(petProfileApi.owned).mockResolvedValue(
      owned({ avatarUrl: "https://cdn/milo.png" }),
    );
    vi.mocked(petProfileApi.update).mockResolvedValue(owned());
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Sửa hồ sơ công khai" }),
    );
    await userEvent.click(
      await screen.findByLabelText("Xoá ảnh đại diện hiện tại"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(petProfileApi.update).toHaveBeenCalled());
    const form = vi.mocked(petProfileApi.update).mock.calls[0][1];
    expect(form.get("avatarUrl")).toBe("");
  });

  it("hồ sơ đã ngừng hoạt động hiện nhãn cảnh báo", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(
      detail({ status: "DEACTIVATED" }),
    );
    renderDetail();

    expect(await screen.findByText("Đã ngừng hoạt động")).toBeInTheDocument();
  });

  it("nạp bài viết và nhóm của ĐÚNG bé đang mở", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail());
    renderDetail();

    await screen.findByText("Milo");
    await waitFor(() => expect(postApi.byPet).toHaveBeenCalledWith(1));
    expect(groupApi.joinedByPet).toHaveBeenCalledWith(1);
  });
});
