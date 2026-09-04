const express = require('express');
const { run, get, all } = require('../db');

const router = express.Router();

// Tạo lệnh cho client
// POST /api/commands
// Body: { client_id, action, payload }
router.post('/', async (req, res) => {
  try {
    const { client_id, action, payload } = req.body;

    if (!client_id || !action) {
      return res.status(400).json({ error: 'Thiếu client_id hoặc action' });
    }

    const client = await get('SELECT id FROM clients WHERE id = ?', [client_id]);
    if (!client) {
      return res.status(404).json({ error: 'Client không tồn tại' });
    }

    const result = await run(`
      INSERT INTO commands (client_id, action, payload)
      VALUES (?, ?, ?)
    `, [client_id, action, payload ? JSON.stringify(payload) : null]);

    res.status(201).json({
      id: result.lastID,
      client_id,
      action,
      status: 0,
      message: 'Tạo lệnh thành công'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Client poll lệnh mới (pending)
// GET /api/commands/poll/:client_id
router.get('/poll/:client_id', async (req, res) => {
  try {
    const commands = await all(`
      SELECT id, action, payload, created_at
      FROM commands
      WHERE client_id = ? AND status = 0
      ORDER BY created_at ASC
    `, [req.params.client_id]);

    if (commands.length > 0) {
      const ids = commands.map(c => c.id);
      const placeholders = ids.map(() => '?').join(',');
      await run(`
        UPDATE commands SET status = 1, delivered_at = datetime('now')
        WHERE id IN (${placeholders})
      `, ids);
    }

    res.json({
      commands: commands.map(c => ({
        id: c.id,
        action: c.action,
        payload: c.payload ? JSON.parse(c.payload) : null,
        created_at: c.created_at
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Client xác nhận đã xử lý lệnh
// POST /api/commands/:id/ack
// Body: { success: true/false, message: "..." }
router.post('/:id/ack', async (req, res) => {
  try {
    const { success } = req.body;
    const status = success ? 2 : 3;

    const result = await run(`
      UPDATE commands SET status = ?, acked_at = datetime('now')
      WHERE id = ? AND status = 1
    `, [status, req.params.id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Lệnh không tồn tại hoặc chưa được gửi' });
    }

    // Nếu ack lệnh shutdown thành công → set client offline luôn
    if (success) {
      const cmd = await get('SELECT client_id, action FROM commands WHERE id = ?', [req.params.id]);
      if (cmd && cmd.action === 'shutdown') {
        await run('UPDATE clients SET status = 0 WHERE id = ?', [cmd.client_id]);
      }
    }

    res.json({ message: 'Xác nhận thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lịch sử lệnh của 1 client
// GET /api/commands/client/:client_id
router.get('/client/:client_id', async (req, res) => {
  try {
    const commands = await all(`
      SELECT c.*, cl.misa_account, cl.mainboard_seri
      FROM commands c
      LEFT JOIN clients cl ON c.client_id = cl.id
      WHERE c.client_id = ?
      ORDER BY c.created_at DESC
      LIMIT 50
    `, [req.params.client_id]);

    res.json(commands.map(c => ({
      ...c,
      payload: c.payload ? JSON.parse(c.payload) : null
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Danh sách tất cả lệnh
// GET /api/commands?status=0
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT c.*, cl.misa_account, cl.mainboard_seri
      FROM commands c
      LEFT JOIN clients cl ON c.client_id = cl.id
    `;
    const params = [];

    if (status !== undefined) {
      sql += ' WHERE c.status = ?';
      params.push(parseInt(status));
    }

    sql += ' ORDER BY c.created_at DESC LIMIT 100';

    const commands = await all(sql, params);
    res.json(commands.map(c => ({
      ...c,
      payload: c.payload ? JSON.parse(c.payload) : null
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xoá 1 lệnh
// DELETE /api/commands/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await run('DELETE FROM commands WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Lệnh không tồn tại' });
    }
    res.json({ message: 'Đã xoá lệnh' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xoá nhiều lệnh theo điều kiện
// POST /api/commands/cleanup
// Body: { status: [2, 3] } — xoá lệnh đã xử lý hoặc thất bại
router.post('/cleanup', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !Array.isArray(status) || !status.length) {
      return res.status(400).json({ error: 'Cần truyền status là mảng (vd: [2, 3])' });
    }

    const placeholders = status.map(() => '?').join(',');
    const result = await run(`DELETE FROM commands WHERE status IN (${placeholders})`, status);

    res.json({ message: `Đã xoá ${result.changes} lệnh`, deleted: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
