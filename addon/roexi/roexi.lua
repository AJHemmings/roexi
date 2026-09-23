_addon.name = 'roexi'
_addon.author = 'Mak'
_addon.version = '0.2.0-beta'
_addon.commands = {'roexi'}

local socket = require('socket')
local packets = require('packets')
require('pack')
local res = require('resources')
local json_ok, json = pcall(require, 'dkjson')

----------------------------------------------------------------------
-- constants
----------------------------------------------------------------------
local HOST, PORT = '127.0.0.1', 24244
local RETRY_INTERVAL, RETRY_MAX, CONN_TIMEOUT = 5.0, 15.0, 3.0
local HEARTBEAT = 30.0        -- seconds between "self" identity frames
local ACT_DELAY = 0.5         -- seconds between injected packets
local TXBUF_MAX = 262144
local MAX_ACTIVE = 30
local TAG = '[roexi] '

----------------------------------------------------------------------
-- transport state (same shape as Alexandria's addon)
----------------------------------------------------------------------
local conn, connected = nil, false
local conn_pending, conn_pending_t = nil, 0
local retry_delay, last_try = RETRY_INTERVAL, 0
local rx, txbuf = '', ''
local last_send = 0
local act_queue, act_t = {}, 0
local last_player_id = nil

local function chat(msg) windower.add_to_chat(207, TAG .. msg) end

local function esc(s)
    s = tostring(s or '')
    return (s:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('[\r\n\t]', ' '))
end

local function queue_send(data)
    if data and #txbuf + #data <= TXBUF_MAX then txbuf = txbuf .. data end
end

local function disconnect()
    if conn then pcall(function() conn:close() end) end
    conn, connected = nil, false
    rx, txbuf = '', ''
    act_queue = {}
    if conn_pending then pcall(function() conn_pending:close() end) conn_pending = nil end
    retry_delay = RETRY_INTERVAL
end

----------------------------------------------------------------------
-- ==== roexi RoE section BEGIN ====
-- Pure state + packet helpers. No transport code in here (nothing calls queue_send).
----------------------------------------------------------------------
local roe_active = {}        -- array of { id = n, p = progress } in slot order
local roe_done_pages = {}    -- page -> array of completed ids on that 1024-id page

-- Incoming 0x111: 30 slots of bit[12] id + bit[20] progress starting at Lua position 5.
local function parse_0x111(data)
    local out = {}
    for i = 1, MAX_ACTIVE do
        local id, p = data:unpack('b12b20', 5 + (i - 1) * 4)
        if id and id > 0 then out[#out + 1] = { id = id, p = p or 0 } end
    end
    return out
end

-- Incoming 0x112: 1024 completion bits from Lua position 5; page ("Order") at position 133.
-- Bit k (1-based) set => id (k-1) + 1024*page.
local function parse_0x112(data)
    local page = data:unpack('H', 133) or 0   -- Order is a 4-byte int; its low 16 bits are enough for pages 0..3 (same read as Cair's addon)
    local ids = {}
    local bits = { data:unpack(('b1'):rep(1024), 5) }
    for k = 1, 1024 do
        local v = bits[k]
        if v == 1 or v == true then ids[#ids + 1] = (k - 1) + 1024 * page end
    end
    return page, ids
end

local function build_roe()
    local parts = {}
    for i, e in ipairs(roe_active) do parts[i] = '{"id":' .. e.id .. ',"p":' .. e.p .. '}' end
    return '{"t":"roe","items":[' .. table.concat(parts, ',') .. ']}\n'
end

local function build_roedone(page)
    local ids = roe_done_pages[page] or {}
    return '{"t":"roedone","page":' .. page .. ',"ids":[' .. table.concat(ids, ',') .. ']}\n'
end

local function inject_roe(pid, id)
    packets.inject(packets.new('outgoing', pid, { ['RoE Quest'] = id }))
end

-- Outgoing 0x112 "RoE Log Request": the client sends this on zone; injecting it asks the
-- server to resend the completion pages (verified in game by the owner).
local function request_log()
    packets.inject(packets.new('outgoing', 0x112, { ['_unknown1'] = 0 }))
end

local function reread_cached()
    local last = windower.packets.last_incoming(0x111)
    if last then roe_active = parse_0x111(last) end
    local done = windower.packets.last_incoming(0x112)
    if done then
        local page, ids = parse_0x112(done)
        roe_done_pages[page] = ids
    end
end

local function clear_roe_state()
    roe_active, roe_done_pages = {}, {}
end
----------------------------------------------------------------------
-- ==== roexi RoE section END ====
----------------------------------------------------------------------

----------------------------------------------------------------------
-- identity
----------------------------------------------------------------------
local function build_self(kind)
    local p = windower.ffxi.get_player()
    if not p then return nil end
    local info = windower.ffxi.get_info()
    local zone_id = (info and info.zone) or 0
    local zone_name = (res.zones[zone_id] and res.zones[zone_id].en) or ''
    local server_name = (info and info.server and res.servers[info.server] and res.servers[info.server].en) or ''
    return '{"t":"' .. kind .. '"'
        .. ',"id":' .. tostring(p.id or 0)
        .. ',"name":"' .. esc(p.name) .. '"'
        .. ',"main":"' .. esc(p.main_job) .. '"'
        .. ',"main_lvl":' .. tostring(p.main_job_level or 0)
        .. ',"sub":"' .. esc(p.sub_job) .. '"'
        .. ',"sub_lvl":' .. tostring(p.sub_job_level or 0)
        .. ',"zone":' .. tostring(zone_id)
        .. ',"zone_name":"' .. esc(zone_name) .. '"'
        .. ',"server":"' .. esc(server_name) .. '"'
        .. ',"av":"' .. esc(_addon.version) .. '"'
        .. ',"apath":"' .. esc(windower.addon_path) .. '"'
        .. '}\n'
end

local function send_all_done_pages()
    for page in pairs(roe_done_pages) do queue_send(build_roedone(page)) end
end

-- Identity + full RoE state. Used on connect ("hello") and on "sync"/swap ("self").
local function send_snapshot(kind)
    local s = build_self(kind)
    if not s then return end
    queue_send(s)
    queue_send(build_roe())
    send_all_done_pages()
    last_send = os.clock()
end

----------------------------------------------------------------------
-- commands from the app
----------------------------------------------------------------------
-- Queue one injection per id, ACT_DELAY apart, then a seqack. The addon does NOT filter ids
-- (active/complete/daily range): the app owns those rules and diffs the outcome.
local function enqueue_batch(pid, ids, seq)
    if type(ids) ~= 'table' then ids = {} end
    local ok_all = true
    for _, raw in ipairs(ids or {}) do
        local id = tonumber(raw)
        if id and id >= 1 and id <= 4095 then
            act_queue[#act_queue + 1] = function()
                local ok = pcall(inject_roe, pid, id)
                if not ok then ok_all = false end
            end
        end
    end
    if seq ~= nil then
        local sq = tonumber(seq) or 0
        act_queue[#act_queue + 1] = function()
            queue_send('{"t":"seqack","seq":' .. sq .. ',"ok":' .. (ok_all and 'true' or 'false') .. '}\n')
        end
    end
end

local function dispatch(line)
    if not json_ok then return end
    local ok, msg = pcall(json.decode, line)
    if not ok or type(msg) ~= 'table' then return end
    if type(msg.cmd) ~= 'string' then return end
    if msg.cmd == 'roeadd' then
        enqueue_batch(0x10C, msg.ids, msg.seq)
    elseif msg.cmd == 'roecancel' then
        enqueue_batch(0x10D, msg.ids, msg.seq)
    elseif msg.cmd == 'roerefresh' then
        reread_cached()
        queue_send(build_roe())
        send_all_done_pages()
        pcall(request_log)
    elseif msg.cmd == 'sync' then
        send_snapshot('self')
    elseif msg.cmd == 'reload' then
        -- Sent by the app right after it installs an addon update, so the new files load without
        -- typing //lua reload in every client.
        windower.send_command('lua reload roexi')
    end
end

----------------------------------------------------------------------
-- connection lifecycle
----------------------------------------------------------------------
local function finish_connect(s)
    s:settimeout(0)
    conn, connected = s, true
    retry_delay = RETRY_INTERVAL
    reread_cached()
    send_snapshot('hello')
    chat('connected to roexi on port ' .. PORT)
end

local function bump_backoff()
    retry_delay = math.min(retry_delay * 1.5, RETRY_MAX)
end

local function try_connect()
    local s = socket.tcp()
    if not s then return end
    s:settimeout(0)
    local ok, err = s:connect(HOST, PORT)
    if ok then
        finish_connect(s)
    elseif err == 'timeout' or err == 'Operation already in progress' or err == 'Operation now in progress' then
        conn_pending, conn_pending_t = s, os.clock()
    else
        pcall(function() s:close() end)
        bump_backoff()
    end
end

local function poll_pending_connect(now)
    if not conn_pending then return end
    local s = conn_pending
    local _, wt = socket.select({}, { s }, 0)
    if wt and wt[s] then
        conn_pending = nil
        if s:getpeername() then
            finish_connect(s)
        else
            pcall(function() s:close() end)
            bump_backoff()
        end
    elseif now - conn_pending_t > CONN_TIMEOUT then
        conn_pending = nil
        pcall(function() s:close() end)
        bump_backoff()
    end
end

----------------------------------------------------------------------
-- events
----------------------------------------------------------------------
windower.register_event('incoming chunk', function(id, data)
    if id == 0x111 then
        roe_active = parse_0x111(data)
        if connected then queue_send(build_roe()) end
    elseif id == 0x112 then
        local page, ids = parse_0x112(data)
        roe_done_pages[page] = ids
        if connected then queue_send(build_roedone(page)) end
    end
end)

local function tick()
    local now = os.clock()

    -- Shared-client character swap (or logout): never report the previous character's
    -- records under the new identity. Clear first, then re-read the client's cache.
    local p = windower.ffxi.get_player()
    local pid = p and p.id or 0
    if pid ~= last_player_id then
        last_player_id = pid
        clear_roe_state()
        if pid ~= 0 then
            reread_cached()
            if connected then send_snapshot('self') end
        end
    end

    if not connected then
        poll_pending_connect(now)
        if not conn_pending and (now - last_try) >= retry_delay then
            last_try = now
            try_connect()
        end
        return
    end

    local chunk, err, partial = conn:receive('*a')
    local data = chunk or partial
    if data and #data > 0 then
        rx = rx .. data
        while true do
            local nl = rx:find('\n', 1, true)
            if not nl then break end
            local line = rx:sub(1, nl - 1)
            rx = rx:sub(nl + 1)
            if #line > 0 then pcall(dispatch, line) end
        end
        if #rx > TXBUF_MAX then rx = '' end
    end
    if err == 'closed' then
        disconnect()
        return
    end

    -- Throttled lane: one injected packet per ACT_DELAY.
    if #act_queue > 0 and (now - act_t) >= ACT_DELAY then
        act_t = now
        local fn = table.remove(act_queue, 1)
        if fn then pcall(fn) end
    end

    if now - last_send >= HEARTBEAT then
        local s = build_self('self')
        if s then queue_send(s) end
        last_send = now
    end

    if #txbuf >= TXBUF_MAX then
        chat('app not responding; resetting connection')
        disconnect()
        return
    end
    if #txbuf > 0 then
        local sent, serr, last = conn:send(txbuf)
        local n = sent or last
        if n and n > 0 then txbuf = txbuf:sub(n + 1) end
        if serr == 'closed' then disconnect() return end
    end
end

local last_tick_err = 0
windower.register_event('prerender', function()
    local ok, err = pcall(tick)
    if not ok then
        local now = os.clock()
        if now - last_tick_err > 30 then
            last_tick_err = now
            chat('error: ' .. tostring(err))
        end
    end
end)

windower.register_event('addon command', function(cmd)
    cmd = (cmd or 'help'):lower()
    if cmd == 'status' then
        chat((connected and 'connected' or 'not connected') .. ' | active ' .. #roe_active .. '/' .. MAX_ACTIVE)
        for _, e in ipairs(roe_active) do chat('  #' .. e.id .. ' progress ' .. e.p) end
        local pages = {}
        for page, ids in pairs(roe_done_pages) do pages[#pages + 1] = page .. ':' .. #ids end
        table.sort(pages)
        chat('completed pages ' .. (#pages > 0 and table.concat(pages, ' ') or 'none'))
    elseif cmd == 'refresh' then
        reread_cached()
        pcall(request_log)
        if connected then
            queue_send(build_roe())
            send_all_done_pages()
        end
        chat('refresh requested')
    elseif cmd == 'sync' then
        if connected then send_snapshot('self') chat('synced') else chat('not connected') end
    else
        chat('commands: status | refresh | sync')
    end
end)

windower.register_event('load', function()
    last_player_id = nil   -- prerender sees the player next frame and reads the cached packets
    if not json_ok then chat('dkjson failed to load; commands from the app will be ignored') end
end)

windower.register_event('unload', function()
    disconnect()
end)
