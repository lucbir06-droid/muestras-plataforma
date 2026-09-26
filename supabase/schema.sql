-- ================================================================
-- Millán Academy — esquema de base de datos (versión con roles)
--
-- Cómo usarlo: Supabase → panel del proyecto → "SQL Editor" (menú
-- izquierdo) → "New query" → pegar TODO este archivo → "Run".
-- Se puede correr las veces que haga falta: no borra datos y deja
-- los permisos siempre en el estado de este archivo.
--
-- Roles:
--   dueño   → ve y hace todo (finanzas, altas/bajas, todos los datos)
--   profe   → ve SUS alumnos, agenda, asistencia, reportes, check-in/out
--   alumno  → ve solo lo suyo (o de sus hijos): evidencias, agenda,
--             reportes, suscripción. Se liga a su alumno con un código.
-- ================================================================

-- ---------------------------------------------------------------
-- 1. PERFILES (uno por cuenta de Authentication)
-- ---------------------------------------------------------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  telefono text,
  pais text,
  rol text not null default 'alumno',
  rol_solicitado text,
  creado_en timestamptz not null default now()
);
alter table public.perfiles add column if not exists telefono text;
alter table public.perfiles add column if not exists pais text;
alter table public.perfiles add column if not exists rol_solicitado text;
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('dueño','profe','alumno'));
alter table public.perfiles alter column rol set default 'alumno';

-- Códigos secretos para elegir rol al registrarse. Esta tabla NO tiene
-- ningún permiso para la app (nadie puede leerla desde el navegador);
-- solo la lee el trigger de abajo. Los códigos se cargan una vez a mano
-- desde el SQL Editor (ver README) — NO se escriben en este archivo
-- porque el repositorio es público.
create table if not exists public.secretos (
  clave text primary key,
  valor text not null
);
alter table public.secretos enable row level security;
revoke all on public.secretos from anon, authenticated;

-- Crea el perfil apenas se registra alguien, según el rol que eligió:
--   alumno → entra como alumno/papá (liga a su alumno con un código).
--   profe  → si escribe el "código de profe" que le dio el dueño, entra
--            como profe al instante; si lo deja vacío, entra como alumno
--            y queda pendiente hasta que el dueño lo apruebe.
--   dueño  → solo entra si escribe el "código de dueño"; si no coincide
--            (o no está configurado) el registro se rechaza.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_pedido text := new.raw_user_meta_data->>'rol';
  v_codigo text := nullif(trim(coalesce(new.raw_user_meta_data->>'codigo', '')), '');
  v_rol text := 'alumno';
  v_solicitado text := null;
  v_esperado text;
begin
  if v_pedido = 'dueño' then
    select valor into v_esperado from public.secretos where clave = 'codigo_dueno';
    if v_esperado is null or v_codigo is distinct from v_esperado then
      raise exception 'Código de dueño incorrecto';
    end if;
    v_rol := 'dueño';
  elsif v_pedido = 'profe' then
    if v_codigo is not null then
      select valor into v_esperado from public.secretos where clave = 'codigo_profe';
      if v_esperado is null or v_codigo is distinct from v_esperado then
        raise exception 'Código de profe incorrecto';
      end if;
      v_rol := 'profe';
    else
      v_solicitado := 'profe';
    end if;
  end if;

  insert into public.perfiles (id, nombre, telefono, pais, rol, rol_solicitado)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'telefono',
    new.raw_user_meta_data->>'pais',
    v_rol,
    v_solicitado
  )
  on conflict (id) do nothing;

  -- que el código no quede guardado en los datos de la cuenta
  update auth.users set raw_user_meta_data = raw_user_meta_data - 'codigo' where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- 2. ALUMNOS y sus cuentas ligadas (papá / mamá / el propio alumno)
-- ---------------------------------------------------------------
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
alter table public.alumnos add column if not exists coach_id uuid references public.perfiles(id) on delete set null;
alter table public.alumnos add column if not exists codigo_vinculo text;
alter table public.alumnos alter column codigo_vinculo set default upper(substr(md5(gen_random_uuid()::text), 1, 8));
update public.alumnos set codigo_vinculo = upper(substr(md5(gen_random_uuid()::text), 1, 8)) where codigo_vinculo is null;
create unique index if not exists alumnos_codigo_vinculo_key on public.alumnos (codigo_vinculo);

create table if not exists public.alumno_usuarios (
  alumno_id uuid not null references public.alumnos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (alumno_id, user_id)
);

-- ---------------------------------------------------------------
-- 3. FUNCIONES DE AYUDA para los permisos
-- ---------------------------------------------------------------
create or replace function public.rol_actual()
returns text
language sql stable
security definer set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid();
$$;

create or replace function public.es_dueno()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select coalesce((select rol = 'dueño' from public.perfiles where id = auth.uid()), false);
$$;

create or replace function public.es_staff()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select coalesce((select rol in ('dueño','profe') from public.perfiles where id = auth.uid()), false);
$$;

-- ¿Puede la cuenta actual ver a este alumno?
--   dueño → a todos · profe → a los suyos (o sin asignar)
--   alumno/papá → a los que ligó con su código
create or replace function public.puede_ver_alumno(p_alumno uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select
    exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'dueño')
    or exists (
      select 1
      from public.perfiles p
      join public.alumnos a on a.id = p_alumno
      where p.id = auth.uid() and p.rol = 'profe'
        and (a.coach_id = p.id or a.coach_id is null)
    )
    or exists (
      select 1 from public.alumno_usuarios au
      where au.alumno_id = p_alumno and au.user_id = auth.uid()
    );
$$;

-- El papá / alumno escribe el código que le dio la academia y queda
-- ligado a ese alumno. Funciona aunque no tenga el correo confirmado.
create or replace function public.vincular_alumno(p_codigo text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  select id into v_id from public.alumnos
   where upper(codigo_vinculo) = upper(trim(p_codigo));
  if v_id is null then
    raise exception 'Código no válido';
  end if;
  insert into public.alumno_usuarios (alumno_id, user_id)
  values (v_id, auth.uid())
  on conflict do nothing;
  return v_id;
end;
$$;
revoke execute on function public.vincular_alumno(text) from public, anon;
grant execute on function public.vincular_alumno(text) to authenticated;

-- ---------------------------------------------------------------
-- 4. DEMÁS TABLAS
-- ---------------------------------------------------------------

-- Bitácora / reportes que los profes escriben de cada alumno
create table if not exists public.bitacora (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid references public.alumnos(id) on delete cascade,
  tipo text,
  nota text,
  fecha timestamptz not null default now()
);
alter table public.bitacora add column if not exists autor text;

-- Agenda
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

-- Lista de asistencia: quién fue al entrenamiento de qué día y sede
create table if not exists public.asistencias (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumnos(id) on delete cascade,
  fecha date not null,
  sede text,
  presente boolean not null default true,
  registrado_por text,
  creado_en timestamptz not null default now(),
  unique (alumno_id, fecha, sede)
);

-- Solicitudes de clase de prueba (las manda una cuenta con sesión)
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
alter table public.solicitudes add column if not exists user_id uuid default auth.uid();

-- Inscripciones (botón "Inscribirme" del sitio)
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
alter table public.inscripciones add column if not exists user_id uuid default auth.uid();

-- Pagos y suscripciones
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

-- Check-in (llegada, con foto) y check-out (salida, con resumen)
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sede text,
  foto_url text,
  estado text not null default 'guardado',
  fecha timestamptz not null default now()
);
alter table public.checkins add column if not exists tipo text not null default 'entrada';
alter table public.checkins add column if not exists resumen text;
alter table public.checkins add column if not exists foto_path text;
alter table public.checkins add column if not exists registrado_por uuid default auth.uid();

-- Objetivos por categoría (sección de profes)
create table if not exists public.objetivos_categoria (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  profe text,
  titulo text not null,
  detalle text,
  fecha timestamptz not null default now()
);

-- Evidencias que sube el alumno (gym, comidas del plan de nutrición…)
create table if not exists public.evidencias (
  id uuid primary key default gen_random_uuid(),
  alumno_nombre text not null,
  tipo text not null,
  comentario text,
  foto_path text,
  fecha timestamptz not null default now()
);
alter table public.evidencias add column if not exists alumno_id uuid references public.alumnos(id) on delete cascade;
alter table public.evidencias add column if not exists user_id uuid default auth.uid();

-- Chat: canales por categoría (1ra/2da/3ra/4ta división, abiertos a toda la
-- academia) y mensajes directos alumno/papá <-> profe (sobre un alumno puntual).
-- El nombre y rol del autor se guardan en el mensaje (igual que en checkins/
-- evidencias) porque un alumno no tiene permiso para leer los perfiles de
-- otras personas, así que no podría "buscar" el nombre de quien escribió.
create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('categoria', 'directo')),
  categoria text,
  profe_id uuid references public.perfiles(id) on delete cascade,
  alumno_id uuid references public.alumnos(id) on delete cascade,
  autor_id uuid not null references public.perfiles(id),
  autor_nombre text not null,
  autor_rol text not null,
  contenido text not null,
  creado_en timestamptz not null default now(),
  constraint mensajes_forma check (
    (tipo = 'categoria' and categoria is not null and profe_id is null and alumno_id is null)
    or
    (tipo = 'directo' and profe_id is not null and alumno_id is not null and categoria is null)
  )
);

-- Contacto para plan personalizado y configuración
create table if not exists public.contactos (
  id uuid primary key default gen_random_uuid(),
  nombre text,
  contacto text,
  mensaje text,
  fecha timestamptz not null default now()
);
create table if not exists public.config (
  clave text primary key,
  valor jsonb
);
insert into public.config (clave, valor) values ('costos_fijos_mxn', '45000')
  on conflict (clave) do nothing;

-- Buckets de fotos (públicos: son fotos de bajo riesgo y las rutas
-- son al azar, así no hace falta armar links firmados)
insert into storage.buckets (id, name, public) values ('evidencias', 'evidencias', true)
  on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('checkins', 'checkins', true)
  on conflict (id) do update set public = true;

-- ---------------------------------------------------------------
-- 5. PERMISOS (Row Level Security)
-- ---------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.alumnos enable row level security;
alter table public.alumno_usuarios enable row level security;
alter table public.bitacora enable row level security;
alter table public.reservas enable row level security;
alter table public.asistencias enable row level security;
alter table public.solicitudes enable row level security;
alter table public.inscripciones enable row level security;
alter table public.pagos enable row level security;
alter table public.checkins enable row level security;
alter table public.objetivos_categoria enable row level security;
alter table public.evidencias enable row level security;
alter table public.contactos enable row level security;
alter table public.config enable row level security;

-- Borra TODOS los permisos anteriores de las tablas de arriba: los
-- permisos se suman, así que uno viejo demasiado abierto anularía a
-- los nuevos. Acá abajo se vuelven a crear los correctos.
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- perfiles: cada quien ve el suyo; el staff ve a todos. Nadie puede
-- cambiarse su propio rol; el dueño sí puede cambiar el de cualquiera.
create policy "perfiles ver" on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_staff());
create policy "perfiles crear propio" on public.perfiles for insert to authenticated
  with check (id = auth.uid() and rol = 'alumno');
create policy "perfiles editar propio" on public.perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and rol = public.rol_actual());
create policy "perfiles dueno edita" on public.perfiles for update to authenticated
  using (public.es_dueno()) with check (public.es_dueno());

-- alumnos: cada rol ve lo suyo (ver puede_ver_alumno); solo el dueño
-- da de alta o baja; el staff edita las fichas que puede ver.
create policy "alumnos ver" on public.alumnos for select to authenticated
  using (public.puede_ver_alumno(id));
create policy "alumnos alta" on public.alumnos for insert to authenticated
  with check (public.es_dueno());
create policy "alumnos editar" on public.alumnos for update to authenticated
  using (public.es_staff() and public.puede_ver_alumno(id))
  with check (public.es_staff() and public.puede_ver_alumno(id));
create policy "alumnos baja" on public.alumnos for delete to authenticated
  using (public.es_dueno());

create policy "vinculos ver" on public.alumno_usuarios for select to authenticated
  using (user_id = auth.uid() or public.es_dueno());
create policy "vinculos baja" on public.alumno_usuarios for delete to authenticated
  using (public.es_dueno());

-- bitácora / reportes: los ve quien puede ver al alumno; los escribe el staff
create policy "bitacora ver" on public.bitacora for select to authenticated
  using (alumno_id is not null and public.puede_ver_alumno(alumno_id));
create policy "bitacora escribir" on public.bitacora for insert to authenticated
  with check (public.es_staff() and public.puede_ver_alumno(alumno_id));
create policy "bitacora editar" on public.bitacora for update to authenticated
  using (public.es_staff() and public.puede_ver_alumno(alumno_id));
create policy "bitacora borrar" on public.bitacora for delete to authenticated
  using (public.es_staff() and public.puede_ver_alumno(alumno_id));

-- agenda: el staff ve todo el calendario; el alumno solo sus sesiones
create policy "reservas ver" on public.reservas for select to authenticated
  using (public.es_staff() or (alumno_id is not null and public.puede_ver_alumno(alumno_id)));
create policy "reservas crear" on public.reservas for insert to authenticated
  with check (public.es_staff());
create policy "reservas editar" on public.reservas for update to authenticated
  using (public.es_staff());
create policy "reservas borrar" on public.reservas for delete to authenticated
  using (public.es_staff());

-- asistencia
create policy "asistencias ver" on public.asistencias for select to authenticated
  using (public.puede_ver_alumno(alumno_id));
create policy "asistencias crear" on public.asistencias for insert to authenticated
  with check (public.es_staff() and public.puede_ver_alumno(alumno_id));
create policy "asistencias editar" on public.asistencias for update to authenticated
  using (public.es_staff() and public.puede_ver_alumno(alumno_id))
  with check (public.es_staff() and public.puede_ver_alumno(alumno_id));
create policy "asistencias borrar" on public.asistencias for delete to authenticated
  using (public.es_staff() and public.puede_ver_alumno(alumno_id));

-- solicitudes de clase de prueba: cualquiera con sesión manda la suya
-- y ve solo las suyas; el staff ve y gestiona todas.
create policy "solicitudes ver" on public.solicitudes for select to authenticated
  using (public.es_staff() or user_id = auth.uid());
create policy "solicitudes crear" on public.solicitudes for insert to authenticated
  with check (user_id = auth.uid());
create policy "solicitudes editar" on public.solicitudes for update to authenticated
  using (public.es_staff());

-- inscripciones: igual, pero las gestiona solo el dueño (es plata)
create policy "inscripciones ver" on public.inscripciones for select to authenticated
  using (public.es_dueno() or user_id = auth.uid());
create policy "inscripciones crear" on public.inscripciones for insert to authenticated
  with check (user_id = auth.uid());
create policy "inscripciones editar" on public.inscripciones for update to authenticated
  using (public.es_dueno());

-- pagos: los ve y maneja el dueño; el alumno/papá ve los de su alumno
create policy "pagos ver" on public.pagos for select to authenticated
  using (
    public.es_dueno()
    or (alumno_id is not null and exists (
      select 1 from public.alumno_usuarios au
      where au.alumno_id = pagos.alumno_id and au.user_id = auth.uid()
    ))
  );
create policy "pagos crear" on public.pagos for insert to authenticated
  with check (public.es_dueno());
create policy "pagos editar" on public.pagos for update to authenticated
  using (public.es_dueno());
create policy "pagos borrar" on public.pagos for delete to authenticated
  using (public.es_dueno());

-- check-in / check-out: el dueño ve todos; cada profe los suyos
create policy "checkins ver" on public.checkins for select to authenticated
  using (public.es_dueno() or registrado_por = auth.uid());
create policy "checkins crear" on public.checkins for insert to authenticated
  with check (public.es_staff() and registrado_por = auth.uid());
create policy "checkins editar" on public.checkins for update to authenticated
  using (public.es_dueno() or registrado_por = auth.uid());

-- objetivos por categoría: los ve cualquiera con sesión; los publica el staff
create policy "objetivos ver" on public.objetivos_categoria for select to authenticated
  using (true);
create policy "objetivos crear" on public.objetivos_categoria for insert to authenticated
  with check (public.es_staff());
create policy "objetivos editar" on public.objetivos_categoria for update to authenticated
  using (public.es_staff());
create policy "objetivos borrar" on public.objetivos_categoria for delete to authenticated
  using (public.es_staff());

-- evidencias: las sube el alumno/papá (o el staff a nombre de un alumno)
create policy "evidencias ver" on public.evidencias for select to authenticated
  using (user_id = auth.uid() or (alumno_id is not null and public.puede_ver_alumno(alumno_id)));
create policy "evidencias crear" on public.evidencias for insert to authenticated
  with check (user_id = auth.uid() and (alumno_id is null or public.puede_ver_alumno(alumno_id)));
create policy "evidencias borrar" on public.evidencias for delete to authenticated
  using (public.es_staff());

-- chat: los canales por categoría los ve y escribe cualquiera con sesión;
-- los mensajes directos solo los ve el profe del hilo, el dueño, o quien
-- pueda ver a ese alumno (el papá/alumno ligado, o su profe asignado).
alter table public.mensajes enable row level security;
create policy "mensajes categoria ver" on public.mensajes for select to authenticated
  using (tipo = 'categoria');
create policy "mensajes categoria escribir" on public.mensajes for insert to authenticated
  with check (tipo = 'categoria' and autor_id = auth.uid());
create policy "mensajes directo ver" on public.mensajes for select to authenticated
  using (
    tipo = 'directo'
    and (public.es_dueno() or profe_id = auth.uid() or public.puede_ver_alumno(alumno_id))
  );
create policy "mensajes directo escribir" on public.mensajes for insert to authenticated
  with check (
    tipo = 'directo' and autor_id = auth.uid()
    and (profe_id = auth.uid() or public.puede_ver_alumno(alumno_id))
  );

-- solo el dueño toca contactos y configuración
create policy "contactos dueno" on public.contactos for all to authenticated
  using (public.es_dueno()) with check (public.es_dueno());
create policy "config dueno" on public.config for all to authenticated
  using (public.es_dueno()) with check (public.es_dueno());

-- fotos: subir requiere sesión
drop policy if exists "logueado sube evidencias" on storage.objects;
drop policy if exists "logueado sube fotos" on storage.objects;
create policy "logueado sube fotos" on storage.objects for insert to authenticated
  with check (bucket_id in ('evidencias', 'checkins'));
