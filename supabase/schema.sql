-- ═══════════════════════════════════════════════════════════════════════
--  Simulador de Seguimiento de Órdenes de Trabajo (estilo IBM Maximo)
--  Esquema PostgreSQL / Supabase
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Luego ejecutar supabase/seed.sql (o usar el botón "Restablecer datos").
-- ═══════════════════════════════════════════════════════════════════════

-- Limpieza (permite re-ejecutar el script)
drop table if exists audit_log cascade;
drop table if exists worklog cascade;
drop table if exists workorder cascade;
drop table if exists asset cascade;
drop table if exists locations cascade;
drop table if exists app_user cascade;

-- ── Usuarios de prueba y roles (RBAC) ─────────────────────────────────
create table app_user (
  id          text primary key,                 -- ej. tec.cramirez
  name        text not null,
  role        text not null check (role in ('CONTRATISTA','PLANEACION','ANALISTA')),
  company     text not null,                    -- empresa contratista o área interna
  email       text not null,
  pin_hash    text not null                     -- sha256('<id>:<pin>')
);

-- ── Ubicaciones (LOCATIONS) ───────────────────────────────────────────
create table locations (
  location    text primary key,                 -- LOCATION
  description text not null,
  site        text not null,                    -- SITEID
  service     text not null check (service in ('ENERGIA','AGUA','GAS'))
);

-- ── Activos (ASSET) ───────────────────────────────────────────────────
create table asset (
  assetnum    text primary key,                 -- ASSETNUM
  description text not null,
  location    text not null references locations(location),
  service     text not null check (service in ('ENERGIA','AGUA','GAS')),
  criticality text not null check (criticality in ('ALTA','MEDIA','BAJA'))
);

-- ── Órdenes de trabajo (WORKORDER) ────────────────────────────────────
create table workorder (
  wonum            text primary key,            -- WONUM  OT-2026-001
  description      text not null check (char_length(description) >= 10),
  long_description text,
  assetnum         text not null references asset(assetnum),
  location         text not null references locations(location),
  site             text not null,
  service          text not null check (service in ('ENERGIA','AGUA','GAS')),
  worktype         text not null check (worktype in ('CM','PM','EM','CP')),
  wopriority       smallint not null check (wopriority between 1 and 4),
  status           text not null check (status in ('WAPPR','APPR','WMATL','INPRG','COMP','CLOSE','CAN')),
  status_date      timestamptz not null default now(),
  reported_by      text not null references app_user(id),
  report_date      timestamptz not null default now(),
  supervisor       text references app_user(id),
  lead             text references app_user(id),  -- técnico asignado
  vendor           text,                          -- empresa contratista
  target_start     date,
  target_finish    date,
  actual_start     timestamptz,
  actual_finish    timestamptz,
  est_hours        numeric(8,2),
  est_cost         numeric(14,0),
  actual_cost      numeric(14,0),
  updated_at       timestamptz not null default now()
);
create index workorder_status_idx   on workorder(status);
create index workorder_lead_idx     on workorder(lead);
create index workorder_vendor_idx   on workorder(vendor);
create index workorder_asset_idx    on workorder(assetnum);

-- ── Bitácora de trabajo (WORKLOG) ─────────────────────────────────────
create table worklog (
  id          bigint generated always as identity primary key,
  wonum       text not null references workorder(wonum) on delete cascade,
  created_by  text not null references app_user(id),
  created_at  timestamptz not null default now(),
  log_type    text not null check (log_type in ('CREACION','AVANCE','CAMBIO_ESTADO','NOTA')),
  description text not null,
  channel     text not null check (channel in ('UI','CHATBOT','SISTEMA'))
);
create index worklog_wonum_idx on worklog(wonum, created_at desc);

-- ── Historial de auditoría (append-only) ──────────────────────────────
create table audit_log (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  user_id     text not null,
  user_name   text not null,
  role        text not null,
  action      text not null,      -- CONSULTA | CREAR_OT | CAMBIO_ESTADO | REGISTRO_AVANCE | ELIMINAR | EXPORTAR | RESET_DATOS | INICIO_SESION | CIERRE_SESION
  wonum       text,               -- sin FK: el log debe sobrevivir aunque la OT no exista
  channel     text not null check (channel in ('UI','CHATBOT','SISTEMA')),
  result      text not null check (result in ('OK','DENEGADO','ERROR')),
  detail      text not null,
  ref         text,               -- referencia de trazabilidad del chatbot
  before_data jsonb,
  after_data  jsonb
);
create index audit_wonum_idx on audit_log(wonum, ts desc);
create index audit_ref_idx   on audit_log(ref);
create index audit_ts_idx    on audit_log(ts desc);

-- El historial de auditoría NO se puede modificar ni borrar fila a fila
-- (solo TRUNCATE desde "Restablecer datos" del simulador).
create or replace function audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'El historial de auditoría es inmutable';
end $$;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();

-- ── Seguridad ─────────────────────────────────────────────────────────
-- RLS activo SIN políticas públicas: el navegador nunca accede directo a la BD.
-- Toda lectura/escritura pasa por las API Routes de Next.js, que usan la
-- service_role key en el servidor y aplican el RBAC en lib/services/workorders.ts.
alter table app_user  enable row level security;
alter table locations enable row level security;
alter table asset     enable row level security;
alter table workorder enable row level security;
alter table worklog   enable row level security;
alter table audit_log enable row level security;

-- Función usada por "Restablecer datos" (vacía todo en una sola transacción)
create or replace function reset_simulador() returns void language plpgsql security definer as $$
begin
  truncate table audit_log, worklog, workorder, asset, locations, app_user restart identity cascade;
end $$;
revoke all on function reset_simulador() from public, anon, authenticated;
grant execute on function reset_simulador() to service_role;
