# Third-party data

## data/roe_mapping.lua
Records of Eminence objective id → name table from https://github.com/commandobill/roe (MIT License).
Names were generated from the retail client by Thorny. Used unmodified as the authority for ids and names.

## public/roe_catalog.json (generated)
Categories, goal counts, repeat flags and reward figures are derived from the BG-Wiki page
https://www.bg-wiki.com/ffxi/Records_of_Eminence, joined to the id list by objective name.
The raw wiki HTML is cached under data/cache/ during a build and is never committed.

## addon/roexi/dkjson.lua
David Kolf's JSON module for Lua (MIT). http://dkolf.de/dkjson-lua/
