-- ============================================================================
-- PITCHLOGIC ANALYTICS — SCHEMA DE BASE DE DATOS (SUPABASE / POSTGRES)
-- ============================================================================
-- Diseñado para soportar el modelo de deducción en 4 capas:
--   Capa 1 (40%): Rendimiento base / xG
--   Capa 2 (25%): Plantilla y bajas
--   Capa 3 (20%): Descanso y fatiga
--   Capa 4 (15%): Factores contextuales / clima / árbitro
--
-- Mercados soportados: 1X2, remates (equipo/jugador), córners, tarjetas, faltas
-- Modo de servicio del modelo: Job Batch precalculado (predictions + value_alerts
-- se generan por un script Python y el frontend solo lee)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONES
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- ----------------------------------------------------------------------------
create type match_status as enum (
  'scheduled', 'lineups_confirmed', 'live', 'finished', 'postponed', 'cancelled'
);

create type absence_type as enum (
  'injury', 'suspension', 'doubtful', 'international_duty', 'other'
);

create type absence_status as enum (
  'confirmed_out', 'doubtful', 'returned', 'expired'
);

create type market_target_type as enum (
  'match', 'team', 'player'
);

create type market_category as enum (
  '1x2', 'goals', 'shots', 'corners', 'cards', 'fouls', 'other'
);

create type prediction_selection as enum (
  'home', 'draw', 'away', 'over', 'under', 'yes', 'no',
  'home_or_draw', 'draw_or_away', 'home_or_away' -- Doble Oportunidad: 1X, X2, 12
);

create type alert_level as enum (
  'low', 'medium', 'high', 'premium'
);

create type model_run_type as enum (
  'scheduled_daily', 'scheduled_intraday', 'pre_match_lineup_confirmed', 'manual'
);

create type model_run_status as enum (
  'running', 'completed', 'failed', 'partial'
);

-- ----------------------------------------------------------------------------
-- 2. FUNCIÓN GENÉRICA PARA `updated_at`
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- 3. TABLAS DE REFERENCIA: LIGAS, EQUIPOS, JUGADORES, ÁRBITROS
-- ----------------------------------------------------------------------------

create table leagues (
  id uuid primary key default gen_random_uuid(),
  api_football_id int unique not null,
  name text not null,
  country text,
  logo_url text,
  current_season int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  api_football_id int unique not null,
  league_id uuid references leagues(id) on delete set null,
  name text not null,
  short_name text,
  logo_url text,
  stadium_name text,
  stadium_lat numeric(9,6),
  stadium_lng numeric(9,6),
  founded int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  api_football_id int unique not null,
  team_id uuid references teams(id) on delete set null,
  name text not null,
  position text, -- Goalkeeper / Defender / Midfielder / Attacker
  birth_date date,
  nationality text,
  height_cm int,
  weight_kg int,
  photo_url text,
  -- Score 0-100 usado en la Capa 2 para ponderar el impacto real de una baja
  -- (minutos jugados, goles/asistencias, titularidad, etc.). Se recalcula
  -- periódicamente por el pipeline, no es un flag manual fijo.
  player_importance_score numeric(5,2) not null default 0
    check (player_importance_score >= 0 and player_importance_score <= 100),
  importance_score_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table referees (
  id uuid primary key default gen_random_uuid(),
  api_football_id int unique, -- puede ser null si viene de scraping propio
  name text not null,
  nationality text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Estadísticas agregadas del árbitro (recalculadas periódicamente por el pipeline).
-- Alimenta la Capa 4. Separado de `referees` porque se recalcula con
-- distinta cadencia (semanal) y puede tener múltiples fuentes (API + scraping).
create table referee_stats (
  id uuid primary key default gen_random_uuid(),
  referee_id uuid not null references referees(id) on delete cascade,
  season int not null,
  matches_officiated int not null default 0,
  avg_yellow_cards_per_match numeric(5,2),
  avg_red_cards_per_match numeric(5,2),
  avg_fouls_given_per_match numeric(5,2),
  penalties_awarded int,
  home_win_pct numeric(5,2),
  source text not null default 'api_football', -- 'api_football' | 'scraping' | 'manual'
  computed_at timestamptz not null default now(),
  unique (referee_id, season, source)
);

-- ----------------------------------------------------------------------------
-- 4. PARTIDOS Y ALINEACIONES
-- ----------------------------------------------------------------------------

create table matches (
  id uuid primary key default gen_random_uuid(),
  api_football_id int unique not null,
  league_id uuid references leagues(id) on delete set null,
  season int not null,
  round text,
  match_date timestamptz not null,
  status match_status not null default 'scheduled',
  home_team_id uuid not null references teams(id),
  away_team_id uuid not null references teams(id),
  referee_id uuid references referees(id),
  venue_name text,
  venue_lat numeric(9,6),
  venue_lng numeric(9,6),
  home_score int,
  away_score int,
  ht_home_score int,
  ht_away_score int,
  lineups_confirmed_at timestamptz, -- se rellena cuando llega la alineación oficial (~1h antes)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);

-- Alineaciones confirmadas (clave para el re-run del modelo 1h antes del partido)
create table lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_id uuid not null references teams(id),
  player_id uuid not null references players(id),
  is_starting boolean not null default true,
  shirt_number int,
  formation_position text, -- ej. 'RW', 'CB', 'GK'
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

-- ----------------------------------------------------------------------------
-- 5. BAJAS: LESIONES Y SANCIONES (Capa 2 — Plantilla y bajas)
-- ----------------------------------------------------------------------------

create table injuries_suspensions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  team_id uuid not null references teams(id),
  type absence_type not null,
  status absence_status not null default 'confirmed_out',
  reason text,
  expected_return_date date,
  reported_at timestamptz not null default now(),
  source text not null default 'api_football', -- 'api_football' | 'manual' | 'scraping'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_injuries_player_active
  on injuries_suspensions (player_id)
  where status in ('confirmed_out', 'doubtful');

-- ----------------------------------------------------------------------------
-- 6. ESTADÍSTICAS DE PARTIDO (Capa 1 — Rendimiento base / xG)
-- ----------------------------------------------------------------------------

-- Nivel equipo: una fila por equipo por partido
create table match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_id uuid not null references teams(id),
  is_home boolean not null,
  shots_total int,
  shots_on_target int,
  shots_off_target int,
  shots_blocked int,
  corners int,
  fouls_committed int,
  yellow_cards int,
  red_cards int,
  possession_pct numeric(5,2),
  xg numeric(5,2), -- expected goals
  xga numeric(5,2), -- expected goals against (útil para fuerza defensiva)
  created_at timestamptz not null default now(),
  unique (match_id, team_id)
);

-- Nivel jugador: una fila por jugador por partido (para mercados de remates/tarjetas individuales)
create table player_match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id),
  team_id uuid not null references teams(id),
  minutes_played int,
  shots_total int,
  shots_on_target int,
  fouls_committed int,
  fouls_drawn int,
  yellow_cards int default 0,
  red_cards int default 0,
  goals int default 0,
  assists int default 0,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

-- ----------------------------------------------------------------------------
-- 7. CLIMA (Capa 4 — Factores contextuales)
-- ----------------------------------------------------------------------------

create table weather_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  captured_at timestamptz not null default now(),
  is_forecast boolean not null default true, -- false cuando se captura el dato real cercano al kickoff
  temperature_c numeric(5,2),
  feels_like_c numeric(5,2),
  humidity_pct numeric(5,2),
  wind_speed_kmh numeric(5,2),
  precipitation_mm numeric(5,2),
  weather_condition text, -- ej. 'Rain', 'Clear', 'Snow' (OpenWeatherMap)
  weather_code int,
  source text not null default 'openweathermap',
  created_at timestamptz not null default now()
);

create index idx_weather_match on weather_snapshots (match_id, captured_at desc);

-- ----------------------------------------------------------------------------
-- 8. CATÁLOGO DE MERCADOS Y CUOTAS
-- ----------------------------------------------------------------------------
-- Catálogo abierto: añadir un mercado nuevo es un INSERT, no una migración.

create table markets (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, -- ej. '1X2', 'TEAM_CORNERS_OU', 'PLAYER_SHOTS_OU', 'TEAM_CARDS_OU', 'TEAM_FOULS_OU'
  name text not null,
  category market_category not null,
  target_type market_target_type not null, -- match | team | player
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cuotas de casas de apuestas, capturadas periódicamente (para calcular el "edge" de valor)
create table bookmaker_odds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  market_id uuid not null references markets(id),
  target_team_id uuid references teams(id), -- null si el mercado es de partido
  target_player_id uuid references players(id), -- null salvo mercados de jugador
  line_value numeric(6,2), -- ej. 9.5 para "over/under 9.5 córners"
  selection prediction_selection not null,
  odds_decimal numeric(6,3) not null,
  bookmaker text not null,
  captured_at timestamptz not null default now()
);

create index idx_bookmaker_odds_match on bookmaker_odds (match_id, market_id);

-- ----------------------------------------------------------------------------
-- 9. EJECUCIONES DEL MODELO (JOB BATCH)
-- ----------------------------------------------------------------------------

create table model_runs (
  id uuid primary key default gen_random_uuid(),
  run_type model_run_type not null,
  status model_run_status not null default 'running',
  triggered_at timestamptz not null default now(),
  finished_at timestamptz,
  matches_processed int default 0,
  predictions_generated int default 0,
  error_log text,
  notes text
);

-- ----------------------------------------------------------------------------
-- 10. PREDICCIONES — el corazón del modelo de 4 capas
-- ----------------------------------------------------------------------------

create table predictions (
  id uuid primary key default gen_random_uuid(),
  model_run_id uuid not null references model_runs(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  market_id uuid not null references markets(id),
  target_team_id uuid references teams(id),     -- para mercados a nivel equipo
  target_player_id uuid references players(id), -- para mercados a nivel jugador
  line_value numeric(6,2),                       -- ej. 2.5 goles, 9.5 córners
  selection prediction_selection not null,

  -- Subscores de las 4 capas (0-100 o probabilidad 0-1, decide la escala y sé consistente)
  layer1_performance_xg numeric(6,4) not null,
  layer2_squad_availability numeric(6,4) not null,
  layer3_rest_fatigue numeric(6,4) not null,
  layer4_contextual numeric(6,4) not null,

  -- Pesos aplicados (guardados por trazabilidad, por si ajustas el modelo con el tiempo)
  layer1_weight numeric(4,3) not null default 0.40,
  layer2_weight numeric(4,3) not null default 0.25,
  layer3_weight numeric(4,3) not null default 0.20,
  layer4_weight numeric(4,3) not null default 0.15,

  composite_probability numeric(6,4) not null, -- probabilidad final del modelo (0-1)
  fair_odds numeric(6,3) generated always as (
    case when composite_probability > 0 then round((1 / composite_probability)::numeric, 3) else null end
  ) stored,

  confidence_level numeric(5,2), -- opcional: certeza del modelo, distinto de la probabilidad en sí

  created_at timestamptz not null default now()
);

create index idx_predictions_match on predictions (match_id);
create index idx_predictions_model_run on predictions (model_run_id);
create index idx_predictions_market on predictions (market_id);

-- ----------------------------------------------------------------------------
-- 11. ALERTAS DE VALOR — comparación modelo vs. mercado
-- ----------------------------------------------------------------------------

create table value_alerts (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references predictions(id) on delete cascade,
  bookmaker_odds_id uuid references bookmaker_odds(id),
  match_id uuid not null references matches(id) on delete cascade,
  market_id uuid not null references markets(id),
  model_probability numeric(6,4) not null,
  market_odds numeric(6,3) not null,
  implied_market_probability numeric(6,4) generated always as (
    case when market_odds > 0 then round((1 / market_odds)::numeric, 4) else null end
  ) stored,
  value_edge_pct numeric(6,2) not null, -- (model_prob - implied_prob) / implied_prob * 100
  alert_level alert_level not null default 'low',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_value_alerts_match on value_alerts (match_id) where is_active = true;
create index idx_value_alerts_level on value_alerts (alert_level) where is_active = true;

-- ----------------------------------------------------------------------------
-- 11b. RECOMENDACIONES DE QUINIELA (una fila por partido por corrida)
-- ----------------------------------------------------------------------------
-- Resumen a nivel de partido que combina 1X2 + Doble Oportunidad en una única
-- "casilla" recomendada, según los umbrales de probabilidad del modelo
-- (Victoria simple >= 60%, Doble Oportunidad >= 52%). Vive aparte de
-- `predictions` porque es una agregación entre mercados, no un mercado en sí.

create table match_recommendations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  model_run_id uuid not null references model_runs(id) on delete cascade,

  recommended_pick text,
  recommendation_tier text not null
    check (recommendation_tier in ('victoria_simple', 'doble_oportunidad', 'sin_recomendacion')),
  recommended_probability numeric(6,4),

  prob_home numeric(6,4) not null,
  prob_draw numeric(6,4) not null,
  prob_away numeric(6,4) not null,
  prob_double_1x numeric(6,4) not null,
  prob_double_x2 numeric(6,4) not null,
  prob_double_12 numeric(6,4) not null,

  created_at timestamptz not null default now(),
  unique (match_id, model_run_id)
);

create index idx_match_recommendations_match on match_recommendations (match_id);

-- ----------------------------------------------------------------------------
-- 12. TRIGGERS `updated_at`
-- ----------------------------------------------------------------------------

create trigger trg_leagues_updated_at before update on leagues
  for each row execute function set_updated_at();
create trigger trg_teams_updated_at before update on teams
  for each row execute function set_updated_at();
create trigger trg_players_updated_at before update on players
  for each row execute function set_updated_at();
create trigger trg_referees_updated_at before update on referees
  for each row execute function set_updated_at();
create trigger trg_matches_updated_at before update on matches
  for each row execute function set_updated_at();
create trigger trg_injuries_updated_at before update on injuries_suspensions
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 13. ÍNDICES ADICIONALES DE RENDIMIENTO
-- ----------------------------------------------------------------------------

create index idx_matches_date on matches (match_date);
create index idx_matches_status on matches (status);
create index idx_matches_teams on matches (home_team_id, away_team_id);
create index idx_match_stats_team on match_stats (team_id);
create index idx_player_match_stats_player on player_match_stats (player_id);
create index idx_players_team on players (team_id);
create index idx_lineups_match on lineups (match_id);

-- ----------------------------------------------------------------------------
-- 14. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
-- Supabase activa RLS por tabla. Regla general para este proyecto:
--   - El `service_role` (usado por tus scripts Python del backend) tiene acceso total,
--     porque bypassa RLS por defecto en Supabase.
--   - El frontend (rol `anon` / `authenticated`) solo puede LEER predicciones y alertas
--     ya calculadas — nunca escribir, y no necesita ver tablas internas como
--     `model_runs`, `referee_stats`, etc.
-- Ajusta según si vas a monetizar con niveles de suscripción (ej. alertas 'premium'
-- solo visibles para usuarios de pago vía política adicional).

alter table leagues enable row level security;
alter table teams enable row level security;
alter table players enable row level security;
alter table referees enable row level security;
alter table referee_stats enable row level security;
alter table matches enable row level security;
alter table lineups enable row level security;
alter table injuries_suspensions enable row level security;
alter table match_stats enable row level security;
alter table player_match_stats enable row level security;
alter table weather_snapshots enable row level security;
alter table markets enable row level security;
alter table bookmaker_odds enable row level security;
alter table model_runs enable row level security;
alter table predictions enable row level security;
alter table value_alerts enable row level security;
alter table match_recommendations enable row level security;

-- Lectura pública de datos de contexto (equipos, jugadores, partidos, mercados)
create policy "public read teams" on teams for select using (true);
create policy "public read players" on players for select using (true);
create policy "public read leagues" on leagues for select using (true);
create policy "public read matches" on matches for select using (true);
create policy "public read markets" on markets for select using (true);

-- Lectura pública de los resultados finales del modelo (lo que consume tu app)
create policy "public read predictions" on predictions for select using (true);
create policy "public read value alerts" on value_alerts for select using (is_active = true);
create policy "public read match recommendations" on match_recommendations for select using (true);

-- El resto de tablas (injuries_suspensions, match_stats, weather_snapshots,
-- referee_stats, model_runs, bookmaker_odds, lineups, player_match_stats)
-- quedan SIN política de lectura pública: solo accesibles vía service_role
-- desde tus scripts backend. Añade políticas de "select" explícitas si más
-- adelante quieres exponer alguna directamente al frontend.

-- ----------------------------------------------------------------------------
-- 15. SEED INICIAL DEL CATÁLOGO DE MERCADOS
-- ----------------------------------------------------------------------------

insert into markets (code, name, category, target_type, description) values
  ('1X2', 'Resultado del partido (1X2)', '1x2', 'match', 'Victoria local / empate / victoria visitante'),
  ('DOUBLE_CHANCE', 'Doble oportunidad', '1x2', 'match', 'Combinaciones de dos resultados posibles'),
  ('TEAM_GOALS_OU', 'Goles del equipo Over/Under', 'goals', 'team', 'Línea de goles marcados por un equipo'),
  ('MATCH_GOALS_OU', 'Goles totales del partido Over/Under', 'goals', 'match', 'Línea de goles totales del partido'),
  ('TEAM_SHOTS_OU', 'Remates totales del equipo Over/Under', 'shots', 'team', 'Línea de remates totales de un equipo'),
  ('TEAM_SHOTS_ON_TARGET_OU', 'Remates a puerta del equipo Over/Under', 'shots', 'team', 'Línea de remates a puerta de un equipo'),
  ('PLAYER_SHOTS_OU', 'Remates de jugador Over/Under', 'shots', 'player', 'Línea de remates totales de un jugador'),
  ('PLAYER_SHOTS_ON_TARGET_OU', 'Remates a puerta de jugador Over/Under', 'shots', 'player', 'Línea de remates a puerta de un jugador'),
  ('TEAM_CORNERS_OU', 'Córners del equipo Over/Under', 'corners', 'team', 'Línea de córners de un equipo'),
  ('MATCH_CORNERS_OU', 'Córners totales del partido Over/Under', 'corners', 'match', 'Línea de córners totales del partido'),
  ('TEAM_CARDS_OU', 'Tarjetas del equipo Over/Under', 'cards', 'team', 'Línea de tarjetas (amarillas+rojas ponderadas) de un equipo'),
  ('MATCH_CARDS_OU', 'Tarjetas totales del partido Over/Under', 'cards', 'match', 'Línea de tarjetas totales del partido'),
  ('PLAYER_CARD_YN', 'Jugador recibe tarjeta (Sí/No)', 'cards', 'player', 'Probabilidad de que un jugador vea tarjeta'),
  ('TEAM_FOULS_OU', 'Faltas del equipo Over/Under', 'fouls', 'team', 'Línea de faltas cometidas por un equipo'),
  ('MATCH_FOULS_OU', 'Faltas totales del partido Over/Under', 'fouls', 'match', 'Línea de faltas totales del partido')
on conflict (code) do nothing;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
