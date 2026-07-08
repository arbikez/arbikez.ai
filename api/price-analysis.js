// /api/price-analysis.js
// Vercel serverless function: POST { make, model, year, kmDriven?, condition?, exShowroomNew? }
// Returns a resale estimate built from ArBikez's own sold_bikes history,
// falling back to a depreciation curve when there isn't enough comparable data yet.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // server-side only, never expose to client
);

// Rough year-based depreciation used ONLY when we have no comparable sales yet.
// Tune these once you have real data — they're a placeholder starting point.
const DEPRECIATION_BY_AGE_YEARS = {
  0: 0.90, 1: 0.82, 2: 0.74, 3: 0.67, 4: 0.60,
  5: 0.54, 6: 0.48, 7: 0.43, 8: 0.38, 9: 0.34,
};
const MAX_AGE_FACTOR = 0.28; // floor for anything older than the table above

function depreciationFallback(exShowroomNew, ageYears) {
  const factor = DEPRECIATION_BY_AGE_YEARS[ageYears] ?? MAX_AGE_FACTOR;
  return Math.round(exShowroomNew * factor);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    make,
    model,
    year,
    kmDriven,
    condition, // 'excellent' | 'good' | 'fair' | 'poor'
    exShowroomNew, // optional, used only for fallback estimate
    requestedBy,
  } = req.body || {};

  if (!make || !model || !year) {
    return res.status(400).json({ error: 'make, model, and year are required' });
  }

  try {
    // Pull comparable sold bikes: same make/model, similar year (+/- 2 years)
    const { data: comparables, error } = await supabase
      .from('sold_bikes')
      .select('sold_price, km_driven, owners, condition_grade, year_of_manufacture, days_to_sell')
      .ilike('make', make)
      .ilike('model', model)
      .gte('year_of_manufacture', year - 2)
      .lte('year_of_manufacture', year + 2);

    if (error) throw error;

    let estimatedValue, confidence, expectedSaleDaysMin, expectedSaleDaysMax;

    if (comparables && comparables.length >= 3) {
      // Enough real data — average sold price
      const prices = comparables.map((c) => c.sold_price);
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

      const days = comparables
        .map((c) => c.days_to_sell)
        .filter((d) => d != null)
        .sort((a, b) => a - b);

      estimatedValue = Math.round(avg);
      confidence = comparables.length >= 8 ? 'high' : 'medium';
      expectedSaleDaysMin = days.length ? days[0] : null;
      expectedSaleDaysMax = days.length ? days[days.length - 1] : null;
    } else if (exShowroomNew) {
      // Not enough history yet — fall back to depreciation curve
      const ageYears = new Date().getFullYear() - year;
      estimatedValue = depreciationFallback(exShowroomNew, ageYears);
      confidence = 'low';
      expectedSaleDaysMin = 10;
      expectedSaleDaysMax = 20;
    } else {
      return res.status(422).json({
        error: 'Not enough sales history for this model and no exShowroomNew price provided to estimate from.',
        comparableCount: comparables?.length ?? 0,
      });
    }

    // Adjust for km driven and condition if provided
    let adjusted = estimatedValue;
    if (kmDriven) {
      if (kmDriven > 40
