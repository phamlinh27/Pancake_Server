const express = require('express');
const path = require('path');
const fs = require('fs');
const { init, run } = require('./db');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const app = express();
app.use(express.json());

// Serve static files (admin UI)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes
app.use('/api/clients', require('./routes/clients'));
app.use('/api/commands', require('./routes/commands'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Lỗi server nội bộ' });
});

const PORT = process.env.PORT || 3000;

init().then(() => {
  // Auto-offline client khi không heartbeat quá 60 giây
  setInterval(async () => {
    try {
      await run(`
        UPDATE clients SET status = 0
        WHERE status = 1
          AND last_seen_at < datetime('now', '-60 seconds')
      `);
    } catch (err) {
      console.error('Lỗi auto-offline:', err);
    }
  }, 30000);

  app.listen(PORT, () => {
    console.log(`Server chạy tại http://localhost:${PORT}`);
    console.log('');
    console.log('API:');
    console.log('  POST /api/clients/register       - Đăng ký client');
    console.log('  POST /api/clients/:id/heartbeat   - Heartbeat');
    console.log('  GET  /api/clients                - Danh sách client');
    console.log('  GET  /api/clients/:id            - Chi tiết client');
    console.log('  POST /api/commands               - Tạo lệnh');
    console.log('  GET  /api/commands/poll/:id      - Client poll lệnh mới');
    console.log('  POST /api/commands/:id/ack       - Xác nhận lệnh đã xử lý');
    console.log('  GET  /api/commands/client/:id    - Lịch sử lệnh theo client');
    console.log('  GET  /api/commands               - Danh sách tất cả lệnh');
    console.log('  GET  /api/health                 - Health check');
  });
}).catch(err => {
  console.error('Lỗi khởi tạo database:', err);
  process.exit(1);
});
