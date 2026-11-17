create table if not exists miner_deposits (
  tx_hash text primary key,
  miner_id text not null,
  from_address text not null,
  amount double precision not null,
  created_at timestamptz not null default now()
);

update miner_settings
set token_address = '0xD2b80F2a2c8aE73c10F4822AA2D955cBb6aB22d7',
    updated_at = now()
where id = 1 and btrim(token_address) = '';

update miner_settings
set pool_wallet = '0x92C2f3324681BAb5edC77cedFF427ba818ec773D',
    updated_at = now()
where id = 1 and btrim(pool_wallet) = '';
