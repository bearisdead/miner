# Bear is Dead mobile miner restore

Re-upload this zip in a new chat and say: restore the miner from this zip.

This zip is source code. Opening it does not launch the miner.

## Coin
- Ticker: $MINERTEST
- Chain: Robinhood Chain 4663
- Token: 0xD2b80F2a2c8aE73c10F4822AA2D955cBb6aB22d7
- Deposit address that pays withdrawals: 0x92C2f3324681BAb5edC77cedFF427ba818ec773D
- Launch tx: 0xe757e6b64906c47ac1308eae99a8d98808b4bb92532cefb688ba55d9f6242e5a
- Admin pin: 4663
- Admin screen only shows that deposit address

## What the app does
- Intro, then Get Started, then link X
- The X post is only two lines: "mobile miner test" and the code
- Paste button on the link field so the phone keyboard does not block paste
- Hub: Dashboard, Tower, Hacker's Lair, Wallet
- Electricity lasts 24 hours and cannot be bought again until it runs out
- Graphics card doubles 40 to 80
- No drawn Bear is Dead logos in the screens

## Netlify
- Repo folder uploads to GitHub, then Netlify imports that repo
- Build command: npm run build
- Node 22
- NITRO_PRESET=netlify is in netlify.toml
- Add DATABASE_URL in Netlify or miners are forgotten when the site sleeps

## Saving people
On Netlify, miners are stored with the site. Uploading a new version to the same site keeps them. A brand new Netlify site starts empty. The first live site failed to make a code because nothing was saved yet, so nobody was stored.
