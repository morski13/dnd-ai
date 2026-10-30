-- 26: Content from other books (your own copies: Xanathar's, Tasha's, homebrew…). Re-runnable.
-- * A "book" column on the library tables: empty for the SRD, the book's name for added content.
--   The SRD files (05, 07, 14, 15) only replace SRD rows, so added books survive when you run them again.
-- * book_content: subclasses, species, backgrounds and feats for the builder and the level-up screen.
-- Fill tools/books/book-template.xlsx, check it with `npm run book -- <file>`, then run the SQL it writes.
-- The book's text stays in YOUR database; keep the filled sheets and SQL out of the public repo (books/ is ignored).

alter table public.srd_spells   add column if not exists book text;
alter table public.srd_feats    add column if not exists book text;
alter table public.srd_monsters add column if not exists book text;
alter table public.srd_items    add column if not exists book text;

create table if not exists public.book_content (
  kind       text not null check (kind in ('subclass', 'species', 'background', 'feat')),
  rules      text not null check (rules in ('2014', '2024')),
  parent     text not null default '',           -- subclass: its class
  name       text not null,
  book       text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (kind, rules, parent, name)
);
create index if not exists book_content_book_idx on public.book_content (book);

alter table public.book_content enable row level security;
drop policy if exists "book content: everyone logged in can read" on public.book_content;
create policy "book content: everyone logged in can read" on public.book_content for select to authenticated using (true);
revoke all on public.book_content from anon;
revoke insert, update, delete on public.book_content from authenticated;
grant select on public.book_content to authenticated;

-- Which books are in the database, and how much of each (run this to check).
create or replace view public.books_added with (security_invoker = true) as
  select book, 'spells' as what, count(*) as n from public.srd_spells where book is not null group by book
  union all select book, 'items', count(*) from public.srd_items where book is not null group by book
  union all select book, 'monsters', count(*) from public.srd_monsters where book is not null group by book
  union all select book, case kind when 'species' then 'species' else kind || 's' end, count(*) from public.book_content group by book, kind;
grant select on public.books_added to authenticated;
