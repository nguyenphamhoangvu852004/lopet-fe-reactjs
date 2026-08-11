import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Alert, Avatar, Button, Modal, Tabs, timeAgo } from "./index";

afterEach(() => {
  vi.useRealTimers();
});

describe("Button", () => {
  it("mặc định là biến thể primary", () => {
    render(<Button>Đăng bài</Button>);
    const button = screen.getByRole("button", { name: "Đăng bài" });
    expect(button).toHaveClass("btn");
    expect(button).not.toHaveClass("btn-ghost");
  });

  it("gắn class theo variant và size", () => {
    render(
      <Button variant="danger" size="sm">
        Xoá
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Xoá" });
    expect(button).toHaveClass("btn-danger");
    expect(button).toHaveClass("btn-sm");
  });

  it("chuyển tiếp onClick và disabled xuống thẻ button", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Gửi
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Gửi" });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Avatar", () => {
  it("hiện ảnh khi có src", () => {
    render(<Avatar src="/avatar.png" name="Mèo Con" />);
    expect(screen.getByRole("img", { name: "Mèo Con" })).toHaveAttribute(
      "src",
      "/avatar.png",
    );
  });

  it("không có ảnh thì lấy chữ cái đầu viết hoa", () => {
    render(<Avatar name="mèo con" />);
    expect(screen.getByTitle("mèo con")).toHaveTextContent("M");
  });

  it("không có cả tên lẫn ảnh thì hiện dấu hỏi", () => {
    const { container } = render(<Avatar />);
    expect(container.querySelector(".avatar")).toHaveTextContent("?");
  });
});

describe("Alert", () => {
  it("không render gì khi không có nội dung", () => {
    const { container } = render(<Alert>{""}</Alert>);
    expect(container).toBeEmptyDOMElement();
  });

  it("gắn class theo kind", () => {
    render(<Alert kind="ok">Lưu thành công</Alert>);
    expect(screen.getByText("Lưu thành công")).toHaveClass("alert-ok");
  });
});

describe("Modal", () => {
  it("đóng thì không render", () => {
    const { container } = render(
      <Modal open={false} title="Báo cáo" onClose={vi.fn()}>
        Nội dung
      </Modal>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("gọi onClose khi bấm nút đóng", async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Báo cáo" onClose={onClose}>
        Nội dung
      </Modal>,
    );
    expect(screen.getByText("Nội dung")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("gọi onClose khi nhấn Escape", async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Báo cáo" onClose={onClose}>
        Nội dung
      </Modal>,
    );

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("bấm vào trong hộp thoại không làm đóng", async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Báo cáo" onClose={onClose}>
        <span>Nội dung</span>
      </Modal>,
    );

    await userEvent.click(screen.getByText("Nội dung"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Tabs", () => {
  const options = [
    { value: "all", label: "Tất cả" },
    { value: "mine", label: "Của tôi" },
  ];

  it("đánh dấu tab đang chọn và báo giá trị mới khi bấm", async () => {
    const onChange = vi.fn();
    render(<Tabs value="all" options={options} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Tất cả" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Của tôi" })).not.toHaveClass(
      "active",
    );

    await userEvent.click(screen.getByRole("button", { name: "Của tôi" }));
    expect(onChange).toHaveBeenCalledWith("mine");
  });
});

describe("timeAgo", () => {
  it("chuỗi rỗng khi không có thời điểm", () => {
    expect(timeAgo()).toBe("");
    expect(timeAgo("")).toBe("");
  });

  it("đổi khoảng cách thời gian sang tiếng Việt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));

    expect(timeAgo("2026-06-15T11:59:30Z")).toBe("vừa xong");
    expect(timeAgo("2026-06-15T11:45:00Z")).toBe("15 phút trước");
    expect(timeAgo("2026-06-15T09:00:00Z")).toBe("3 giờ trước");
    expect(timeAgo("2026-06-10T12:00:00Z")).toBe("5 ngày trước");
  });

  it("quá 30 ngày thì hiện ngày tháng", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));

    expect(timeAgo("2026-01-02T12:00:00Z")).toMatch(/2026/);
  });
});
