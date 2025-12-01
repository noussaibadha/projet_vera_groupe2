require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const authRoutes = require('./routes/authRoutes');
const statsRoutes = require('./routes/statsRoutes');

const app = express();

app.use(cors());
app.use(express.json());

let supabase = null;
let supabaseSource = 'env';

try {
  const configClient = require('./database/supabaseClient');
  supabase = configClient.supabase || null;
  supabaseSource = 'config';
} catch (err) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  supabase =
    supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
  supabaseSource = 'env';
}

app.get('/', (_req, res) => {
  res.status(200).json({
    message: 'vera-back is running',
    endpoints: [
      '/health',
      '/echo (POST)',
      '/supabase-check',
      '/api/auth/register (POST)',
      '/api/auth/login (POST)',
      '/api/stats/overview (GET)',
      '/api/stats/stream (GET - SSE)',
    ],
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

app.post('/echo', (req, res) => {
  res.status(200).json({
    received: req.body || null,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/stats', statsRoutes);

app.get('/supabase-check', (_req, res) => {
  if (!supabase) {
    return res.status(200).json({
      configured: false,
      message:
        supabaseSource === 'config'
          ? 'Supabase client config missing or invalid.'
          : 'Set SUPABASE_URL and SUPABASE_ANON_KEY to enable Supabase client.',
      source: supabaseSource,
    });
  }

  return res.status(200).json({
    configured: true,
    message: 'Supabase client initialized (no network call attempted).',
    source: supabaseSource,
  });
});

module.exports = app;
