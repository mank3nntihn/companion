-- To-dos nach Kategorien gruppieren und innerhalb sortieren.
alter table public.todos add column if not exists category text;
alter table public.todos add column if not exists sort integer;
create index if not exists todos_category_idx on public.todos (category);
