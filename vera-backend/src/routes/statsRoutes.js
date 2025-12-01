const express = require('express');
const { supabase } = require('../database/supabaseClient');
const { getOverview } = require('../services/statsService');

const router = express.Router();

if (!supabase) {
  console.warn('Supabase client not configured; stats routes will return 500.');
}

const sseClients = new Set();
let lastSnapshot = null;
let recomputeTimeout = null;
let channelInitialized = false;

function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => {
    res.write(payload);
  });
}

async function refreshSnapshot() {
  try {
    const snapshot = await getOverview();
    lastSnapshot = snapshot;
    broadcast(snapshot);
  } catch (err) {
    console.error('Failed to refresh stats snapshot:', err.message);
  }
}

function scheduleRefresh(delayMs = 400) {
  if (recomputeTimeout) return;
  recomputeTimeout = setTimeout(async () => {
    recomputeTimeout = null;
    await refreshSnapshot();
  }, delayMs);
}

function initRealtimeChannel() {
  if (channelInitialized || !supabase) return;

  const channel = supabase.channel('reponses_sondage_changes');

  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'reponses_sondage' },
    () => scheduleRefresh(),
  );

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      channelInitialized = true;
      console.log('Realtime subscription active for reponses_sondage.');
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      channelInitialized = false;
      console.error('Realtime channel error, attempting to resubscribe...');
      setTimeout(initRealtimeChannel, 1000);
    }
  });
}

router.get('/overview', async (_req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not configured.' });
  }

  try {
    const overview = await getOverview();
    lastSnapshot = overview;
    return res.status(200).json(overview);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to compute stats.' });
  }
});

router.get('/stream', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not configured.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);

  if (lastSnapshot) {
    res.write(`data: ${JSON.stringify(lastSnapshot)}\n\n`);
  } else {
    refreshSnapshot();
  }

  initRealtimeChannel();

  req.on('close', () => {
    sseClients.delete(res);
    res.end();
  });
});

module.exports = router;
