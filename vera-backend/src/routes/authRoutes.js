const express = require('express');
const { supabase } = require('../database/supabaseClient');

const router = express.Router();

// ---------- Inscription ---------- //
router.post('/register', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not configured.' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({
    message: 'Sign-up successful. Check your email if confirmation is required.',
    user: data.user,
  });
});

// ---------- Connexion ---------- //
router.post('/login', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not configured.' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ error: error.message || 'Invalid credentials.' });
  }

  return res.status(200).json({
    message: 'Login successful',
    session: data.session,
  });
});

module.exports = router;