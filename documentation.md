## Documentation for this Project. How does this work?

Primary Databases:
- k256_wk_api
- k256_wk_api_testnets
- ed25519_wk_api
- ed25519_wk_api_testnets
- genius_wk_api
- latest_blocks_api
- yellowstone_pkp_api

Each of these is linked to ./index.js. Following says what they are for

- `k256_wk_api`, `k256_wk_api_testnets`, `ed25519_wk_api`, and `ed25519_wk_api_testnets` are DB’s for storing wrapped keys coming from AWS for complete Lit
- `genius_wk_api` is for storing wrapped keys data specifc to Genius and coming from [this link](https://staging-api.tradegenius.com/indexer/reports/wallets?limit=1000)
- `latest_blocks_api` is to store the ending block as a reference point for last scan so that new scan on yellowstone can be started from there
- `yellowstone_pkp_api` is for storing pkps from yellowstone chronicle blockchain

What can ./index.js do?
- It can create a new table
- It can push any downloaded csv file to Dune
- It can call the Genius api to fetch its data, 
- It can run a scan over yellowstone looking where the last scan stopped from `latest_blocks_api` and scan till lastest block, extract all pkps from reading events, use each pkp's public key to compute 6 btc address formats, and append them existing table

6 BTC address formats
- P2WSH
- P2TR
- P2SH
- P2SHP2WPKH
- P2WPKH
- P2PKH

Query Structure (4 layers)
- Each of 7 DBs have a query which only imports from the DB [eg](https://dune.com/queries/4004557) and the `./index.js` script updating these db also calls the query to refresh it and needs to run before 13:00 UTC daily (not yet automated)
- Each chain as well btc address format has its own balance fetching query which is materialized, there are 14(pkp), 6(btc pkp), 14(k256 wk), and 34 in total queries which run daily at 13:00-13:30 UTC. [eg](https://dune.com/queries/4255955)
- Both mainnet and testnets dashboard runs following queries daily at 13:30-14:00 UTC - `Net Value`, `PKP TVL Chart`, `Value in Dollars`, `Unique Address on chains`, `TVL Ratio`
- And a common `Yellowstone` query to both dashboards which runs at 14:00-14:30 UTC

What these Queries do?
- Common `Yellowstone` query imports from `Net Value` of mainnet as well testnets dashboard and provies total value and keys of Lit
- `Net Value` DB imports from all materialized queries (34 queries) with filter for mainnet or testnets. It also imports from Genius API, K256 WK, and ED25519 WK ad provides all numberic stats
- `PKP TVL Chart` uses materialized PKP queries (including BTC) with filter for mainnet or testnets and fetched historic balances to show a graphical chart [eg](https://dune.com/queries/4184815/7043036)
- `Value in Dollars` uses materialized PKP queries (including BTC) and shows you a table and a pie chart for chain speicifc dollar values for PKPs
- `Unique Address on chains` uses materialized PKP queries (including BTC) and shows chain specific addresses holding over zero dollars
- `TVL Ratio` query imports from `Net Value` and shows a ratio between wk and pkp address's total value


