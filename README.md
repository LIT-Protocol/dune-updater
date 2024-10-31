## Getting Started
To trigger the script
```
npm run start
```

## Working
It works in two parts:
- Fetches Genius API for their realtime wrapped keys data
- Fetches Yellowstone Blockchain for new PKPs minted after last table update

### Relies on 3 DBs
- genius_wk_api
- yellowstone_pkp_api
- latest_blocks_api

### Genius Wrapped Keys
- Uses `/clear` endpoint to clear existing table from Dune
- Fetches from API
- Filters for keytype and appends to the object array
- Converts to CSV
- Uses `/insert` endpoint to push the csv to Dune
- Uses `/execute` endpoint to refresh the query responsible for fetching from table

### Yellowstone PKPs
- Stores starting and end block for each scan on Blocks Table
- Fetches Blocks Table for end block to use it as a starting block for next scan
- Scans Yellowstone till the current block
- Convert to results to csv, also creates a csv for start and block of this scan
- Uses `/insert` and `/execute` to push and refresh Yellowstone table
- Uses `/clear` endpoint to clear existing Blocks table from Dune
- Uses `/insert` and `/execute` to push and refresh Blocks table