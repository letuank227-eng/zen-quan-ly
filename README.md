# ZEN - SOCIAL CRM ĐA PAGE (MULTI-PAGE SOCIAL CRM)

Nền tảng Social CRM đa Facebook Page chuyên nghiệp, hỗ trợ giao tiếp **HAI CHIỀU** (Messenger & Comment), quản lý bài viết, khách hàng CRM, quảng cáo Meta Ads, thống kê Page và phân quyền nhân viên trên một giao diện hợp nhất duy nhất.

---

## 🎨 THIẾT KẾ & TƯƠNG THÍCH ĐA NỀN TẢNG

1. **Màu sắc chủ đạo**: **Trắng & Xanh lá (Emerald Green)** hiện đại, phong cách SaaS chuyên nghiệp, độ tương phản cao, giao diện thoáng đãng, dễ nhìn.
2. **Hỗ trợ tối ưu cả Máy tính & Điện thoại di động (Responsive 100%)**:
   - **Trên Máy tính (Desktop/Laptop)**: Thanh Sidebar điều hướng bên trái, chia 2-3 cột màn hình (danh sách hội thoại, khung chat, hồ sơ khách hàng, chi tiết bình luận).
   - **Trên Điện thoại (Mobile)**:
     - Thanh điều hướng thông minh phía dưới (Bottom Navigation Bar) thao tác bằng 1 ngón tay cái.
     - Khi bấm vào hội thoại chat, tự động mở toàn màn hình với nút "Quay lại" (Back) tiện lợi.
     - Drawer trượt hiển thị thông tin khách hàng, gắn thẻ và ghi chú.
     - Chống auto-zoom trên iOS/Android khi gõ chữ.
     - Hỗ trợ mở trực tiếp trên điện thoại qua mạng Wi-Fi nội bộ (`http://<IP-MÁY-TÍNH>:3000`).

---

## 🔒 NGUYÊN TẮC BẢO MẬT & DỮ LIỆU THẬT

- **KHÔNG hardcode tên Page hay dữ liệu giả**: Toàn bộ tên Page, bài viết, tin nhắn và bình luận được lấy động 100% từ Meta Graph API sau khi người dùng kết nối OAuth.
- **Trạng thái khi chưa kết nối**: Hiển thị thông báo trạng thái thật và nút "+ Kết nối Meta", không hiển thị dữ liệu ảo.
- **Mã hóa AES-256-GCM**: Toàn bộ User Long-Lived Access Tokens và Page Access Tokens được mã hóa bảo mật trước khi lưu vào Database và **TUYỆT ĐỐI KHÔNG** gửi token ra Frontend.
- **Giao tiếp hai chiều có kiểm tra**: Chỉ báo gửi tin nhắn hoặc bình luận thành công khi Meta Graph API trả về xác nhận thành công.
- **KHÔNG sử dụng AI trong phiên bản này**.

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT & KHỞI CHẠY NHANH

### 1. Cài đặt các thư viện (đã cài đặt sẵn)
```powershell
npm run install:all
```

### 2. Khởi chạy đồng thời Backend và Frontend
Tại thư mục gốc `c:\code\ZEN Quản lý`:
```powershell
npm run dev
```

- **Frontend (Giao diện người dùng)**:
  - Máy tính: [http://localhost:3000](http://localhost:3000)
  - Điện thoại (trong cùng mạng Wi-Fi): `http://<IP-LAN>:3000` (ví dụ: `http://192.168.1.32:3000`)
- **Backend API**: [http://localhost:5000](http://localhost:5000)
- **Meta Webhook URL**: [http://localhost:5000/api/webhook/meta](http://localhost:5000/api/webhook/meta)

### 3. Tài khoản Quản trị viên (Admin) mặc định
- **Email**: `admin@zen.vn`
- **Mật khẩu**: `Admin@123456`
*(Hoặc bạn có thể bấm "Đăng ký" để tạo doanh nghiệp mới với tư cách Admin)*

---

## ⚙️ HƯỚNG DẪN CẤU HÌNH META / FACEBOOK DEVELOPER

Để kết nối và nhận tin nhắn/bình luận theo thời gian thực từ Meta:

1. Truy cập [Meta for Developers](https://developers.facebook.com/) và tạo một ứng dụng loại **Business**.
2. Thêm sản phẩm **Facebook Login for Business** và **Webhooks**.
3. Trong mục **Facebook Login > Settings > Valid OAuth Redirect URIs**, nhập:
   ```text
   http://localhost:5000/api/meta/oauth/callback
   ```
4. Điền `META_APP_ID` và `META_APP_SECRET` vào file `server/.env`.
5. Trong mục **Webhooks > Page**:
   - **Callback URL**: `http://<YOUR-DOMAIN-HOẶC-NGROK>/api/webhook/meta`
   - **Verify Token**: `zen_crm_verify_token_secure_2026`
   - Đăng ký (Subscribe) các trường: `messages`, `messaging_postbacks`, `message_reads`, `feed`.
6. Trên ứng dụng ZEN CRM, vào mục **Cài đặt > Kết nối Meta / Facebook**, bấm **+ Kết nối Meta** và tích chọn các Page muốn quản trị!

---

## 📁 CẤU TRÚC DỰ ÁN

```text
c:\code\ZEN Quản lý\
├── package.json               # Root scripts (chạy đồng thời server và client)
├── README.md                  # Hướng dẫn chi tiết
├── server\                    # Backend Express + TypeScript + Prisma + Socket.IO
│   ├── .env                   # Cấu hình biến môi trường và khóa mã hóa AES-256
│   ├── prisma\
│   │   ├── schema.prisma      # 22 bảng quan hệ chuẩn Social CRM đa Page
│   │   ├── seed.ts            # Khởi tạo tài khoản Admin ban đầu
│   │   └── dev.db             # Cơ sở dữ liệu SQLite
│   └── src\
│       ├── controllers\       # Auth, Meta, Pages, Inbox, Messenger, Comments, Posts, CRM, Ads, Analytics, Staff, Webhook
│       ├── middleware\        # Auth JWT, RBAC phân quyền, kiểm tra quyền Page
│       ├── services\          # Meta Graph API v19.0, Socket.IO Realtime Gateway, AES-256 Crypto
│       ├── utils\             # Logger an toàn (mask token), xử lý chữ ký HMAC-SHA256
│       └── index.ts           # Entrypoint backend
└── client\                    # Frontend React 18 + Vite + Tailwind CSS (White & Green)
    ├── index.html             # Responsive viewport cho smartphone và desktop
    ├── tailwind.config.js     # Bảng màu Trắng & Xanh lá (Brand Emerald/Green)
    └── src\
        ├── components\        # Layout, Navbar, Sidebar, PageSelector, MobileNav, EmptyState
        ├── context\           # AuthContext, PageContext, NotificationContext
        └── pages\             # Dashboard, Inbox, Messenger, Comments, Posts, Customers, Ads, Analytics, Staff, Settings
```

---

## 🏆 CÁC TÍNH NĂNG ĐÃ TRIỂN KHAI HOÀN CHỈNH

1. **Đăng ký / Đăng nhập / Phân quyền**: Đăng ký doanh nghiệp mới, đăng nhập, bảo vệ session, đổi mật khẩu, phân quyền 3 cấp (ADMIN, MANAGER, STAFF).
2. **Kết nối Meta OAuth**: Xác thực OAuth v19.0, tự động đổi sang Long-Lived Token (60 ngày), mã hóa AES-256-GCM, tự động lấy danh sách Page người dùng có quyền quản lý, cho phép tích chọn Page kết nối.
3. **Bộ chọn Page toàn cục (Page Selector)**: Lọc dữ liệu theo "Tất cả Page" hoặc theo từng Page cụ thể.
4. **Hộp thư tập trung (Unified Inbox)**: Gom Messenger và Comment về một giao diện duy nhất, lọc theo trạng thái (Chưa xử lý, Đang xử lý, Đã xử lý), theo kênh, nhân viên, thời gian.
5. **Giao tiếp Messenger hai chiều**:
   - Nhận tin nhắn khách hàng qua Webhook Meta và đẩy lên giao diện thời gian thực qua WebSocket (không cần F5).
   - Nhân viên trả lời trực tiếp từ ứng dụng -> gửi qua Meta Graph API -> đến Messenger của khách hàng.
   - Báo lỗi minh bạch nếu token hết hạn hoặc vi phạm chính sách Meta.
6. **Bình luận (Comments)**:
   - Đồng bộ danh sách bình luận trên các bài viết.
   - Trả lời bình luận trực tiếp lên Facebook qua API.
   - Nhắn tin riêng Messenger từ bình luận (`Comment -> Messenger`) theo cơ chế private replies của Meta.
7. **Quản lý bài viết (Posts)**: Đồng bộ danh sách bài đăng từ Page, hiển thị số lượt thích, bình luận, chia sẻ, mở xem và trả lời bình luận bài viết.
8. **CRM Khách hàng**: Tự động lưu hồ sơ khách hàng khi tương tác, quản lý Thẻ tag màu sắc (Tags), Ghi chú chăm sóc khách hàng (Notes).
9. **Quản lý Quảng cáo (Meta Ads)**: Kết nối tài khoản quảng cáo, cấu trúc Campaign -> Ad Set -> Ad, chỉ số Spend, Reach, Impressions, CTR, CPC, CPM.
10. **Thống kê Page (Page Insights)**: Người theo dõi, lượt tiếp cận, tương tác trang, số lượt xem trang.
11. **Thông báo Realtime**: Đẩy thông báo khi có tin nhắn mới, bình luận mới hoặc hội thoại được giao.
