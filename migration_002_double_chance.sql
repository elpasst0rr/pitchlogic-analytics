-- ============================================================================
-- PITCHLOGIC ANALYTICS — MIGRACIÓN 002
-- Doble Oportunidad (1X, X2, 12) + recomendaciones de quiniela por partido
-- ============================================================================
-- Ejecutar UNA VEZ en el SQL Editor de Supabase, después de la migración
-- inicial (pitchlogic_schema.sql), que ya insertó el mercado 'DOUBLE_CHANCE'
-- en la tabla `markets`. Esta migración solo añade:
--   1. Tres nuevos valores al enum prediction_selection (1X, X2, 12)
--   2. La tabla match_recommendations (una fila por partido con la "casilla"
--      final: 1 / X / 2 / 1X / X2 / 12 / sin recomendación)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Nuevos valores del enum de selección (representan 1X, X2, 12)
-- ----------------------------------------------------------------------------
-- Nota: cada ALTER TYPE ... ADD VALUE debe ejecutarse como sentencia propia
-- (no se puede usar dentro de la misma transacción en la que luego se usa el
-- valor nuevo). Ejecutados uno a uno aquí, esto no da problema en el SQL
-- Editor de Supabase.

alter type prediction_selection add value if not exists 'home_or_draw'; -- 1X
alter type prediction_selection add value if not exists 'draw_or_away'; -- X2
alter type prediction_selection add value if not exists 'home_or_away'; -- 12

-- ----------------------------------------------------------------------------
-- 2. Recomendaciones de quiniela (una fila por partido por corrida del modelo)
-- ----------------------------------------------------------------------------

create table if not exists match_recommendations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  model_run_id uuid not null references model_runs(id) on delete cascade,

  recommended_pick text,             -- '1' | 'X' | '2' | '1X' | 'X2' | '12' | null (sin recomendación clara)
  recommendation_tier text not null  -- 'victoria_simple' | 'doble_oportunidad' | 'sin_recomendacion'
    check (recommendation_tier in ('victoria_simple', 'doble_oportunidad', 'sin_recomendacion')),
  recommended_probability numeric(6,4), -- probabilidad compuesta del pick recomendado (null si no hay recomendación)

  -- Se guardan todas las probabilidades, no solo la recomendada, para que el
  -- frontend pueda mostrar el desglose completo sin una consulta adicional.
  prob_home numeric(6,4) not null,
  prob_draw numeric(6,4) not null,
  prob_away numeric(6,4) not null,
  prob_double_1x numeric(6,4) not null,
  prob_double_x2 numeric(6,4) not null,
  prob_double_12 numeric(6,4) not null,

  created_at timestamptz not null default now(),
  unique (match_id, model_run_id)
);

create index if not exists idx_match_recommendations_match on match_recommendations (match_id);

alter table match_recommendations enable row level security;

create policy "public read match recommendations" on match_recommendations
  for select using (true);

-- ============================================================================
-- FIN DE LA MIGRACIÓN 002
-- ============================================================================
