# roexi

<p align="center">
  <a href="https://github.com/AJHemmings/roexi/releases/latest">
    <img src="https://img.shields.io/github/downloads/AJHemmings/roexi/total?style=for-the-badge&color=d4a643&label=Total%20Downloads&cacheSeconds=3600" alt="Total Downloads" />
  </a>
</p>

roexi is a desktop app for FFXI multiboxers to view and manage Records of Eminence objectives across up to 6 characters at once, without tabbing through each client's in-game RoE menu one at a time. Built on the same stack and UI language as the open-source [Alexandria](https://github.com/suspiciousman3187/Alexandria) inventory tool.

> roexi is in **BETA**. Core functionality (viewing/setting objectives, Sets) has been run against a real 6-client multibox session, but there may still be bugs — use with that in mind.

## Features

- **Library**: the full ~1,559-objective catalog (ids, names, categories, rewards), searchable and grouped by category/subcategory, with Daily/Repeat tags and per-character active/done state.
- **Active**: every objective currently active on any connected character, with real per-character progress bars and quick Add/Remove actions across your whole roster from one place.
- **Sets**: save a named group of objectives once, then apply or remove it against any subset of your characters in a couple of clicks, instead of re-selecting the same objectives every session.
- **Multi-character throughout**: pick "All" or a single character from one dropdown, and every view/action scopes to that selection.

## Download & Install

Grab the latest build from the [**Releases**](https://github.com/AJHemmings/roexi/releases/latest) page. Two assets are provided:

- **`roexi-Desktop`**: Main desktop application installer.
- **`roexi-Addon`**: Companion Windower addon. roexi requires the addon to be loaded in-game to be able to talk to the app.

## Requirements

- Windows 10 / 11
- Final Fantasy XI installed
- [Windower 4](https://www.windower.net/) with the roexi addon loaded
- WebView2 runtime (pre-installed on modern Windows; auto-installs if missing)

## How it works

- **`src-tauri/`**: the Rust/Tauri shell. Listens on `127.0.0.1:24244` for the addon's connection (Alexandria owns 24233 next door, so both can run at once), persists character state to disk, and exposes a small set of commands the frontend calls over Tauri's IPC.
- **`addon/roexi/`**: the Windower Lua addon. Reports each character's active/completed objectives to the app and injects the accept/cancel packets that actually add or remove a Records of Eminence objective in-game.
- **`src/`**: the React frontend — the Records/Sets/Settings views, the bridge layer that turns the addon's socket traffic into React state, and the batch runner that drives multi-character Add/Remove/Apply operations.

## Bugs

This tool is in beta and there may be bugs. Please use at your own risk, and feel free to open an issue if you find any.

## Credits

- **[suspiciousman3187](https://github.com/suspiciousman3187)**, author of [Alexandria](https://github.com/suspiciousman3187/Alexandria) — roexi's stack, UI language, and overall app architecture are directly inspired by Alexandria. Several parts of this app's code are reused directly from Alexandria's own implementation, most notably the auto-update system (the Rust addon-installer command, the update-check/install frontend, and the Settings update UI).
- **[Windower/Lua's `roe` addon](https://github.com/Windower/Lua/blob/dev/addons/roe/roe.lua)** — the original Records of Eminence Windower addon, used as a reference for building `addon/roexi/roexi.lua`.

The objective catalog is built from third-party data — see `data/LICENSES.md` for the full breakdown:

- Objective ids, names, and category/goal data from [commandobill/roe](https://github.com/commandobill/roe) (MIT).
- Categories, goal counts, and reward figures cross-referenced against [BG-Wiki](https://www.bg-wiki.com/ffxi/Records_of_Eminence).
