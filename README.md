# Lopet — Frontend ReactJS

Frontend viết lại bằng React + TypeScript + Vite cho backend `lopet-be`, thay
cho bản Vue `Lopet_FE`.

## Chạy

```bash
npm install
cp .env.example .env      # chỉ cần VITE_BACKEND_API; realtime dùng chung cổng đó
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
vòng đời phiên.

**Hai token nằm ở hai nơi khác nhau:**

| Token | Ở đâu | Ai đọc được |
|---|---|---|
| Access token | `localStorage.accessToken`, gắn vào header `Authorization` | JavaScript của FE (cần, để đọc `roles` dựng UI và để gửi kèm frame CONNECT của WebSocket) |
| Refresh token | Cookie `refreshToken`, cờ `HttpOnly` do backend đặt | **Không ai** ở phía client — trình duyệt tự gửi kèm khi gọi `/v1/auth/refresh` |

Vì vậy `api` và `refreshClient` đều khai `withCredentials: true`; thiếu cờ này
thì đăng nhập vẫn chạy nhưng trình duyệt không lưu cookie, và phiên chết cứng
sau 1 giờ. `POST /v1/auth/refresh` **không có body**.

**Cấu hình bắt buộc phía backend:** `DOMAIN_CORS` phải là origin cụ thể của FE
(vd `http://localhost:5173`). Backend chỉ bật `allowCredentials` khi danh sách
origin không phải `*` — để `*` thì trình duyệt chặn luôn mọi request mang
cookie, kể cả đăng nhập.

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
- **Backend xoay vòng refresh token ở mỗi lần gia hạn**, nhưng client không phải
  làm gì: token mới đi ra bằng `Set-Cookie` và trình duyệt tự ghi đè. Mọi lời gọi
  gia hạn chạy song song vẫn phải dùng chung một request (`pendingRefresh`) — để
  mỗi request tự gọi thì chúng xoay vòng đè lên nhau và cookie cuối cùng còn lại
  không khớp với token mà phần còn lại của phiên đang cầm.
- **Client không biết phiên còn sống hay không.** Cookie là `HttpOnly` nên không
  đọc được; thứ duy nhất kiểm được là "máy này đã từng đăng nhập", tức là có
  `accessToken` trong localStorage. Không có nó thì không gọi gia hạn và 401
  được để nguyên cho nơi gọi — nếu không, khách vãng lai chạm route cần đăng
  nhập sẽ bị đá về trang đăng nhập cho một phiên chưa từng tồn tại.
- **Đăng xuất không xoá được cookie** (`HttpOnly`), chỉ xoá access token. Cookie
  nằm lại tới khi hết hạn nhưng vô hại vì không còn đường nào dùng tới nó; xoá
  thật cần một endpoint logout phía backend.

WebSocket gửi token một lần trong frame CONNECT, nên `RealtimeContext` nghe sự
kiện `lopet:session-refreshed` để cập nhật `connectHeaders` — nếu không, lần tự
kết nối lại nào cũng cầm token cũ và realtime chết im lặng. Khi server trả frame
ERROR `TOKEN_EXPIRED`, context gọi gia hạn phiên rồi để chính cơ chế reconnect
của stompjs dùng token mới; các lỗi xác thực khác thì dừng hẳn thay vì thử lại
mãi với dữ liệu đã hỏng.

## Realtime

STOMP over WebSocket (`@stomp/stompjs`) tới endpoint `/ws` của backend, **cùng
cổng với REST** — URL suy ra từ `VITE_BACKEND_API` (http → ws, https → wss).
Bản trước dùng `socket.io-client` nối tới netty-socketio ở cổng riêng 8081;
backend đã bỏ hẳn thư viện đó nên client cũ không còn kết nối được.

Toàn bộ tầng này nằm gọn trong `src/context/RealtimeContext.tsx`; phần còn lại
của app chỉ thấy hook `useRealtime()` với API không đổi.

| Việc | Destination |
|---|---|
| Tin nhắn đến | subscribe `/topic/user.<myId>/chat` |
| Thông báo mới | subscribe `/topic/user.<myId>/notification` |
| Trạng thái tin MÌNH gửi | subscribe `/topic/user.<myId>/message-status` |
| Ack "đã nhận" | publish `/app/message.delivered` `{messageIds}` |
| Ack "đã xem" | publish `/app/message.read` `{partnerId}` |

Ba điểm khác bản socket.io, đều bắt buộc:

- **Không còn tự vào phòng `user_<id>`** — client phải tự subscribe. Server chặn
  destination mang id của người khác, nên đây cũng là ranh giới bảo mật chứ
  không chỉ là thủ tục.
- **Chỉ publish được vào `/app/**`**. Gửi thẳng vào `/topic/**` bị từ chối.
- **Không còn tên sự kiện**, destination đóng vai trò đó — lỗi chính tả
  `chat messsage` (ba chữ `s`) của bản cũ biến mất.

Chi tiết hợp đồng và thông điệp lỗi:
`lopet-be-java-springboot/docs/REALTIME_WEBSOCKET_MIGRATION.md`.

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

- Tìm kiếm chỉ tìm được **người theo tên** (`GET /v1/profiles?fullName=`) vì backend
  chưa có endpoint tìm bài viết hay nhóm.
- Chưa có nạp tiền / quản lý ngân sách quảng cáo (backend cũng chưa có nghiệp vụ).
- Chưa có test tự động.
