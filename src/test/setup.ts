import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

// Mỗi test bắt đầu từ DOM sạch và localStorage rỗng — api/client.ts đọc token
// từ localStorage nên rác của test trước sẽ làm test sau đỏ một cách khó hiểu.
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
