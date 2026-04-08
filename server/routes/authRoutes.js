const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        ok: false,
        error: 'Заполните все поля'
      });
    }

    const existing = await pool.query(
      'select id from users where email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        ok: false,
        error: 'Пользователь уже существует'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `insert into users (name, email, password_hash)
       values ($1, $2, $3)
       returning id, name, email`,
      [name, email, passwordHash]
    );

    res.json({
      ok: true,
      user: result.rows[0]
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({
      ok: false,
      error: 'Ошибка сервера'
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error: 'Введите email и пароль'
      });
    }

    const result = await pool.query(
      'select * from users where email = $1',
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({
        ok: false,
        error: 'Неверный email или пароль'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({
        ok: false,
        error: 'Неверный email или пароль'
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      ok: false,
      error: 'Ошибка сервера'
    });
  }
});

module.exports = router;