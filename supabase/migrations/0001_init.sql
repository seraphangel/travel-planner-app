create table if not exists destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  city text not null,
  country text not null,
  region text,
  created_at timestamptz not null default now()
);
alter table destinations enable row level security;
drop policy if exists "destinations_v1_read" on destinations;
create policy "destinations_v1_read" on destinations for select using (true);
drop policy if exists "destinations_v1_write" on destinations;
create policy "destinations_v1_write" on destinations for all using (true) with check (true);

create table if not exists travel_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  destination_id uuid references destinations(id),
  title text not null,
  origin_country text not null,
  trip_purpose text not null default 'holiday',
  budget_range text,
  start_date date,
  end_date date,
  duration_days int,
  status text not null default 'draft',
  is_unlocked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table travel_plans enable row level security;
drop policy if exists "travel_plans_v1_read" on travel_plans;
create policy "travel_plans_v1_read" on travel_plans for select using (true);
drop policy if exists "travel_plans_v1_write" on travel_plans;
create policy "travel_plans_v1_write" on travel_plans for all using (true) with check (true);

create table if not exists plan_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  travel_plan_id uuid references travel_plans(id),
  category text not null,
  name text not null,
  description text,
  location text,
  price_range text,
  rating numeric,
  recommendation_value text,
  recommendation_source text,
  recommendation_confidence numeric,
  recommendation_review_status text default 'unreviewed',
  created_at timestamptz not null default now()
);
alter table plan_recommendations enable row level security;
drop policy if exists "plan_recommendations_v1_read" on plan_recommendations;
create policy "plan_recommendations_v1_read" on plan_recommendations for select using (true);
drop policy if exists "plan_recommendations_v1_write" on plan_recommendations;
create policy "plan_recommendations_v1_write" on plan_recommendations for all using (true) with check (true);

create table if not exists itinerary_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  travel_plan_id uuid references travel_plans(id),
  day_number int not null,
  day_date date,
  morning_activity text,
  afternoon_activity text,
  evening_activity text,
  meals text,
  transport_notes text,
  notes text,
  itinerary_value text,
  itinerary_source text,
  itinerary_confidence numeric,
  itinerary_review_status text default 'unreviewed',
  created_at timestamptz not null default now()
);
alter table itinerary_days enable row level security;
drop policy if exists "itinerary_days_v1_read" on itinerary_days;
create policy "itinerary_days_v1_read" on itinerary_days for select using (true);
drop policy if exists "itinerary_days_v1_write" on itinerary_days;
create policy "itinerary_days_v1_write" on itinerary_days for all using (true) with check (true);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  travel_plan_id uuid references travel_plans(id),
  stripe_session_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_type text not null default 'one_time',
  status text not null default 'pending',
  amount_cents int,
  currency text default 'usd',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table subscriptions enable row level security;
drop policy if exists "subscriptions_v1_read" on subscriptions;
create policy "subscriptions_v1_read" on subscriptions for select using (true);
drop policy if exists "subscriptions_v1_write" on subscriptions;
create policy "subscriptions_v1_write" on subscriptions for all using (true) with check (true);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  detail jsonb,
  risk_level text default 'low',
  created_at timestamptz not null default now()
);
alter table audit_logs enable row level security;
drop policy if exists "audit_logs_v1_read" on audit_logs;
create policy "audit_logs_v1_read" on audit_logs for select using (true);
drop policy if exists "audit_logs_v1_write" on audit_logs;
create policy "audit_logs_v1_write" on audit_logs for all using (true) with check (true);

insert into destinations (id, city, country, region) values
  ('a1000000-0000-0000-0000-000000000001', 'Tokyo', 'Japan', 'Asia'),
  ('a1000000-0000-0000-0000-000000000002', 'Paris', 'France', 'Europe'),
  ('a1000000-0000-0000-0000-000000000003', 'Nairobi', 'Kenya', 'Africa');

insert into travel_plans (id, destination_id, title, origin_country, trip_purpose, budget_range, start_date, end_date, duration_days, status, is_unlocked) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '7 Days in Tokyo', 'United Kingdom', 'holiday', '$2000-$3500', '2025-09-01', '2025-09-07', 7, 'published', true),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'Paris Business Trip', 'United States', 'business', '$1500-$2500', '2025-10-10', '2025-10-14', 5, 'published', true),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'Nairobi & Safari Adventure', 'Australia', 'holiday', '$3000-$5000', '2025-11-01', '2025-11-10', 10, 'published', true);

insert into plan_recommendations (travel_plan_id, category, name, description, price_range, recommendation_value, recommendation_source, recommendation_confidence, recommendation_review_status) values
  ('b1000000-0000-0000-0000-000000000001', 'places_to_visit', 'Senso-ji Temple', 'Tokyo oldest temple in Asakusa, stunning architecture and street market.', 'Free', 'Must-visit cultural landmark', 'openai-gpt-4o', 0.92, 'unreviewed'),
  ('b1000000-0000-0000-0000-000000000001', 'places_to_eat', 'Ichiran Ramen Shibuya', 'Solo-booth ramen experience, famous for rich tonkotsu broth.', '$', 'Top-rated ramen chain', 'openai-gpt-4o', 0.89, 'unreviewed'),
  ('b1000000-0000-0000-0000-000000000001', 'places_to_stay', 'Shinjuku Granbell Hotel', 'Stylish boutique hotel in Shinjuku, close to transport hubs.', '$$', 'Great value central location', 'openai-gpt-4o', 0.87, 'unreviewed'),
  ('b1000000-0000-0000-0000-000000000001', 'safety_health', 'Low Crime Rate', 'Tokyo is extremely safe; carry travel insurance and watch for earthquake protocols.', null, 'Very safe city for tourists', 'openai-gpt-4o', 0.95, 'unreviewed'),
  ('b1000000-0000-0000-0000-000000000002', 'places_to_visit', 'Louvre Museum', 'World largest art museum; book skip-the-line tickets in advance.', '$$', 'Essential Paris landmark', 'openai-gpt-4o', 0.96, 'unreviewed'),
  ('b1000000-0000-0000-0000-000000000002', 'places_to_eat', 'Café de Flore', 'Iconic Saint-Germain café; great for breakfast meetings.', '$$', 'Classic Parisian experience', 'openai-gpt-4o', 0.88, 'unreviewed'),
  ('b1000000-0000-0000-0000-000000000003', 'places_to_visit', 'Maasai Mara National Reserve', '3-day safari from Nairobi; best wildlife viewing Oct–Nov.', '$$$', 'Top safari destination in Africa', 'openai-gpt-4o', 0.94, 'unreviewed'),
  ('b1000000-0000-0000-0000-000000000003', 'safety_health', 'Health Precautions', 'Malaria prophylaxis recommended; yellow fever vaccination required for some regions.', null, 'Consult GP 6 weeks before travel', 'openai-gpt-4o', 0.91, 'unreviewed');

insert into itinerary_days (travel_plan_id, day_number, day_date, morning_activity, afternoon_activity, evening_activity, meals, transport_notes, itinerary_value, itinerary_source, itinerary_confidence, itinerary_review_status) values
  ('b1000000-0000-0000-0000-000000000001', 1, '2025-09-01', 'Arrive at Narita, check into Shinjuku hotel', 'Explore Shinjuku Gyoen garden', 'Dinner at Omoide Yokocho memory lane', 'Ramen at Ichiran for lunch', 'Narita Express (N''EX) to Shinjuku — 90 min, ~¥3000', 'Arrival and local orientation day', 'openai-gpt-4o', 0.90, 'unreviewed'),
  ('b1000000-0000-0000-0000-000000000001', 2, '2025-09-02', 'Senso-ji Temple and Nakamise shopping street', 'TeamLab Borderless digital art museum', 'Shibuya crossing and night out', 'Sushi at Tsukiji outer market', 'Tokyo Metro day pass ¥800', 'Culture and art immersion day', 'openai-gpt-4o', 0.88, 'unreviewed'),
  ('b1000000-0000-0000-0000-000000000002', 1, '2025-10-10', 'Arrive CDG, check into Le Marais hotel', 'Louvre Museum visit (pre-booked)', 'Seine river cruise at sunset', 'Lunch at Café de Flore', 'RER B from CDG to city — 35 min, €11.80', 'Art and arrival day', 'openai-gpt-4o', 0.91, 'unreviewed'),
  ('b1000000-0000-0000-0000-000000000003', 1, '2025-11-01', 'Arrive JKIA Nairobi, check into Westlands hotel', 'Visit Karen Blixen Museum', 'Carnivore Restaurant dinner', 'Nyama choma lunch at local spot', 'Uber from airport ~$15', 'Nairobi city orientation day', 'openai-gpt-4o', 0.89, 'unreviewed');