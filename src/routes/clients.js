const express = require('express');
const { v7: uuidv7 } = require('uuid');
const { run, get, all } = require('../db');

const router = express.Router();

// Đăng ký client mới hoặc cập nhật thông tin
// POST /api/clients/register
router.post('/register', async (req, res) => {
  try {
    const { mainboard_seri, pancake_apikey, misa_account } = req.body;

    if (!mainboard_seri || !pancake_apikey) {
      return res.status(400).json({ error: 'Thiếu mainboard_seri hoặc pancake_apikey' });
    }

    // Tìm client đã tồn tại theo mainboard
    const existing = await get('SELECT * FROM clients WHERE mainboard_seri = ?', [mainboard_seri]);

    if (existing) {
      await run(`
        UPDATE clients
        SET pancake_apikey = ?, misa_account = ?, status = 1, last_seen_at = datetime('now')
        WHERE id = ?
      `, [pancake_apikey, misa_account || null, existing.id]);

      return res.json({ id: existing.id, message: 'Cập nhật client thành công' });
    }

    const id = uuidv7();

    await run(`
      INSERT INTO clients (id, mainboard_seri, pancake_apikey, misa_account, started_at, last_seen_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [id, mainboard_seri, pancake_apikey, misa_account || null]);

    res.status(201).json({ id, message: 'Đăng ký client thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Heartbeat: client báo còn sống
// POST /api/clients/:id/heartbeat
router.post('/:id/heartbeat', async (req, res) => {
  try {
    const { misa_account } = req.body || {};

    if (misa_account !== undefined) {
      await run(`
        UPDATE clients SET last_seen_at = datetime('now'), status = 1, misa_account = ?
        WHERE id = ?
      `, [misa_account || null, req.params.id]);
    } else {
      await run(`
        UPDATE clients SET last_seen_at = datetime('now'), status = 1
        WHERE id = ?
      `, [req.params.id]);
    }

    const client = await get('SELECT id FROM clients WHERE id = ?', [req.params.id]);
    if (!client) {
      return res.status(404).json({ error: 'Client không tồn tại' });
    }

    res.json({ message: 'OK' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Danh sách client
// GET /api/clients
router.get('/', async (req, res) => {
  try {
    const clients = await all('SELECT * FROM clients ORDER BY created_at DESC');
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chi tiết client
// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  try {
    const client = await get('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (!client) {
      return res.status(404).json({ error: 'Client không tồn tại' });
    }
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
