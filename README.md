# Lopet — Frontend ReactJS

Frontend viết lại bằng React + TypeScript + Vite cho backend `lopet-be`, thay
cho bản Vue `Lopet_FE`.

## Chạy

```bash
npm install
cp .env.example .env      # VITE_BACKEND_API = REST (8080), VITE_SOCKET_URL = Socket.IO (8081)
npm run dev               # http://localhost:5173
npm run build             # tsc -b && vite build
```

Backend phải chạy trước. Nếu chạy backend từ máy host trong khi MySQL/Redis nằm
trong docker, nhớ override hostname:

```bash
DATABASE_HOSTNAME=localhost DATABASE_PORT=3307 \
REDIS_HOSTNAME=localhost REDIS_PORT=6379 node dist/index.js
```

## Cấu trúc

```
src/
  api/client.ts        axios + interceptor token, hàm unwrap envelope
  api/endpoints.ts     toàn bộ API surface, nhóm theo domain
  authz/permissions.ts bản sao danh mục quyền của backend (chỉ để gate UI)
  context/AuthContext  phiên đăng nhập + hàm can()
  components/ui        Card, Button, Avatar, Modal, Tabs, Badge…
  components/layout    AppShell (topbar + sidebar + right rail)
  components/post      PostCard (like, bình luận, xoá, báo cáo)
  pages/               Auth, Feed, Profile, Friends, Groups, Messages,
                       Advertiser, Admin
```

## Mô hình phân quyền

Frontend phản chiếu đúng 4 trục của backend:

| Trục | Thể hiện trên UI |
|---|---|
| Baseline (đã đăng nhập) | Ai cũng đăng bài, tạo nhóm, gửi báo cáo |
| Platform role | Mục "Quản trị" chỉ hiện khi có `account:read` / `report:read` / `advertiser:read` |
| Account capability | Trang Nhà quảng cáo bám vòng đời `PENDING → APPROVED → SUSPENDED` |
| Resource role | Nút xoá/sửa chỉ hiện cho chủ sở hữu; group hiển thị vai trò OWNER/ADMIN/MEMBER |

`src/authz/permissions.ts` là **bản sao** của
`lopet-be/src/authz/permission.catalog.ts`. Nó chỉ dùng để ẩn/hiện UI — **không
phải lớp bảo mật**. Backend mới là nơi thực thi; gõ thẳng URL vẫn nhận 403.
Khi backend đổi danh mục quyền, phải cập nhật file này cho khớp.

## Hợp đồng API — những chỗ đã đổi so với bản Vue

Backend đã bỏ nhận danh tính từ body. Các payload sau **không còn gửi** lên:

| Endpoint | Trường đã bỏ |
|---|---|
| `POST /posts`, `PUT /posts/:id` | `accountId`, `owner` |
| `POST /comments` | `accountId` |
| `POST /groups`, `PUT /groups/:id`, `DELETE /groups*` | `owner` |
| `POST /messages` | `senderId` |
| `POST /advertisements`, `PUT /advertisements/:id` | `accountId` |
| `POST /profiles/:id` (gán hồ sơ) | `accountId` |
| `DELETE /friendships` | `senderId`, `receiverId` → thay bằng **`friendId`** |

DTO trả về cũng đã bỏ `password` (mọi account DTO) và `email` (DTO bạn bè).

## Phiên đăng nhập và gia hạn token

Access token sống 1 giờ, refresh token 10 giờ. `src/api/client.ts` giữ toàn bộ
vòng đời phiên:

| Tình huống | Xử lý |
|---|---|
| Access token đã hết hạn (đọc `exp` trong JWT) | Gia hạn **trước** khi gửi request |
| Response 401 | Gia hạn rồi gửi lại đúng request đó **một** lần |
| Response 500 kèm message `jwt expired` / `invalid signature` / `jwt malformed` | Cũng coi là token hỏng — xem ghi chú dưới |
| Response 400 `Token not found` | Gia hạn rồi thử lại |
| Gia hạn thất bại, hoặc token mới vẫn bị từ chối | `endSession()`: xoá token + user + pet đang chọn, phát `lopet:session-expired` |
| Response 403 | **Không** đụng tới phiên — 403 là thiếu quyền |

Hai điểm dễ sai:

- **Lỗi token không phải lúc nào cũng là 401.** Route mang `@Auth(required=true)`
  của backend giữ nguyên hành vi bản TypeScript: message thô của jsonwebtoken lọt
  ra ngoài kèm mã **500** (`RawJwtException`). Interceptor chỉ bắt 401 sẽ bỏ sót
  đúng trường hợp phổ biến nhất.
- **Backend xoay vòng cả hai token**, nên phải ghi lại `refreshToken` mới chứ
  không chỉ `accessToken`. Mọi lời gọi gia hạn chạy song song dùng chung một
  request (`pendingRefresh`); để mỗi request tự gọi thì chúng xoay vòng đè lên
  nhau và phần còn lại của phiên cầm token đã chết.

Socket.IO gửi token một lần trong handshake, nên `RealtimeContext` nghe sự kiện
`lopet:session-refreshed` để cập nhật `socket.auth` — nếu không, lần tự kết nối
lại nào cũng cầm token cũ và realtime chết im lặng.

## Điểm cần biết về dữ liệu

- Bài viết dùng khoá `postId`, **không phải** `id`; số lượt thích là `likeAmount`,
  và trạng thái "đã thích" suy ra từ `likeList`.
- `GET /comments/:postId` bọc thêm một lớp `{ postId, comments }`.
- `GET /advertisers/me` trả **404** khi tài khoản chưa đăng ký hồ sơ — đây là
  trạng thái bình thường, không phải lỗi.
- `GET /friendships/:id` trả **403** nếu người xem không phải chính chủ hoặc bạn
  bè. UI hiển thị thành thông báo khoá riêng thay vì báo lỗi đỏ.
- Quảng cáo giữ tên trường sai chính tả `linkReferfence` trong DTO trả về (backend
  cố ý không đổi để khỏi phá hợp đồng API), dù cột DB đã là `link_reference`.

## Giao diện

Layout theo phong cách các template mạng xã hội kiểu "Sociala": thẻ bo tròn lớn,
đổ bóng mềm, sidebar trái cố định, cột phải chứa widget gợi ý, accent tím, hỗ trợ
sáng/tối. Toàn bộ CSS trong `src/styles/global.css` là tự viết — không dùng asset
hay mã nguồn của template thương mại nào.

## Chưa làm

- Realtime: backend có socket.io nhưng frontend đang poll thủ công (tin nhắn,
  thông báo).
- Tìm kiếm chỉ tìm được **người theo tên** (`GET /v1/profiles?fullName=`) vì backend
  chưa có endpoint tìm bài viết hay nhóm.
- Chưa có nạp tiền / quản lý ngân sách quảng cáo (backend cũng chưa có nghiệp vụ).
- Chưa có test tự động.
