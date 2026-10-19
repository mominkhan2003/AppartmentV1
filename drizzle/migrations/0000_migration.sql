
create type public.app_role as enum ('admin', 'resident');
create type public.space_kind as enum ('bedroom','kitchen','hall','balcony','washroom','storage','other');
create type public.expense_kind as enum ('shared','claim');
create type public.expense_status as enum ('pending','approved','rejected','voided');
create type public.ledger_kind as enum ('share','claim_credit','payment','adjustment');
create type public.chore_kind as enum ('washroom','hall','kitchen','garbage','other');
create type public.chore_event_type as enum ('complete','skip','reassign','reset','report_needed');
create type public.issue_status as enum ('open','acknowledged','in_progress','resolved');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin')
$$;
create policy "read own roles or admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind space_kind not null,
  shape jsonb not null default '[]'::jsonb,
  capacity int not null default 0,
  notes text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.spaces to authenticated;
grant all on public.spaces to service_role;
alter table public.spaces enable row level security;
create policy "spaces readable" on public.spaces for select to authenticated using (true);
create policy "spaces admin write" on public.spaces for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.washroom_access (
  washroom_id uuid not null references public.spaces(id) on delete cascade,
  bedroom_id uuid not null references public.spaces(id) on delete cascade,
  primary key (washroom_id, bedroom_id)
);
grant select, insert, update, delete on public.washroom_access to authenticated;
grant all on public.washroom_access to service_role;
alter table public.washroom_access enable row level security;
create policy "wa readable" on public.washroom_access for select to authenticated using (true);
create policy "wa admin write" on public.washroom_access for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.residents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  display_name text not null,
  email text unique,
  phone text,
  room_id uuid references public.spaces(id) on delete set null,
  active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.residents to authenticated;
grant all on public.residents to service_role;
alter table public.residents enable row level security;
create policy "residents readable" on public.residents for select to authenticated using (true);
create policy "residents admin insert" on public.residents for insert to authenticated with check (public.is_admin());
create policy "residents admin delete" on public.residents for delete to authenticated using (public.is_admin());
create policy "residents update self or admin" on public.residents for update to authenticated
  using (public.is_admin() or user_id = auth.uid()) with check (public.is_admin() or user_id = auth.uid());

create or replace function public.my_resident_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.residents where user_id = auth.uid()
$$;

create or replace function public.guard_resident_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.room_id is distinct from old.room_id or new.active is distinct from old.active
       or new.user_id is distinct from old.user_id or new.email is distinct from old.email then
      raise exception 'Only the admin can change room, status, email or account link';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_resident_update before update on public.residents
  for each row execute function public.guard_resident_update();

create table public.household_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.household_groups to authenticated;
grant all on public.household_groups to service_role;
alter table public.household_groups enable row level security;

create table public.group_members (
  group_id uuid not null references public.household_groups(id) on delete cascade,
  resident_id uuid not null references public.residents(id) on delete cascade,
  primary key (group_id, resident_id)
);
grant select, insert, update, delete on public.group_members to authenticated;
grant all on public.group_members to service_role;
alter table public.group_members enable row level security;

create or replace function public.in_group(_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members gm
    join public.residents r on r.id = gm.resident_id
    where gm.group_id = _group_id and r.user_id = auth.uid())
$$;

create policy "groups readable" on public.household_groups for select to authenticated using (true);
create policy "groups admin write" on public.household_groups for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "members readable" on public.group_members for select to authenticated using (true);
create policy "members admin write" on public.group_members for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "audit admin read" on public.audit_log for select to authenticated using (public.is_admin());

create or replace function public.log_audit(_action text, _entity text, _entity_id text, _details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log(actor_id, action, entity, entity_id, details) values (auth.uid(), _action, _entity, _entity_id, coalesce(_details,'{}'::jsonb));
$$;
revoke execute on function public.log_audit(text,text,text,jsonb) from public, anon, authenticated;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  kind expense_kind not null,
  group_id uuid references public.household_groups(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 2000),
  category text not null default 'general',
  amount_cents bigint not null check (amount_cents > 0),
  expense_date date not null default current_date,
  payer_resident_id uuid references public.residents(id),
  items jsonb,
  notes text,
  receipt_path text,
  receipt_hash text,
  status expense_status not null default 'pending',
  created_by uuid not null default auth.uid(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create unique index expenses_receipt_hash_uniq on public.expenses(receipt_hash) where receipt_hash is not null and status <> 'rejected';
grant select, insert on public.expenses to authenticated;
grant all on public.expenses to service_role;
alter table public.expenses enable row level security;
create policy "expenses visible" on public.expenses for select to authenticated using (
  public.is_admin() or created_by = auth.uid() or (group_id is null) or public.in_group(group_id)
);
create policy "residents submit claims" on public.expenses for insert to authenticated with check (
  kind = 'claim' and status = 'pending' and created_by = auth.uid()
  and payer_resident_id = public.my_resident_id()
  and (group_id is null or public.in_group(group_id))
);

create table public.expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete restrict,
  resident_id uuid not null references public.residents(id),
  amount_cents bigint not null,
  unique (expense_id, resident_id)
);
grant select on public.expense_shares to authenticated;
grant all on public.expense_shares to service_role;
alter table public.expense_shares enable row level security;
create policy "shares visible" on public.expense_shares for select to authenticated using (
  public.is_admin() or resident_id = public.my_resident_id()
  or exists (select 1 from public.expenses e where e.id = expense_id and (e.group_id is null or public.in_group(e.group_id)))
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id),
  kind ledger_kind not null,
  amount_cents bigint not null,
  expense_id uuid references public.expenses(id),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
grant select on public.ledger_entries to authenticated;
grant all on public.ledger_entries to service_role;
alter table public.ledger_entries enable row level security;
create policy "ledger own or admin" on public.ledger_entries for select to authenticated using (
  public.is_admin() or resident_id = public.my_resident_id()
);

create view public.resident_balances with (security_invoker = true) as
  select r.id as resident_id,
    coalesce(sum(l.amount_cents),0)::bigint as balance_cents,
    coalesce(sum(case when l.kind='share' then -l.amount_cents else 0 end),0)::bigint as shares_cents,
    coalesce(sum(case when l.kind='claim_credit' then l.amount_cents else 0 end),0)::bigint as credits_cents,
    coalesce(sum(case when l.kind='payment' then l.amount_cents else 0 end),0)::bigint as payments_cents,
    coalesce(sum(case when l.kind='adjustment' then l.amount_cents else 0 end),0)::bigint as adjustments_cents
  from public.residents r join public.ledger_entries l on l.resident_id = r.id
  group by r.id;
grant select on public.resident_balances to authenticated;

create or replace function public._apply_split(_expense_id uuid, _amount bigint, _participants uuid[], _custom jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare n int; base bigint; rem bigint; i int := 0; pid uuid; amt bigint; total bigint := 0; k text; v text;
begin
  if _custom is not null and jsonb_typeof(_custom) = 'object' and _custom <> '{}'::jsonb then
    for k, v in select key, value from jsonb_each_text(_custom) loop
      pid := k::uuid; amt := v::bigint;
      if amt < 0 then raise exception 'Negative share'; end if;
      if amt = 0 then continue; end if;
      insert into expense_shares(expense_id, resident_id, amount_cents) values (_expense_id, pid, amt);
      insert into ledger_entries(resident_id, kind, amount_cents, expense_id, note) values (pid, 'share', -amt, _expense_id, 'Share of expense');
      total := total + amt;
    end loop;
    if total <> _amount then raise exception 'Custom shares (%) must add up to the total (%)', total, _amount; end if;
    return;
  end if;
  n := coalesce(array_length(_participants,1),0);
  if n = 0 then raise exception 'Select at least one participant'; end if;
  base := _amount / n; rem := _amount - base * n;
  foreach pid in array _participants loop
    i := i + 1;
    amt := base + case when i <= rem then 1 else 0 end;
    insert into expense_shares(expense_id, resident_id, amount_cents) values (_expense_id, pid, amt);
    insert into ledger_entries(resident_id, kind, amount_cents, expense_id, note) values (pid, 'share', -amt, _expense_id, 'Share of expense');
  end loop;
end $$;
revoke execute on function public._apply_split(uuid,bigint,uuid[],jsonb) from public, anon, authenticated;

create or replace function public.record_shared_expense(
  _title text, _description text, _category text, _amount_cents bigint, _expense_date date,
  _group_id uuid, _participants uuid[], _custom jsonb, _receipt_path text, _receipt_hash text, _notes text, _items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare eid uuid; p uuid; k text;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if _amount_cents is null or _amount_cents <= 0 then raise exception 'Amount must be positive'; end if;
  if _group_id is not null then
    foreach p in array coalesce(_participants,'{}') loop
      if not exists (select 1 from group_members where group_id=_group_id and resident_id=p) then
        raise exception 'All participants must belong to the selected group';
      end if;
    end loop;
    if _custom is not null and jsonb_typeof(_custom)='object' then
      for k in select jsonb_object_keys(_custom) loop
        if not exists (select 1 from group_members where group_id=_group_id and resident_id=k::uuid) then
          raise exception 'All participants must belong to the selected group';
        end if;
      end loop;
    end if;
  end if;
  insert into expenses(kind, group_id, title, description, category, amount_cents, expense_date, payer_resident_id,
    receipt_path, receipt_hash, notes, items, status, reviewed_by, reviewed_at)
  values ('shared', _group_id, _title, _description, coalesce(_category,'general'), _amount_cents, coalesce(_expense_date,current_date), null,
    _receipt_path, _receipt_hash, _notes, _items, 'approved', auth.uid(), now())
  returning id into eid;
  perform public._apply_split(eid, _amount_cents, _participants, _custom);
  perform public.log_audit('record_shared_expense','expense',eid::text, jsonb_build_object('amount_cents',_amount_cents,'group_id',_group_id,'title',_title));
  return eid;
end $$;

create or replace function public.review_claim(_expense_id uuid, _approve boolean, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare e expenses%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select * into e from expenses where id = _expense_id for update;
  if not found then raise exception 'Claim not found'; end if;
  if e.kind <> 'claim' then raise exception 'Not a claim'; end if;
  if e.status <> 'pending' then raise exception 'Claim already reviewed'; end if;
  if e.created_by = auth.uid() or e.payer_resident_id = public.my_resident_id() then raise exception 'You cannot review your own claim'; end if;
  update expenses set status = case when _approve then 'approved'::expense_status else 'rejected'::expense_status end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = _note where id = _expense_id;
  if _approve then
    insert into ledger_entries(resident_id, kind, amount_cents, expense_id, note)
    values (e.payer_resident_id, 'claim_credit', e.amount_cents, e.id, 'Approved reimbursement: ' || e.title);
  end if;
  perform public.log_audit(case when _approve then 'approve_claim' else 'reject_claim' end,'expense',_expense_id::text, jsonb_build_object('note',_note,'amount_cents',e.amount_cents));
end $$;

create or replace function public.void_expense(_expense_id uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e expenses%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'A reason is required'; end if;
  select * into e from expenses where id = _expense_id for update;
  if e.status <> 'approved' then raise exception 'Only approved entries can be voided'; end if;
  insert into ledger_entries(resident_id, kind, amount_cents, expense_id, note)
    select resident_id, 'adjustment', -sum(amount_cents), _expense_id, 'Reversal: ' || _reason
    from ledger_entries where expense_id = _expense_id group by resident_id having sum(amount_cents) <> 0;
  update expenses set status = 'voided', review_note = coalesce(review_note || ' | ','') || 'Voided: ' || _reason where id = _expense_id;
  perform public.log_audit('void_expense','expense',_expense_id::text, jsonb_build_object('reason',_reason));
end $$;

create or replace function public.record_payment(_resident_id uuid, _amount_cents bigint, _note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if _amount_cents = 0 then raise exception 'Amount cannot be zero'; end if;
  insert into ledger_entries(resident_id, kind, amount_cents, note) values (_resident_id, 'payment', _amount_cents, _note);
  perform public.log_audit('record_payment','resident',_resident_id::text, jsonb_build_object('amount_cents',_amount_cents,'note',_note));
end $$;

create or replace function public.add_adjustment(_resident_id uuid, _amount_cents bigint, _reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'A reason is required'; end if;
  insert into ledger_entries(resident_id, kind, amount_cents, note) values (_resident_id, 'adjustment', _amount_cents, _reason);
  perform public.log_audit('add_adjustment','resident',_resident_id::text, jsonb_build_object('amount_cents',_amount_cents,'reason',_reason));
end $$;

create or replace function public.audit_expense_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'claim' then perform public.log_audit('submit_claim','expense',new.id::text, jsonb_build_object('amount_cents',new.amount_cents,'title',new.title)); end if;
  return new;
end $$;
create trigger trg_audit_expense_insert after insert on public.expenses for each row execute function public.audit_expense_insert();

create table public.chores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind chore_kind not null,
  space_id uuid references public.spaces(id) on delete set null,
  frequency_days int not null default 7 check (frequency_days between 1 and 60),
  rotates boolean not null default true,
  current_resident_id uuid references public.residents(id) on delete set null,
  next_due date not null default current_date,
  needed_reported_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.chores to authenticated;
grant all on public.chores to service_role;
alter table public.chores enable row level security;
create policy "chores readable" on public.chores for select to authenticated using (true);
create policy "chores admin write" on public.chores for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.chore_members (
  chore_id uuid not null references public.chores(id) on delete cascade,
  resident_id uuid not null references public.residents(id) on delete cascade,
  position int not null default 0,
  primary key (chore_id, resident_id)
);
grant select, insert, update, delete on public.chore_members to authenticated;
grant all on public.chore_members to service_role;
alter table public.chore_members enable row level security;
create policy "cm readable" on public.chore_members for select to authenticated using (true);
create policy "cm admin write" on public.chore_members for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.chore_events (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid not null references public.chores(id) on delete cascade,
  event_type chore_event_type not null,
  resident_id uuid references public.residents(id),
  target_resident_id uuid references public.residents(id),
  actor_id uuid default auth.uid(),
  reason text,
  photo_path text,
  due_date date,
  created_at timestamptz not null default now()
);
grant select on public.chore_events to authenticated;
grant all on public.chore_events to service_role;
alter table public.chore_events enable row level security;
create policy "ce readable" on public.chore_events for select to authenticated using (true);

create or replace function public.next_chore_member(_chore_id uuid, _after uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare cur_pos int; nxt uuid;
begin
  select position into cur_pos from chore_members where chore_id=_chore_id and resident_id=_after;
  if cur_pos is null then cur_pos := -1; end if;
  select cm.resident_id into nxt from chore_members cm join residents r on r.id=cm.resident_id
    where cm.chore_id=_chore_id and r.active and cm.position > cur_pos order by cm.position limit 1;
  if nxt is null then
    select cm.resident_id into nxt from chore_members cm join residents r on r.id=cm.resident_id
      where cm.chore_id=_chore_id and r.active order by cm.position limit 1;
  end if;
  return nxt;
end $$;

create or replace function public.complete_chore(_chore_id uuid, _note text, _photo_path text)
returns void language plpgsql security definer set search_path = public as $$
declare c chores%rowtype; me uuid := public.my_resident_id();
begin
  select * into c from chores where id=_chore_id for update;
  if not found then raise exception 'Chore not found'; end if;
  if c.current_resident_id is null then raise exception 'Nobody is assigned to this duty yet'; end if;
  if not public.is_admin() and (me is null or c.current_resident_id is distinct from me) then
    raise exception 'Only the assigned resident can mark this complete';
  end if;
  insert into chore_events(chore_id, event_type, resident_id, reason, photo_path, due_date)
    values (_chore_id, 'complete', c.current_resident_id, _note, _photo_path, c.next_due);
  update chores set
    current_resident_id = case when c.rotates then public.next_chore_member(_chore_id, c.current_resident_id) else c.current_resident_id end,
    next_due = greatest(current_date, c.next_due) + c.frequency_days,
    needed_reported_at = null
  where id=_chore_id;
end $$;

create or replace function public.admin_chore_action(_chore_id uuid, _action chore_event_type, _target uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c chores%rowtype; newcur uuid;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'A reason is required'; end if;
  select * into c from chores where id=_chore_id for update;
  if _action = 'skip' then newcur := public.next_chore_member(_chore_id, c.current_resident_id);
  elsif _action = 'reassign' then
    if not exists (select 1 from chore_members cm join residents r on r.id=cm.resident_id where cm.chore_id=_chore_id and cm.resident_id=_target and r.active) then
      raise exception 'Target must be an active member of this rotation'; end if;
    newcur := _target;
  elsif _action = 'reset' then newcur := public.next_chore_member(_chore_id, null);
  else raise exception 'Unsupported action'; end if;
  insert into chore_events(chore_id, event_type, resident_id, target_resident_id, reason)
    values (_chore_id, _action, c.current_resident_id, newcur, _reason);
  update chores set current_resident_id = newcur where id=_chore_id;
  perform public.log_audit('chore_'||_action::text,'chore',_chore_id::text, jsonb_build_object('reason',_reason,'target',newcur));
end $$;

create or replace function public.report_chore_needed(_chore_id uuid, _note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_resident_id() is null and not public.is_admin() then raise exception 'Not a resident'; end if;
  update chores set needed_reported_at = now() where id=_chore_id;
  insert into chore_events(chore_id, event_type, resident_id, reason) values (_chore_id, 'report_needed', public.my_resident_id(), _note);
end $$;

create or replace function public.on_resident_deactivated() returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if old.active and not new.active then
    for c in select id from chores where current_resident_id = new.id loop
      update chores set current_resident_id = public.next_chore_member(c.id, new.id) where id = c.id;
    end loop;
  end if;
  return new;
end $$;
create trigger trg_resident_deactivated after update on public.residents for each row execute function public.on_resident_deactivated();

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references public.spaces(id) on delete set null,
  category text not null default 'cleanliness',
  description text not null check (char_length(description) between 3 and 2000),
  photo_path text,
  reporter_id uuid not null default auth.uid(),
  reporter_resident_id uuid references public.residents(id),
  status issue_status not null default 'open',
  assigned_resident_id uuid references public.residents(id),
  admin_response text,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.issues to authenticated;
grant all on public.issues to service_role;
alter table public.issues enable row level security;
create policy "issues readable" on public.issues for select to authenticated using (true);
create policy "issues insert own" on public.issues for insert to authenticated with check (reporter_id = auth.uid() and status = 'open' and admin_response is null and assigned_resident_id is null);
create policy "issues admin update" on public.issues for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.touch_issue() returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at := now();
  perform public.log_audit('update_issue','issue',new.id::text, jsonb_build_object('status',new.status));
  return new; end $$;
create trigger trg_touch_issue before update on public.issues for each row execute function public.touch_issue();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles(user_id, role) values (new.id, 'resident');
  end if;
  select id into rid from public.residents where lower(email) = lower(new.email) and user_id is null;
  if rid is not null then
    update public.residents set user_id = new.id, is_sample = false where id = rid;
  else
    insert into public.residents(user_id, display_name, email)
    values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)), new.email);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.set_admin(_resident_id uuid, _make_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select user_id into uid from residents where id=_resident_id;
  if uid is null then raise exception 'Resident has no account yet'; end if;
  if _make_admin then insert into user_roles(user_id, role) values (uid,'admin') on conflict do nothing;
  else
    if uid = auth.uid() then raise exception 'You cannot remove your own admin role'; end if;
    delete from user_roles where user_id=uid and role='admin';
  end if;
  perform public.log_audit(case when _make_admin then 'grant_admin' else 'revoke_admin' end,'resident',_resident_id::text,'{}');
end $$;

create or replace function public.list_admin_residents()
returns setof uuid language sql stable security definer set search_path = public as $$
  select r.id from residents r join user_roles ur on ur.user_id = r.user_id and ur.role='admin'
$$;

create policy "upload own files" on storage.objects for insert to authenticated
  with check (bucket_id in ('receipts','photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read receipts" on storage.objects for select to authenticated using (
  bucket_id = 'receipts' and (
    public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.expenses e where e.receipt_path = name)
  ));
create policy "read photos" on storage.objects for select to authenticated using (bucket_id = 'photos');

insert into public.spaces(code, name, kind, shape, capacity, sort) values
 ('R1','Room 1','bedroom','[[220,40],[390,40],[390,112],[220,112]]',1,1),
 ('R2','Room 2','bedroom','[[482,55],[580,55],[580,130],[482,130]]',1,2),
 ('R3','Room 3','bedroom','[[482,130],[580,130],[580,245],[482,245]]',1,3),
 ('R4','Room 4','bedroom','[[482,245],[590,245],[590,335],[482,335]]',1,4),
 ('R5','Room 5','bedroom','[[482,335],[595,335],[595,440],[482,440]]',1,5),
 ('R6','Room 6','bedroom','[[488,440],[612,440],[612,525],[488,525]]',2,6),
 ('K','Kitchen','kitchen','[[220,112],[390,112],[390,150],[220,150]]',0,7),
 ('H','Hall','hall','[[218,150],[390,150],[390,78],[482,78],[482,475],[418,475],[418,350],[218,350]]',0,8),
 ('S','Storage','storage','[[390,52],[482,52],[482,78],[390,78]]',0,9),
 ('BAL','Balcony','balcony','[[80,105],[218,105],[218,350],[80,350]]',0,10),
 ('W','Toilet (W)','washroom','[[338,350],[418,350],[418,410],[338,410]]',0,11),
 ('BA','Bathroom (B)','washroom','[[330,410],[418,410],[418,475],[330,475]]',0,12),
 ('WB','Washroom + Bath (WB)','washroom','[[330,475],[488,475],[488,530],[330,530]]',0,13);
update public.spaces set notes = 'Currently unused' where code = 'S';

insert into public.residents(display_name, email, room_id, is_sample)
select v.n, v.e, s.id, true from (values
 ('Anna (sample)','anna@sample.flat','R1'),
 ('Ben (sample)','ben@sample.flat','R2'),
 ('Clara (sample)','clara@sample.flat','R3'),
 ('David (sample)','david@sample.flat','R4'),
 ('Eva (sample)','eva@sample.flat','R5'),
 ('Felix (sample)','felix@sample.flat','R6'),
 ('Greta (sample)','greta@sample.flat','R6')
) v(n,e,c) join public.spaces s on s.code = v.c;

insert into public.household_groups(name, description) values
 ('Group A','Shares groceries, food and agreed common purchases'),
 ('Group B','Manages their own food and groceries');
insert into public.group_members(group_id, resident_id)
select g.id, r.id from public.household_groups g, public.residents r
where (g.name='Group A' and r.email in ('anna@sample.flat','ben@sample.flat','clara@sample.flat','david@sample.flat','eva@sample.flat'))
   or (g.name='Group B' and r.email in ('felix@sample.flat','greta@sample.flat'));

insert into public.chores(name, kind, space_id, frequency_days)
select v.n, v.k::chore_kind, s.id, v.f from (values
 ('Hall & common areas','hall','H',7),
 ('Kitchen cleaning','kitchen','K',7),
 ('Garbage disposal','garbage',null,2),
 ('Toilet (W) cleaning','washroom','W',7),
 ('Bathroom (B) cleaning','washroom','BA',7),
 ('Washroom + Bath (WB) cleaning','washroom','WB',7)
) v(n,k,c,f) left join public.spaces s on s.code = v.c;

insert into public.chore_members(chore_id, resident_id, position)
select c.id, r.id, row_number() over (partition by c.id order by r.email)
from public.chores c cross join public.residents r where c.kind in ('hall','kitchen','garbage');
update public.chores c set current_resident_id = public.next_chore_member(c.id, null) where c.kind in ('hall','kitchen','garbage');
