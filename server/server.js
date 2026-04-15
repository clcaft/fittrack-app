const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'FitTrack API is running'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'fittrack-backend',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({
    ok: false,
    error: 'API route not found'
  });
});

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