# CLAUDE.md — Pancake_Server

## Tổng quan

Server Node.js điều khiển các PanCake Tool (WinForms C#) qua Polling API. Tool chạy trên máy khách, định kỳ gọi lên server để báo trạng thái và nhận lệnh điều khiển.

**Công nghệ:** Node.js, Express, SQLite (sqlite3), HTML thuần cho admin UI.

## Build & Run

```bash
# Chạy local
npm start                    # port 3000
PORT=3105 npm start          # port tuỳ chọn

# Docker (port 3105)
docker-build.bat             # Windows
bash docker-build.sh         # Linux/Mac
```

## Cấu trúc

```
src/
├── index.js          # Entry point, Express app, auto-offline interval
├── db.js             # SQLite init + promise wrappers (run/get/all)
└── routes/
    ├── clients.js    # API quản lý client
    └── commands.js   # API lệnh điều khiển

public/
└── index.html        # Admin UI (HTML + vanilla JS, auto-refresh 10s)

data/
└── pancake.db        # SQLite database (tự tạo)
```

## Database (SQLite)

### Bảng `clients`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | TEXT PK | GUID v7, sinh khi client đăng ký lần đầu |
| `mainboard_seri` | TEXT UNIQUE | MachineGuid từ registry Windows |
| `pancake_apikey` | TEXT | API key Pancake của tool |
| `misa_account` | TEXT | TK kinh doanh MISA (vd: palinh) |
| `started_at` | TEXT | Thời điểm tool khởi động |
| `last_seen_at` | TEXT | Lần heartbeat gần nhất |
| `status` | INTEGER | 1=online, 0=offline |
| `created_at` | TEXT | Thời điểm đăng ký lần đầu |

### Bảng `commands`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `client_id` | TEXT FK | → clients.id |
| `action` | TEXT | restart, shutdown, stop, start, reload_config, update_config |
| `payload` | TEXT | JSON string (chỉ dùng cho update_config) |
| `status` | INTEGER | 0=pending, 1=delivered, 2=acknowledged, 3=failed |
| `created_at` | TEXT | Thời điểm tạo lệnh |
| `delivered_at` | TEXT | Thời điểm gửi cho client |
| `acked_at` | TEXT | Thời điểm client xác nhận |

## API

### Clients

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/clients/register` | Đăng ký/cập nhật client. Body: `{mainboard_seri, pancake_apikey, misa_account}` |
| POST | `/api/clients/:id/heartbeat` | Heartbeat. Body: `{misa_account}` (optional) |
| GET | `/api/clients` | Danh sách tất cả client |
| GET | `/api/clients/:id` | Chi tiết 1 client |

### Commands

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/commands` | Tạo lệnh. Body: `{client_id, action, payload}` |
| GET | `/api/commands/poll/:client_id` | Client poll lệnh pending (auto mark delivered) |
| POST | `/api/commands/:id/ack` | Client xác nhận. Body: `{success: bool, message}` |
| GET | `/api/commands/client/:client_id` | Lịch sử lệnh theo client (50 gần nhất) |
| GET | `/api/commands` | Tất cả lệnh, filter `?status=0` |

## Luồng hoạt động

```
Tool (C#)                           Server
   |                                   |
   |-- POST /register -------------->  | Tạo/cập nhật client, trả về id
   |                                   |
   |  Mỗi 30 giây:                     |
   |-- POST /heartbeat ------------->  | Cập nhật last_seen_at, misa_account
   |-- GET /commands/poll/:id ------>  | Trả về lệnh pending, mark delivered
   |                                   |
   |  Xử lý lệnh xong:                 |
   |-- POST /commands/:id/ack ------>  | Mark acknowledged/failed
   |                                   | Nếu action=shutdown → set client offline
   |                                   |
   |  Auto-offline:                     |
   |                                   | Interval 30s: client không heartbeat
   |                                   | quá 60s → status = 0 (offline)
```

## Lệnh hỗ trợ

| action | payload | Mô tả |
|---|---|---|
| `restart` | null | Khởi động lại tool |
| `shutdown` | null | Tắt hẳn tool → server tự set offline |
| `stop` | null | Tắt dịch vụ monitoring |
| `start` | null | Bật dịch vụ monitoring |
| `reload_config` | null | Đọc lại config.local.json |
| `update_config` | object | Ghi đè config.local.json bằng payload JSON |

## Admin UI

Mở `http://localhost:{PORT}` trong browser:

- Bảng **Clients**: trạng thái, TK MISA, mainboard seri, API key, thời gian. Lọc theo TK MISA. Nút "Gửi lệnh" (disable khi offline).
- Bảng **Lệnh điều khiển**: lọc theo client, hiện trạng thái lệnh.
- **Modal tạo lệnh**: chọn client + action, nhập JSON payload khi `update_config`.
- Auto-refresh mỗi 10 giây.

## Docker

- Image: `node:20-alpine` + build tools cho sqlite3 (xoá sau install)
- Port: container 3000 → host 3105
- Volume: `pancake-server-data:/app/data` — giữ SQLite khi rebuild
- Restart policy: `unless-stopped`

## Quy ước

- Comment, log, UI bằng tiếng Việt.
- Tất cả API trả về JSON.
- Client dedup theo `mainboard_seri` (UNIQUE).
- Migration: dùng `ALTER TABLE ... ADD COLUMN` trong try/catch khi cần thêm cột mới vào bảng có sẵn.
- Không commit `data/` hoặc `node_modules/`.
