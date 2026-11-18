-- Mini Inventario: esquema completo (docs/diseno.md §4.1 a §4.5)

-- ============================================================
-- 4.1 Tabla productos
-- ============================================================
create table public.productos (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users(id) on delete cascade,
  nombre      text        not null check (length(trim(nombre)) between 1 and 100),
  sku         text        not null check (length(trim(sku)) between 1 and 50),
  cantidad    integer     not null default 0 check (cantidad >= 0),
  minimo      integer     not null check (minimo >= 0),
  created_at  timestamptz not null default now()
);

-- SKU único por usuaria, sin distinguir mayúsculas. Empieza por user_id,
-- así que también sirve al filtro de RLS y al "on delete cascade".
create unique index productos_user_sku_unico
  on public.productos (user_id, lower(trim(sku)));

-- ============================================================
-- 4.2 Tabla movimientos
-- ============================================================
create table public.movimientos (
  id           uuid        primary key default gen_random_uuid(),
  producto_id  uuid        not null references public.productos(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  tipo         text        not null check (tipo in ('inicial', 'entrada', 'salida')),
  unidades     integer     not null check (unidades >= 0),
  nota         text        check (nota is null or length(nota) <= 200),
  created_at   timestamptz not null default now(),
  check (tipo = 'inicial' or unidades > 0)
);

create index movimientos_producto_fecha
  on public.movimientos (producto_id, created_at desc);

-- Índice de la llave foránea user_id: lo usan el filtro de RLS y el "on delete cascade".
create index movimientos_user_id on public.movimientos (user_id);

-- ============================================================
-- Row Level Security y permisos (4.5)
-- ============================================================
alter table public.productos   enable row level security;
alter table public.movimientos enable row level security;

create policy "productos_select_propios" on public.productos
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "productos_insert_propios" on public.productos
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "productos_update_propios" on public.productos
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "productos_delete_propios" on public.productos
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- movimientos: solo lectura de lo propio; escriben el trigger y la función.
create policy "movimientos_select_propios" on public.movimientos
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Sin sesión no hay acceso; la cantidad no se edita directamente (HU3-3).
revoke all on public.productos   from anon, authenticated;
revoke all on public.movimientos from anon, authenticated;
grant select, insert, delete on public.productos to authenticated;
grant update (nombre, sku, minimo) on public.productos to authenticated;
grant select on public.movimientos to authenticated;

-- ============================================================
-- Trigger: movimiento "inicial" al crear un producto (HU4-4)
-- security definer porque las usuarias no tienen insert en movimientos.
-- ============================================================
create function public.crear_movimiento_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.movimientos (producto_id, user_id, tipo, unidades)
  values (new.id, new.user_id, 'inicial', new.cantidad);
  return new;
end;
$$;

revoke all on function public.crear_movimiento_inicial() from public, anon, authenticated;

create trigger productos_movimiento_inicial
  after insert on public.productos
  for each row execute function public.crear_movimiento_inicial();

-- ============================================================
-- 4.3 Función registrar_movimiento
-- security definer porque cambia productos.cantidad (sin update para el rol)
-- e inserta en movimientos. Solo toca filas de auth.uid().
-- Los errores viajan en el mensaje: NO_ENCONTRADO y STOCK_INSUFICIENTE.
-- ============================================================
create function public.registrar_movimiento(
  producto_id uuid,
  tipo        text,
  unidades    integer,
  nota        text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuaria  uuid := auth.uid();
  v_cambio   integer;
  v_cantidad integer;
begin
  if v_usuaria is null then
    raise exception 'NO_ENCONTRADO';
  end if;
  if tipo is distinct from 'entrada' and tipo is distinct from 'salida' then
    raise exception 'TIPO_INVALIDO';
  end if;
  if unidades is null or unidades <= 0 then
    raise exception 'UNIDADES_INVALIDAS';
  end if;

  v_cambio := case when tipo = 'entrada' then unidades else -unidades end;

  -- Comprobación y resta en un solo update: dos salidas simultáneas no pueden
  -- dejar el stock en negativo.
  update public.productos p
     set cantidad = p.cantidad + v_cambio
   where p.id = registrar_movimiento.producto_id
     and p.user_id = v_usuaria
     and p.cantidad + v_cambio >= 0
  returning p.cantidad into v_cantidad;

  if not found then
    if exists (
      select 1 from public.productos p
       where p.id = registrar_movimiento.producto_id and p.user_id = v_usuaria
    ) then
      raise exception 'STOCK_INSUFICIENTE';
    end if;
    raise exception 'NO_ENCONTRADO';
  end if;

  insert into public.movimientos (producto_id, user_id, tipo, unidades, nota)
  values (registrar_movimiento.producto_id, v_usuaria, tipo, unidades, nota);

  return v_cantidad;
end;
$$;

revoke all on function public.registrar_movimiento(uuid, text, integer, text) from public, anon;
grant execute on function public.registrar_movimiento(uuid, text, integer, text) to authenticated;

-- ============================================================
-- 4.4 Vista productos_bajo_minimo (HU5)
-- security_invoker: respeta el RLS de quien consulta.
-- ============================================================
create view public.productos_bajo_minimo with (security_invoker = true) as
  select id, nombre, sku, cantidad, minimo, (minimo - cantidad + 1) as faltan
  from public.productos
  where cantidad <= minimo;

revoke all on public.productos_bajo_minimo from anon, authenticated;
grant select on public.productos_bajo_minimo to authenticated;
