create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  invite_code text not null unique,
  event_date date,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.tasks(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  category text not null default 'Allgemein'
    check (category in ('Allgemein', 'Henna-Abend', 'Standesamt', 'Hochzeitsfeier', 'Dienstleister', 'Kleidung', 'Gäste')),
  due_date date,
  estimated_cost numeric(12, 2) check (estimated_cost is null or estimated_cost >= 0),
  is_paid boolean not null default false,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create unique index if not exists workspace_members_one_workspace_per_user_idx on public.workspace_members(user_id);
create index if not exists tasks_workspace_due_date_idx on public.tasks(workspace_id, due_date);
create index if not exists tasks_parent_id_idx on public.tasks(parent_id);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

create or replace function public.create_wedding_workspace(workspace_name text, wedding_date date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  created_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'Bitte melde dich zuerst an.';
  end if;

  if char_length(trim(workspace_name)) not between 1 and 60 then
    raise exception 'Der Name muss zwischen 1 und 60 Zeichen lang sein.';
  end if;

  if exists (
    select 1 from public.workspace_members
    where user_id = current_user_id
  ) then
    raise exception 'Dein Konto ist bereits mit einem Hochzeitsbereich verbunden.';
  end if;

  insert into public.workspaces (name, invite_code, event_date, owner_id)
  values (
    trim(workspace_name),
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    wedding_date,
    current_user_id
  )
  returning id into created_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (created_workspace_id, current_user_id, 'owner');

  return created_workspace_id;
end;
$$;

revoke all on function public.create_wedding_workspace(text, date) from public, anon;
grant execute on function public.create_wedding_workspace(text, date) to authenticated;

create or replace function public.join_wedding_workspace(workspace_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  matching_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'Bitte melde dich zuerst an.';
  end if;

  select id into matching_workspace_id
  from public.workspaces
  where invite_code = upper(trim(workspace_invite_code))
  for update;

  if matching_workspace_id is null then
    raise exception 'Der Einladungscode ist ungültig. Bitte prüft den Code und versucht es erneut.';
  end if;

  if exists (
    select 1 from public.workspace_members
    where user_id = current_user_id
      and workspace_id <> matching_workspace_id
  ) then
    raise exception 'Dein Konto ist bereits mit einem anderen Hochzeitsbereich verbunden.';
  end if;

  if not exists (
    select 1 from public.workspace_members
    where workspace_id = matching_workspace_id
      and user_id = current_user_id
  ) and (
    select count(*) from public.workspace_members
    where workspace_id = matching_workspace_id
  ) >= 2 then
    raise exception 'Dieser Hochzeitsbereich ist bereits vollständig. Ein Bereich ist für zwei Personen gedacht.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (matching_workspace_id, current_user_id, 'member')
  on conflict (workspace_id, user_id) do nothing;

  return matching_workspace_id;
end;
$$;

revoke all on function public.join_wedding_workspace(text) from public, anon;
grant execute on function public.join_wedding_workspace(text) to authenticated;

create or replace function public.prevent_workspace_identity_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id or new.invite_code is distinct from old.invite_code then
    raise exception 'Inhaberschaft und Einladungscode können nicht geändert werden.';
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_prevent_owner_change on public.workspaces;
drop trigger if exists workspaces_prevent_identity_change on public.workspaces;
create trigger workspaces_prevent_identity_change
before update of owner_id, invite_code on public.workspaces
for each row execute function public.prevent_workspace_identity_change();

create or replace function public.validate_task_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_workspace_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Eine Aufgabe kann nicht ihre eigene Unteraufgabe sein.';
  end if;

  select workspace_id into parent_workspace_id
  from public.tasks
  where id = new.parent_id;

  if parent_workspace_id is distinct from new.workspace_id then
    raise exception 'Unteraufgaben müssen zum selben Hochzeitsbereich gehören.';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_validate_parent on public.tasks;
create trigger tasks_validate_parent
before insert or update of parent_id, workspace_id on public.tasks
for each row execute function public.validate_task_parent();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "Members can read their workspaces" on public.workspaces;
create policy "Members can read their workspaces"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

drop policy if exists "Workspace owners can update their workspaces" on public.workspaces;
drop policy if exists "Members can update their workspaces" on public.workspaces;
create policy "Members can update their workspaces"
on public.workspaces for update to authenticated
using (public.is_workspace_member(id))
with check (public.is_workspace_member(id));

drop policy if exists "Members can read workspace membership" on public.workspace_members;
create policy "Members can read workspace membership"
on public.workspace_members for select to authenticated
using (user_id = (select auth.uid()) or public.is_workspace_member(workspace_id));

drop policy if exists "Members can read workspace tasks" on public.tasks;
create policy "Members can read workspace tasks"
on public.tasks for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "Members can create workspace tasks" on public.tasks;
create policy "Members can create workspace tasks"
on public.tasks for insert to authenticated
with check (
  public.is_workspace_member(workspace_id)
  and created_by = (select auth.uid())
);

drop policy if exists "Members can update workspace tasks" on public.tasks;
create policy "Members can update workspace tasks"
on public.tasks for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "Members can delete workspace tasks" on public.tasks;
create policy "Members can delete workspace tasks"
on public.tasks for delete to authenticated
using (public.is_workspace_member(workspace_id));

grant usage on schema public to authenticated;
grant select, update on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    execute 'alter publication supabase_realtime add table public.tasks';
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspaces'
  ) then
    execute 'alter publication supabase_realtime add table public.workspaces';
  end if;
end;
$$;
