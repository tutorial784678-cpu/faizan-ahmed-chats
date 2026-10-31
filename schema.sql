-- FAIZAN AHMED CHATS database schema
-- Run in Supabase SQL Editor. Authentication passwords remain managed by Supabase Auth.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 32),
  email text not null,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare desired_username text;
begin
  desired_username := coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1));
  insert into public.profiles(id,username,email)
  values(new.id, desired_username, new.email)
  on conflict(id) do update set email=excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(conversation_id,user_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  media_url text,
  media_type text check (media_type is null or media_type in ('image','audio','file')),
  created_at timestamptz not null default now(),
  check (body is not null or media_url is not null)
);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create or replace function public.is_conversation_member(cid uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.conversation_members where conversation_id=cid and user_id=auth.uid()); $$;

create or replace function public.get_or_create_dm(other_user uuid)
returns uuid language plpgsql security definer set search_path=public
as $$
declare found_id uuid; new_id uuid;
begin
  if auth.uid() is null or other_user=auth.uid() then raise exception 'Invalid recipient'; end if;
  if not exists(select 1 from public.profiles where id=other_user) then raise exception 'User not found'; end if;
  select c.id into found_id
  from public.conversations c
  join public.conversation_members a on a.conversation_id=c.id and a.user_id=auth.uid()
  join public.conversation_members b on b.conversation_id=c.id and b.user_id=other_user
  where (select count(*) from public.conversation_members x where x.conversation_id=c.id)=2
  limit 1;
  if found_id is not null then return found_id; end if;
  insert into public.conversations default values returning id into new_id;
  insert into public.conversation_members(conversation_id,user_id) values(new_id,auth.uid()),(new_id,other_user);
  return new_id;
end; $$;

create policy "profiles readable to authenticated" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid() and role='user');
create policy "members see their memberships" on public.conversation_members for select to authenticated using (user_id=auth.uid() or public.is_conversation_member(conversation_id));
create policy "members see conversations" on public.conversations for select to authenticated using (public.is_conversation_member(id));
create policy "members read messages" on public.messages for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "members send messages as self" on public.messages for insert to authenticated with check (sender_id=auth.uid() and public.is_conversation_member(conversation_id));
create policy "admins can moderate profiles" on public.profiles for update to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

-- Storage bucket for image/audio attachments. Public URLs mean uploaded media is accessible to anyone with its URL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chat-media','chat-media',true,20971520,array['image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/ogg','audio/mpeg','audio/mp4','application/pdf'])
on conflict(id) do nothing;
create policy "authenticated uploads to own folder" on storage.objects for insert to authenticated
with check (bucket_id='chat-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "chat media public read" on storage.objects for select to public using (bucket_id='chat-media');

-- Enable realtime for messages.
alter publication supabase_realtime add table public.messages;

-- Restrict SECURITY DEFINER RPC execution. These functions are intentionally
-- callable only by authenticated users where required; the auth trigger
-- function is invoked by PostgreSQL, not directly through the Data API.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.get_or_create_dm(uuid) from public, anon;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
revoke execute on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- Minimum Data API privileges; row access remains controlled by RLS above.
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.conversations, public.conversation_members, public.messages to authenticated;
grant insert on public.messages to authenticated;
