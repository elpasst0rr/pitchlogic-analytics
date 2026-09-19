-- ============================================================================
-- PITCHLOGIC ANALYTICS — MIGRACIÓN 003
-- Autenticación / suscripciones (gating freemium)
-- ============================================================================
-- Ejecutar UNA VEZ en el SQL Editor de Supabase, después de las migraciones
-- 001 y 002. Supabase Auth (auth.users) ya viene activado por defecto en
-- cualquier proyecto — esta migración solo añade la tabla de suscripción y
-- el alta automática al registrarse.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabla de suscripciones (free / premium)
-- ----------------------------------------------------------------------------
-- Deliberadamente separada de un futuro `profiles` (datos editables por el
-- usuario, como nombre o avatar): el nivel de suscripción NUNCA debe ser
-- escribible por el propio usuario, así que vive en su propia tabla sin
-- política de insert/update para el rol `authenticated`.

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'premium')),
  updated_at timestamptz not null default now()
);

alter table subscriptions enable row level security;

-- El usuario puede LEER su propio nivel de suscripción...
create policy "select own subscription" on subscriptions
  for select using (auth.uid() = user_id);

-- ...pero no puede insertar ni modificar filas. Solo service_role (que
-- bypassa RLS) podrá hacerlo — típicamente desde un webhook de Stripe que
-- construiremos más adelante.

-- ----------------------------------------------------------------------------
-- 2. Alta automática: cada nuevo usuario arranca en 'free'
-- ----------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
security definer set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, tier)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- FIN DE LA MIGRACIÓN 003
-- ============================================================================
