-- ================================================================
-- Millán Academy — esquema de base de datos
-- Cómo usarlo: Supabase → panel del proyecto → "SQL Editor" (menú
-- izquierdo) → "New query" → pegar TODO este archivo → "Run".
-- Se puede correr una sola vez; si algo ya existe, no rompe nada.
-- ================================================================

-- Perfiles de staff. Se llena solo (ver el trigger más abajo) cada vez
-- que alguien crea una cuenta desde la pantalla de "Crear cuenta" del
-- panel, o cada vez que se crea un usuario a mano desde Authentication →
-- Users.
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  telefono text,
  pais text,
  rol text not null default 'profe' check (rol in ('dueño','profe')),
  creado_en timestamptz not null default now()
);
alter table public.perfiles add column if not exists telefono text;
alter table public.perfiles add column if not exists pais text;

-- Crea automáticamente la fila de perfil apenas se registra alguien
-- (toma nombre/teléfono/país de los datos que mandó el formulario de
-- registro; si se creó a mano desde el dashboard, usa el email).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, telefono, pais, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'telefono',
    new.raw_user_meta_data->>'pais',
    'profe'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Alumnos
create table if not exists public.alumnos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text,
  sede text,
  coach text,
  moneda text default 'MXN',
  telefono text,
  correo text,
  talla_playera text,
  activo boolean not null default true,
  avatar text,
  objetivos jsonb not null default '[]',
  evaluacion jsonb not null default '{"tactica":0,"tecnica":0,"fisico":0,"comentarios":""}',
  alta timestamptz not null default now()
);

-- Bitácora de sesiones
create table if not exists public.bitacora (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid references public.alumnos(id) on delete cascade,
  tipo text,
  nota text,
  fecha timestamptz not null default now()
);

-- Reservas / agenda
create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid references public.alumnos(id) on delete set null,
  fecha date not null,
  hora text not null,
  tipo text,
  duracion int,
  sede text,
  estado text not null default 'disponible'
);

-- Solicitudes de clase de prueba — lo llena una familia interesada,
-- que tiene que iniciar sesión o crear una cuenta primero.
create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  edad int,
  telefono text,
  pais text,
  zona text,
  sede text,
  mensaje text,
  estado text not null default 'pendiente',
  fecha timestamptz not null default now()
);

-- Inscripciones — el formulario del botón "Inscribirme" del sitio.
create table if not exists public.inscripciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  plan_id text,
  duracion_id text,
  plan_nombre text,
  duracion_label text,
  monto numeric,
  moneda text,
  talla_playera text,
  estado text not null default 'pendiente de pago',
  fecha timestamptz not null default now()
);

-- Pagos
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid references public.alumnos(id) on delete set null,
  concepto text,
  metodo text,
  monto numeric not null,
  moneda text default 'MXN',
  periodicidad text,
  estado text not null default 'pendiente',
  fecha timestamptz not null default now()
);

-- Check-ins (llegada a cancha con foto)
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sede text,
  foto_url text,
  estado text not null default 'guardado',
  fecha timestamptz not null default now()
);

-- Objetivos por categoría (sección de profes)
create table if not exists public.objetivos_categoria (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  profe text,
  titulo text not null,
  detalle text,
  fecha timestamptz not null default now()
);

-- Contacto para plan personalizado
create table if not exists public.contactos (
  id uuid primary key default gen_random_uuid(),
  nombre text,
  contacto text,
  mensaje text,
  fecha timestamptz not null default now()
);

-- Configuración general (punto de equilibrio, etc.)
create table if not exists public.config (
  clave text primary key,
  valor jsonb
);
insert into public.config (clave, valor) values ('costos_fijos_mxn', '45000')
  on conflict (clave) do nothing;

-- Evidencias: pruebas que sube el propio alumno de que hizo lo que se
-- le pidió (fue al gym tal día, su comida del plan de nutrición, etc.)
-- "alumno_nombre" es texto libre (no un id) porque los alumnos todavía
-- viven en el navegador de cada quien, no en Supabase.
create table if not exists public.evidencias (
  id uuid primary key default gen_random_uuid(),
  alumno_nombre text not null,
  tipo text not null,
  comentario text,
  foto_path text,
  fecha timestamptz not null default now()
);

-- Bucket de fotos de evidencias. Público (no hace falta clave para
-- verlas) porque son fotos de bajo riesgo (gym, comidas) y así no hace
-- falta armar links firmados; las rutas son al azar, no adivinables.
insert into storage.buckets (id, name, public)
  values ('evidencias', 'evidencias', true)
  on conflict (id) do update set public = true;

-- ================================================================
-- Seguridad (Row Level Security)
--
-- Todo lo de arriba pide haber iniciado sesión (cualquier cuenta,
-- no hace falta ser staff) para poder leer o escribir. Ver el sitio
-- público no requiere cuenta — solo reservar una clase de prueba o
-- inscribirse/pagar, que es cuando la app pide iniciar sesión o
-- crear una cuenta.
-- ================================================================

alter table public.perfiles enable row level security;
alter table public.alumnos enable row level security;
alter table public.bitacora enable row level security;
alter table public.reservas enable row level security;
alter table public.solicitudes enable row level security;
alter table public.inscripciones enable row level security;
alter table public.pagos enable row level security;
alter table public.checkins enable row level security;
alter table public.objetivos_categoria enable row level security;
alter table public.contactos enable row level security;
alter table public.config enable row level security;
alter table public.evidencias enable row level security;

drop policy if exists "staff ve perfiles" on public.perfiles;
create policy "staff ve perfiles" on public.perfiles for select to authenticated using (true);
drop policy if exists "cada quien edita su perfil" on public.perfiles;
create policy "cada quien edita su perfil" on public.perfiles for update to authenticated using (auth.uid() = id);
drop policy if exists "cada quien crea su perfil" on public.perfiles;
create policy "cada quien crea su perfil" on public.perfiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "staff todo alumnos" on public.alumnos;
create policy "staff todo alumnos" on public.alumnos for all to authenticated using (true) with check (true);
drop policy if exists "staff todo bitacora" on public.bitacora;
create policy "staff todo bitacora" on public.bitacora for all to authenticated using (true) with check (true);
drop policy if exists "staff todo reservas" on public.reservas;
create policy "staff todo reservas" on public.reservas for all to authenticated using (true) with check (true);
drop policy if exists "staff todo pagos" on public.pagos;
create policy "staff todo pagos" on public.pagos for all to authenticated using (true) with check (true);
drop policy if exists "staff todo checkins" on public.checkins;
create policy "staff todo checkins" on public.checkins for all to authenticated using (true) with check (true);
drop policy if exists "staff todo objetivos" on public.objetivos_categoria;
create policy "staff todo objetivos" on public.objetivos_categoria for all to authenticated using (true) with check (true);
drop policy if exists "staff todo contactos" on public.contactos;
create policy "staff todo contactos" on public.contactos for all to authenticated using (true) with check (true);
drop policy if exists "staff todo config" on public.config;
create policy "staff todo config" on public.config for all to authenticated using (true) with check (true);
drop policy if exists "logueado todo evidencias" on public.evidencias;
create policy "logueado todo evidencias" on public.evidencias for all to authenticated using (true) with check (true);

-- Subir fotos al bucket "evidencias" también pide sesión iniciada.
drop policy if exists "logueado sube evidencias" on storage.objects;
create policy "logueado sube evidencias" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias');

-- Reservar una clase de prueba o inscribirse/pagar también pide haber
-- iniciado sesión (cualquier cuenta sirve, no hace falta ser staff) —
-- así cada solicitud queda ligada a una cuenta real, no a un visitante
-- anónimo.
drop policy if exists "cualquiera envia solicitud" on public.solicitudes;
drop policy if exists "logueado envia solicitud" on public.solicitudes;
create policy "logueado envia solicitud" on public.solicitudes for insert to authenticated with check (true);
drop policy if exists "staff ve solicitudes" on public.solicitudes;
create policy "staff ve solicitudes" on public.solicitudes for select to authenticated using (true);
drop policy if exists "staff actualiza solicitudes" on public.solicitudes;
create policy "staff actualiza solicitudes" on public.solicitudes for update to authenticated using (true);

drop policy if exists "cualquiera se inscribe" on public.inscripciones;
drop policy if exists "logueado se inscribe" on public.inscripciones;
create policy "logueado se inscribe" on public.inscripciones for insert to authenticated with check (true);
drop policy if exists "staff ve inscripciones" on public.inscripciones;
create policy "staff ve inscripciones" on public.inscripciones for select to authenticated using (true);
drop policy if exists "staff actualiza inscripciones" on public.inscripciones;
create policy "staff actualiza inscripciones" on public.inscripciones for update to authenticated using (true);
