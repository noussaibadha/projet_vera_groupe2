const { supabase } = require('../database/supabaseClient');

const TABLE_NAME = 'reponses_sondage';
const singleChoiceColumns = [
  'age_tranche',
  'frequence_utilisation_rs',
  'temps_utilisation_rs',
  'frequence_fake',
  'exposition_croyance_fake',
  'utilisation_vera',
];
const multiChoiceColumns = ['contenu_rs', 'moyen_utilisation_vera', 'moyen_verification'];
const scaleColumns = ['satisfaction_vera', 'verification_info', 'danger_desinformation'];

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase client not configured.');
  }
}

function incrementCount(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

function computeSingleChoice(rows) {
  const result = {};
  singleChoiceColumns.forEach((column) => {
    const counts = {};
    rows.forEach((row) => {
      const value = row[column];
      if (value !== null && value !== undefined) {
        incrementCount(counts, value);
      }
    });
    result[column] = Object.entries(counts).map(([value, count]) => ({ value, count }));
  });
  return result;
}

function computeScales(rows) {
  const result = {};

  scaleColumns.forEach((column) => {
    const numbers = rows
      .map((row) => row[column])
      .filter((v) => typeof v === 'number' && !Number.isNaN(v));

    if (numbers.length === 0) {
      result[column] = { avg: null, min: null, max: null };
      return;
    }

    const sum = numbers.reduce((acc, n) => acc + n, 0);
    result[column] = {
      avg: sum / numbers.length,
      min: Math.min(...numbers),
      max: Math.max(...numbers),
    };
  });

  return result;
}

function flattenMultiChoice(rows, column) {
  const counts = {};

  rows.forEach((row) => {
    const value = row[column];
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (typeof entry === 'string') {
          incrementCount(counts, entry);
        } else if (entry && typeof entry === 'object') {
          incrementCount(counts, entry.value || entry.label);
        }
      });
    }
  });

  return counts;
}

function buildDailyCounts(rows, days = 7) {
  const today = new Date();
  const map = {};

  rows.forEach((row) => {
    const createdAt = row.created_at || row.createdAt;
    if (!createdAt) return;
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return;
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD UTC
    map[key] = (map[key] || 0) + 1;
  });

  const result = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map[key] || 0 });
  }
  return result;
}

async function getOverview() {
  ensureSupabase();

  const columns = [...singleChoiceColumns, ...multiChoiceColumns, ...scaleColumns, 'created_at'];
  const { data, error } = await supabase.from(TABLE_NAME).select(columns.join(', '));
  if (error) {
    throw new Error(`Failed to fetch rows: ${error.message}`);
  }

  const rows = data || [];
  const totalResponses = rows.length;
  const singleChoice = computeSingleChoice(rows);
  const scales = computeScales(rows);
  const multiChoice = {};

  multiChoiceColumns.forEach((column) => {
    multiChoice[column] = flattenMultiChoice(rows, column);
  });

  return {
    totalResponses,
    singleChoice,
    scales,
    multiChoice,
    dailyCounts: buildDailyCounts(rows, 7),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getOverview,
};
