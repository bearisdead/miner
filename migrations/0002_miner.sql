create table if not exists miner_settings (
  id integer primary key,
  token_address text not null default '',
  pool_wallet text not null default '',
  pool_balance double precision not null default 0,
  admin_pin text not null default '4663',
  updated_at timestamptz not null default now(),
  constraint miner_settings_singleton check (id = 1)
);

insert into miner_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists miner_challenges (
  id text primary key,
  code text not null,
  created_at timestamptz not null default now(),
  used boolean not null default false
);

create table if not exists miners (
  id text primary key,
  secret text not null unique,
  x_handle text not null,
  post_url text not null,
  anchor_post text not null default '',
  post_checked boolean not null default false,
  balance double precision not null default 0,
  lifetime_mined double precision not null default 0,
  electricity_until timestamptz,
  gpu boolean not null default false,
  withdraw_address text not null default '',
  accrual_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists miners_handle_idx on miners (lower(x_handle));

create table if not exists miner_withdrawals (
  id serial primary key,
  miner_id text not null,
  x_handle text not null,
  address text not null,
  amount double precision not null,
  status text not null default 'queued',
  tx_hash text,
  created_at timestamptz not null default now()
);

create index if not exists miner_withdrawals_miner_idx on miner_withdrawals (miner_id);
