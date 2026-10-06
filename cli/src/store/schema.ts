export const schema = `
create table if not exists sessions (
  id text primary key,
  project text not null,
  transcript text,
  agent_type text,
  title text,
  started_at integer not null,
  updated_at integer not null
);

create table if not exists sources (
  path text primary key,
  session_id text not null references sessions(id) on delete cascade,
  agent_id text,
  offset integer not null default 0
);

create table if not exists contexts (
  id integer primary key,
  session_id text not null references sessions(id) on delete cascade,
  ordinal integer not null,
  opened_at integer not null,
  reason text not null
);

create table if not exists turns (
  id integer primary key,
  session_id text not null references sessions(id) on delete cascade,
  context_id integer not null references contexts(id) on delete cascade,
  prompt_id text not null,
  opened_at integer not null,
  closed_at integer
);

create table if not exists tasks (
  id text primary key,
  session_id text not null references sessions(id) on delete cascade,
  parent_id text,
  agent_type text,
  title text not null,
  opened_by text,
  opened_at integer not null,
  closed_at integer
);

create table if not exists messages (
  seq integer primary key,
  id text not null unique,
  session_id text not null references sessions(id) on delete cascade,
  context_id integer not null references contexts(id) on delete cascade,
  turn_id integer references turns(id) on delete cascade,
  task_id text not null,
  kind text not null,
  sender text not null,
  name text,
  tool_use_id text,
  jump text,
  text text not null,
  is_error integer not null default 0,
  at integer not null
);

create index if not exists messages_by_session on messages(session_id, seq);
create index if not exists messages_by_tool_use on messages(session_id, tool_use_id);

create table if not exists modes (
  id integer primary key,
  session_id text not null references sessions(id) on delete cascade,
  agent_id text not null default '',
  mode text not null,
  cause text not null,
  at integer not null,
  is_delivered integer not null default 0
);

create index if not exists modes_by_session on modes(session_id, agent_id, id);
`
