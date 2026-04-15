const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');

const app = express();

// Render сам подставит PORT
const PORT = process.env.PORT || 4000;

// Если фронт и backend будут на одном домене через nginx/proxy,
// CORS можно будет потом отключить.
// Пока оставим безопасный и простой вариант.
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Простейшая проверка, что сервер живой
app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'FitTrack API is running'
  });
});

// Healthcheck для Render / проверки вручную
app.get('/api/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'fittrack-backend',
    timestamp: new Date().toISOString()
  });
});

// Роуты авторизации
app.use('/api/auth', authRoutes);

// Обработка несуществующих API маршрутов
app.use('/api', (req, res) => {
  res.status(404).json({
    ok: false,
    error: 'API route not found'
  });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Server error:', err);

  res.status(err.status || 500).json({
    ok: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FitTrack backend running on port ${PORT}`);
});