import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PetDetail, PetListItem } from "../types";
import { PetDetailPage, PetsPage, ageFrom } from "./Pets";

/**
 * Tầng API bị mock hoàn toàn: bài test này kiểm phần giao diện quyết định gì —
 * hiện nút nào, gửi body ra sao — chứ không kiểm đường dây HTTP.
 */
vi.mock("../api/endpoints", () => ({
  petApi: {
    mine: vi.fn(),
    detail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  },
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

const { petApi } = await import("../api/endpoints");

function pet(over: Partial<PetListItem> = {}): PetListItem {
  return {
    petId: 1,
    name: "Milo",
    species: "DOG",
    breed: "Golden Retriever",
    gender: "MALE",
    dateOfBirth: "2023-03-12",
    status: "ACTIVE",
    visibility: "PUBLIC",
    myOwnershipType: "PRIMARY_OWNER",
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
    bio: "Lúc nào cũng đói.",
    status: "ACTIVE",
    visibility: "PUBLIC",
    primaryOwnerId: 7,
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
  it("gọi /v1/pets/me KHÔNG kèm userId — danh tính do backend lấy từ token", async () => {
    vi.mocked(petApi.mine).mockResolvedValue([pet()]);
    renderList();

    await waitFor(() => expect(petApi.mine).toHaveBeenCalled());
    expect(vi.mocked(petApi.mine).mock.calls[0]).toEqual([]);
  });

  it("hiện loài, giống, giới tính và tuổi của từng hồ sơ", async () => {
    vi.mocked(petApi.mine).mockResolvedValue([pet()]);
    renderList();

    expect(await screen.findByText("Milo")).toBeInTheDocument();
    expect(
      screen.getByText(/Chó · Golden Retriever · Đực/),
    ).toBeInTheDocument();
  });

  it("tách được hồ sơ mình làm chủ và hồ sơ đồng sở hữu", async () => {
    vi.mocked(petApi.mine).mockResolvedValue([
      pet({ petId: 1, name: "Milo", myOwnershipType: "PRIMARY_OWNER" }),
      pet({ petId: 2, name: "Luna", myOwnershipType: "CO_OWNER" }),
    ]);
    renderList();

    expect(await screen.findByText("Milo")).toBeInTheDocument();
    expect(screen.getByText("Luna")).toBeInTheDocument();

    // Truy vấn phải bó trong từng hàng: "Đồng sở hữu" vừa là nhãn vai trò vừa là tên
    // tab, tìm trên cả trang sẽ dính nhầm nút lọc.
    const luna = screen.getByRole("link", { name: /Luna/ });
    const milo = screen.getByRole("link", { name: /Milo/ });
    expect(within(luna).getByText("Đồng sở hữu")).toBeInTheDocument();
    expect(within(milo).queryByText("Đồng sở hữu")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Tôi là chủ" }));
    expect(screen.getByText("Milo")).toBeInTheDocument();
    expect(screen.queryByText("Luna")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Đồng sở hữu" }));
    expect(screen.getByText("Luna")).toBeInTheDocument();
    expect(screen.queryByText("Milo")).not.toBeInTheDocument();
  });

  it("danh sách rỗng thì gợi ý tạo hồ sơ đầu tiên", async () => {
    vi.mocked(petApi.mine).mockResolvedValue([]);
    renderList();

    expect(
      await screen.findByText("Bạn chưa có thú cưng nào"),
    ).toBeInTheDocument();
  });

  it("thiếu quyền pet:create thì không hiện nút thêm", async () => {
    auth = { ...auth, can: (permission) => permission !== "pet:create" };
    vi.mocked(petApi.mine).mockResolvedValue([]);
    renderList();

    await screen.findByText("Bạn chưa có thú cưng nào");
    expect(
      screen.queryByRole("button", { name: "+ Thêm thú cưng" }),
    ).not.toBeInTheDocument();
  });

  it("lỗi từ API hiện nguyên văn message của backend", async () => {
    vi.mocked(petApi.mine).mockRejectedValue({
      response: { data: { message: "Thiếu quyền: pet:create" } },
    });
    renderList();

    expect(
      await screen.findByText("Thiếu quyền: pet:create"),
    ).toBeInTheDocument();
  });
});

describe("Form tạo hồ sơ", () => {
  async function openForm() {
    vi.mocked(petApi.mine).mockResolvedValue([]);
    renderList();
    await screen.findByText("Bạn chưa có thú cưng nào");
    await userEvent.click(
      screen.getByRole("button", { name: "+ Thêm thú cưng" }),
    );
  }

  it("gửi đúng các trường được phép, KHÔNG có ownerId/ownershipType/status", async () => {
    vi.mocked(petApi.create).mockResolvedValue(detail());
    await openForm();

    await userEvent.type(screen.getByLabelText("Tên"), "Milo");
    await userEvent.selectOptions(screen.getByLabelText("Loài"), "CAT");
    await userEvent.type(screen.getByLabelText("Giống"), "Munchkin");
    await userEvent.selectOptions(screen.getByLabelText("Giới tính"), "FEMALE");
    await userEvent.type(screen.getByLabelText("Ngày sinh"), "2023-03-12");
    await userEvent.selectOptions(
      screen.getByLabelText("Ai được xem"),
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
      bio: null,
      visibility: "PRIVATE",
    });
    // Ba trường do domain quản lý không được rò vào body dù ở bất kỳ dạng nào
    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("ownershipType");
    expect(body).not.toHaveProperty("status");
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
    expect(body.bio).toBeNull();
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
    expect(screen.getByLabelText("Giới thiệu")).toHaveAttribute(
      "maxLength",
      "500",
    );
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
  it("chủ sở hữu chính thấy cả nút sửa lẫn nút lưu trữ", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail({ primaryOwnerId: 7 }));
    renderDetail();

    expect(await screen.findByText("Milo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sửa hồ sơ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu trữ" })).toBeInTheDocument();
  });

  it("đồng sở hữu sửa được nhưng KHÔNG thấy nút lưu trữ", async () => {
    // Backend chỉ cho PRIMARY_OWNER lưu trữ; hiện nút cho co-owner là mời họ
    // bấm vào một thứ chắc chắn trả 403.
    vi.mocked(petApi.detail).mockResolvedValue(detail({ primaryOwnerId: 99 }));
    renderDetail();

    expect(await screen.findByText("Milo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sửa hồ sơ" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Lưu trữ" }),
    ).not.toBeInTheDocument();
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

  it("lưu trữ phải qua bước xác nhận rồi mới gọi API và rời trang", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail());
    vi.mocked(petApi.archive).mockResolvedValue({
      petId: 1,
      status: "ARCHIVED",
    });
    renderDetail();

    await userEvent.click(await screen.findByRole("button", { name: "Lưu trữ" }));
    expect(petApi.archive).not.toHaveBeenCalled();

    const dialog = screen.getByText("Lưu trữ hồ sơ?").closest(".modal");
    await userEvent.click(
      within(dialog as HTMLElement).getByRole("button", { name: "Lưu trữ" }),
    );

    await waitFor(() => expect(petApi.archive).toHaveBeenCalledWith(1));
    expect(mockNavigate).toHaveBeenCalledWith("/pets");
  });

  it("sửa hồ sơ gửi PUT kèm id và cập nhật lại màn hình", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail());
    vi.mocked(petApi.update).mockResolvedValue(detail({ name: "Milo Bự" }));
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Sửa hồ sơ" }),
    );

    const name = screen.getByLabelText("Tên");
    await userEvent.clear(name);
    await userEvent.type(name, "Milo Bự");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(petApi.update).toHaveBeenCalled());
    expect(vi.mocked(petApi.update).mock.calls[0][0]).toBe(1);
    expect(await screen.findByText("Milo Bự")).toBeInTheDocument();
  });

  it("hồ sơ đã lưu trữ hiện nhãn cảnh báo", async () => {
    vi.mocked(petApi.detail).mockResolvedValue(detail({ status: "ARCHIVED" }));
    renderDetail();

    expect(await screen.findByText("Đã lưu trữ")).toBeInTheDocument();
  });
});
