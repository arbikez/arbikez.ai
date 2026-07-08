-- ArBikez Price Analysis Schema
-- Run this in the Supabase SQL editor (or as a migration)

-- Every bike ArBikez has ever sold. This is your real "market data" —
-- there's no reliable third-party API for used-bike resale value in India,
-- so this table IS the pricing engine's source of truth. Populate it going
-- forward (every sale gets logged here) and backfill past sales if you have records.
create table if not exists sold_bikes (
  id uuid primary key default gen_random_uuid(),

  -- Identity of the bike
  make text not null,              -- e.g. 'Honda'
  model text not null,              -- e.g. 'Activa 6G'
  variant text,                     -- e.g. 'DLX', 'STD'
  year_of_manufacture int not null,

  -- Condition / usage signals that affect price
  km_driven int,
  owners int default 1,
  condition_grade text check (condition_grade in ('excellent','good','fair','poor')),
  registration_state text,          -- e.g. 'TN' — resale value varies by RTO state

  -- Money
  ex_showroom_price_new numeric,    -- what it cost new, if known
  purchase_price numeric,           -- what ArBikez bought it for (optional)
  listed_price numeric not null,    -- what it was listed for
  sold_price numeric not null,      -- what it actually sold for

  -- Timing
  listed_at timestamptz not null,
  sold_at timestamptz not null,
  days_to_sell int generated always as (
    extract(day from (sold_at - listed_at))
  ) stored,

  -- Traceability
  blogger_post_id text,
  olx_url text,
  created_at timestamptz default now()
);

create index if not exists idx_sold_bikes_make_model on sold_bikes (make, model);
create index if not exists idx_sold_bikes_year on sold_bikes (year_of_manufacture);

-- Log every price estimate the AI generates, so you can later check
-- estimate vs actual sold_price and improve the model over time.
create table if not exists price_estimates (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  year_of_manufacture int,
  km_driven int,
  condition_grade text,

  estimated_value numeric not null,
  recommended_listing_price numeric not null,
  expected_sale_days_min int,
  expected_sale_days_max int,
  comparable_count int not null,    -- how many sold_bikes rows the estimate was based on
  confidence text check (confidence in ('high','medium','low')),

  requested_by text,                -- admin user id/email
  created_at timestamptz default now()
);
