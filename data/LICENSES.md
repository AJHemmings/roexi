# Third-party data

## data/roe_client.json (generated)
Records of Eminence ids, names, repeat flags, goals, rewards and descriptions, extracted from the
FFXI game client's own data file (`ROM/307/16.DAT`) by `scripts/extract-client.mjs`. Game text and
figures are © SQUARE ENIX. Thanks to commandobill/roe (https://github.com/commandobill/roe) and Thorny,
whose id → name list first showed where this data lives.

## public/roe_catalog.json (generated)
Built from data/roe_client.json. Only the categories come from the BG-Wiki page
https://www.bg-wiki.com/ffxi/Records_of_Eminence, joined to the client table by objective name.
The raw wiki HTML is cached under data/cache/ during a build and is never committed.

## addon/roexi/dkjson.lua
David Kolf's JSON module for Lua (MIT). http://dkolf.de/dkjson-lua/
