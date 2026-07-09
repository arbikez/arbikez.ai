import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEPRECIATION_BY_AGE_YEARS = {
  0: 0.90, 1: 0.82, 2: 0.74, 3: 0.67, 4: 0.60,
  5: 0.54, 6: 0.48, 7: 0.43, 8: 0.38, 9: 0.34,
};
const MAX_AGE_FACTOR = 0.28;

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
    condition,
    exShowroomNew,
    requestedBy,
  } = req.body || {};

  if (!make || !model || !year) {
    return res.status(400).json({ error: 'make, model, and year are required' });
  }

  try {
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

    let adjusted = estimatedValue;
    if (kmDriven) {
      if (kmDriven > 40000) adjusted *= 0.93;
      else if (kmDriven > 25000) adjusted *= 0.97;
    }
    if (condition === 'excellent') adjusted *= 1.05;
    if (condition === 'poor') adjusted *= 0.88;

    adjusted = Math.round(adjusted);
    const recommendedListingPrice = Math.round(adjusted * 0.995);

    const result = {
      make,
      model,
      year,
      estimatedValue: adjusted,
      recommendedListingPrice,
      expectedSaleDays: { min: expectedSaleDaysMin, max: expectedSaleDaysMax },
      comparableCount: comparables?.length ?? 0,
      confidence,
    };

    await supabase.from('price_estimates').insert({
      make,
      model,
      year_of_manufacture: year,
      km_driven: kmDriven ?? null,
      condition_grade: condition ?? null,
      estimated_value: adjusted,
      recommended_listing_price: recommendedListingPrice,
      expected_sale_days_min: expectedSaleDaysMin,
      expected_sale_days_max: expectedSaleDaysMax,
      comparable_count: comparables?.length ?? 0,
      confidence,
      requested_by: requestedBy ?? null,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('price-analysis error:', err);
    return res.status(500).json({ error: 'Internal error estimating price' });
  }
}
