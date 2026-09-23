use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

/// Alexandria owns 24233; roexi listens next door so both apps run side by side.
const BOX_PORT: u16 = 24244;
static CONN_SEQ: AtomicU64 = AtomicU64::new(1);
static IPC_BOUND: AtomicBool = AtomicBool::new(false);
/// Why the last bind attempt failed, in words a user can act on. None while bound.
static IPC_ERROR: Mutex<Option<String>> = Mutex::new(None);

fn conns() -> &'static Mutex<HashMap<u64, TcpStream>> {
    static C: OnceLock<Mutex<HashMap<u64, TcpStream>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(serde::Serialize)]
struct AddonInstallResult {
    installed_version: String,
    files_written: usize,
    files_skipped: usize,
    skipped_examples: Vec<String>,
    addon_dir: String,
}

fn read_addon_version(addon_dir: &Path) -> Option<String> {
    let main = addon_dir.join("roexi.lua");
    let content = fs::read_to_string(&main).ok()?;
    for line in content.lines().take(40) {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("_addon.version") {
            let after_eq = rest.trim_start_matches(|c: char| c.is_whitespace() || c == '=');
            let v = after_eq.trim_matches(|c: char| c.is_whitespace() || c == '\'' || c == '"' || c == ',' || c == ';');
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    None
}

#[tauri::command]
fn read_installed_addon_version(addon_dir: String) -> Result<Option<String>, String> {
    let p = Path::new(&addon_dir);
    if !p.is_dir() {
        return Err(format!("not a directory: {}", addon_dir));
    }
    Ok(read_addon_version(p))
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    let out = h.finalize();
    let mut s = String::with_capacity(64);
    for b in out.iter() {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

fn should_skip_addon_path(rel: &str) -> bool {
    let normalized = rel.replace('\\', "/");
    if normalized.starts_with("data/") || normalized == "data" {
        return true;
    }
    if normalized.starts_with("../") || normalized.contains("/../") {
        return true;
    }
    let lower = normalized.to_lowercase();
    if lower.contains("config") && lower.ends_with(".json") {
        return true;
    }
    false
}

#[tauri::command]
fn install_addon_update(
    addon_dir: String,
    url: String,
    expected_sha256: Option<String>,
) -> Result<AddonInstallResult, String> {
    use std::io::Read;
    let target = Path::new(&addon_dir);
    // A folder named `roexi` is always an acceptable target: that's a fresh install into
    // Windower's addons folder (created if needed). Anything else must already hold roexi.lua,
    // so an update can never spray files into an unrelated folder.
    let is_roexi_dir = target
        .file_name()
        .map(|n| n.to_string_lossy().eq_ignore_ascii_case("roexi"))
        .unwrap_or(false);
    if !target.is_dir() {
        let parent_ok = target.parent().map(|p| p.is_dir()).unwrap_or(false);
        if !(is_roexi_dir && parent_ok) {
            return Err(format!("addon dir does not exist: {}", addon_dir));
        }
        fs::create_dir_all(target).map_err(|e| format!("mkdir {}: {}", addon_dir, e))?;
    }
    let existing_main = target.join("roexi.lua");
    if !existing_main.is_file() && !is_roexi_dir {
        return Err(format!(
            "roexi.lua not found in {} — point at the addon folder",
            addon_dir
        ));
    }

    let resp = ureq::get(&url).call().map_err(|e| format!("download failed: {e}"))?;
    let mut bytes: Vec<u8> = Vec::new();
    resp.into_reader()
        .take(200 * 1024 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("read failed: {e}"))?;
    if bytes.is_empty() {
        return Err("downloaded zero bytes".to_string());
    }

    if let Some(want) = expected_sha256.as_deref() {
        if !want.is_empty() {
            let got = sha256_hex(&bytes);
            if !got.eq_ignore_ascii_case(want) {
                return Err(format!("sha256 mismatch — got {got}, expected {want}"));
            }
        }
    }

    let cursor = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("not a valid zip: {e}"))?;

    let mut has_main = false;
    for i in 0..archive.len() {
        let f = archive.by_index(i).map_err(|e| format!("zip entry {i}: {e}"))?;
        let name = f.name();
        if name == "roexi.lua" || name.ends_with("/roexi.lua") {
            has_main = true;
        }
    }
    if !has_main {
        return Err("zip does not contain roexi.lua at the root — refusing to install".to_string());
    }

    let mut files_written = 0usize;
    let mut files_skipped = 0usize;
    let mut skipped_examples: Vec<String> = Vec::new();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("zip entry {i}: {e}"))?;
        let raw_name = entry.name().to_string();
        if entry.is_dir() {
            continue;
        }
        let rel = raw_name.trim_start_matches("./").to_string();
        if should_skip_addon_path(&rel) {
            files_skipped += 1;
            if skipped_examples.len() < 5 {
                skipped_examples.push(rel.clone());
            }
            continue;
        }
        let out_path = target.join(&rel);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
        }
        let mut buf: Vec<u8> = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut buf).map_err(|e| format!("read {}: {}", rel, e))?;
        if let Ok(existing) = fs::read(&out_path) {
            if existing == buf {
                files_skipped += 1;
                continue;
            }
        }
        let tmp_path = out_path.with_extension("tmp_update");
        fs::write(&tmp_path, &buf).map_err(|e| format!("write tmp {}: {}", tmp_path.display(), e))?;
        if out_path.exists() && fs::remove_file(&out_path).is_err() {
            let aside = out_path.with_extension("old_update");
            let _ = fs::remove_file(&aside);
            fs::rename(&out_path, &aside).map_err(|_| {
                format!(
                    "{} is in use and could not be replaced. Unload the addon in Windower (//lua unload roexi), install the update, then reload it.",
                    out_path.display()
                )
            })?;
        }
        fs::rename(&tmp_path, &out_path)
            .map_err(|e| format!("rename {} -> {}: {}", tmp_path.display(), out_path.display(), e))?;
        files_written += 1;
    }

    let installed_version = read_addon_version(target).unwrap_or_else(|| "unknown".to_string());
    Ok(AddonInstallResult {
        installed_version,
        files_written,
        files_skipped,
        skipped_examples,
        addon_dir: addon_dir.clone(),
    })
}

#[derive(Clone, serde::Serialize)]
struct BoxMsg {
    conn: u64,
    line: String,
}

/// Accepts addon connections forever. Each line received is forwarded to the webview as a
/// `roexi://box-msg` event tagged with the connection id; a closed socket emits `roexi://box-gone`.
fn start_box_server(app: AppHandle) {
    std::thread::spawn(move || {
      let mut failures: u32 = 0;
      loop {
        let listener = match TcpListener::bind(("127.0.0.1", BOX_PORT)) {
            Ok(l) => l,
            Err(e) => {
                log::warn!("[roexi] could not bind 127.0.0.1:{BOX_PORT}: {e}; retrying");
                IPC_BOUND.store(false, Ordering::Relaxed);
                // Looking up the port's owner spawns netstat/tasklist, so refresh the
                // explanation on the first failure and then only every ~30 s.
                if failures % 10 == 0 {
                    if let Ok(mut err) = IPC_ERROR.lock() {
                        *err = Some(describe_bind_error(&e));
                    }
                }
                failures = failures.wrapping_add(1);
                std::thread::sleep(std::time::Duration::from_secs(3));
                continue;
            }
        };
        failures = 0;
        if let Ok(mut err) = IPC_ERROR.lock() {
            *err = None;
        }
        IPC_BOUND.store(true, Ordering::Relaxed);
        log::info!("[roexi] listening on 127.0.0.1:{BOX_PORT}");
        for stream in listener.incoming().flatten() {
            // Bound writes so a frozen client cannot block a command sender forever. Cloned
            // handles share the socket options, so the writer stored in the map inherits this.
            let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(5)));
            let app = app.clone();
            std::thread::spawn(move || {
                let conn = CONN_SEQ.fetch_add(1, Ordering::Relaxed);
                match stream.try_clone() {
                    Ok(w) => {
                        if let Ok(mut map) = conns().lock() {
                            map.insert(conn, w);
                        }
                    }
                    Err(e) => log::warn!("[roexi] conn {conn}: try_clone failed: {e}"),
                }
                let reader = BufReader::new(stream);
                for line in reader.lines() {
                    match line {
                        Ok(line) if !line.trim().is_empty() => {
                            let _ = app.emit("roexi://box-msg", BoxMsg { conn, line });
                        }
                        Ok(_) => {}
                        Err(_) => break,
                    }
                }
                if let Ok(mut map) = conns().lock() {
                    map.remove(&conn);
                }
                let _ = app.emit("roexi://box-gone", conn);
            });
        }
        IPC_BOUND.store(false, Ordering::Relaxed);
        std::thread::sleep(std::time::Duration::from_secs(1));
      }
    });
}

#[tauri::command]
fn send_box_command(conn: u64, line: String) -> Result<(), String> {
    // Clone the handle under the lock and release it before touching the socket, so a slow
    // client can never stall the accept loop or other writers.
    let mut stream = {
        let map = conns().lock().map_err(|e| e.to_string())?;
        map.get(&conn)
            .ok_or_else(|| format!("no connection {conn}"))?
            .try_clone()
            .map_err(|e| e.to_string())?
    };
    let mut payload = line.into_bytes();
    payload.push(b'\n');
    stream.write_all(&payload).map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn broadcast_box_command(line: String) -> Result<u32, String> {
    let streams: Vec<TcpStream> = {
        let map = conns().lock().map_err(|e| e.to_string())?;
        map.values().filter_map(|s| s.try_clone().ok()).collect()
    };
    let mut payload = line.into_bytes();
    payload.push(b'\n');
    let mut sent = 0u32;
    for mut stream in streams {
        if stream.write_all(&payload).and_then(|_| stream.flush()).is_ok() {
            sent += 1;
        }
    }
    Ok(sent)
}

#[derive(serde::Serialize)]
struct IpcStatus {
    bound: bool,
    error: Option<String>,
}

#[tauri::command]
fn ipc_status() -> IpcStatus {
    IpcStatus {
        bound: IPC_BOUND.load(Ordering::Relaxed),
        error: IPC_ERROR.lock().ok().and_then(|e| e.clone()),
    }
}

/// Turns a bind failure into something a user can act on without running any diagnostics.
fn describe_bind_error(e: &std::io::Error) -> String {
    match e.kind() {
        std::io::ErrorKind::AddrInUse => match port_owner(BOX_PORT) {
            Some((pid, name)) if name.eq_ignore_ascii_case("roexi.exe") => format!(
                "Another copy of roexi is already running (PID {pid}) and has the connection. Close this window and use that one."
            ),
            Some((pid, name)) => format!(
                "Port {BOX_PORT} is being used by {name} (PID {pid}). Close that program and roexi will connect automatically."
            ),
            None => format!("Port {BOX_PORT} is already in use by another program."),
        },
        // WSAEACCES: Windows has put the port in an excluded range (Hyper-V / WSL / Docker).
        std::io::ErrorKind::PermissionDenied => format!(
            "Windows has reserved port {BOX_PORT} (usually Hyper-V, WSL or Docker), so roexi can't listen on it."
        ),
        _ => format!("Couldn't listen on port {BOX_PORT}: {e}"),
    }
}

/// PID of the process LISTENING on the port, from `netstat -ano -p TCP` output.
fn parse_netstat_listener(output: &str, port: u16) -> Option<u32> {
    let suffix = format!(":{port}");
    output.lines().find_map(|line| {
        let cols: Vec<&str> = line.split_whitespace().collect();
        // Proto  Local  Foreign  State  PID
        if cols.len() == 5
            && cols[0].eq_ignore_ascii_case("TCP")
            && cols[1].ends_with(&suffix)
            && cols[3].eq_ignore_ascii_case("LISTENING")
        {
            cols[4].parse().ok()
        } else {
            None
        }
    })
}

/// Image name from `tasklist /FO CSV /NH` output: the first quoted field.
fn parse_tasklist_name(output: &str) -> Option<String> {
    let line = output.lines().find(|l| l.starts_with('"'))?;
    let name = line.trim_start_matches('"').split('"').next()?;
    if name.is_empty() { None } else { Some(name.to_string()) }
}

#[cfg(target_os = "windows")]
fn port_owner(port: u16) -> Option<(u32, String)> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let run = |cmd: &str, args: &[&str]| {
        std::process::Command::new(cmd)
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
    };
    let pid = parse_netstat_listener(&run("netstat", &["-ano", "-p", "TCP"])?, port)?;
    let filter = format!("PID eq {pid}");
    let name = parse_tasklist_name(&run("tasklist", &["/FI", &filter, "/FO", "CSV", "/NH"])?)
        .unwrap_or_else(|| "an unknown program".to_string());
    Some((pid, name))
}

#[cfg(not(target_os = "windows"))]
fn port_owner(_port: u16) -> Option<(u32, String)> {
    None
}

/// Fetches a small text resource (the addon update manifest) from Rust. The webview's own fetch()
/// can't be used: GitHub's release-download redirects send no CORS headers, so the browser blocks
/// the response ("Failed to fetch"). Plain http is only allowed to localhost, for the local
/// end-to-end update test.
#[tauri::command]
async fn fetch_text(url: String) -> Result<String, String> {
    let allowed = url.starts_with("https://")
        || url.starts_with("http://127.0.0.1")
        || url.starts_with("http://localhost");
    if !allowed {
        return Err("only https urls are allowed".into());
    }
    let resp = ureq::get(&url).call().map_err(|e| format!("fetch failed: {e}"))?;
    resp.into_string().map_err(|e| format!("read failed: {e}"))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let rd = match fs::read_dir(&path) {
        Ok(r) => r,
        Err(_) => return Ok(out),
    };
    for e in rd.flatten() {
        if e.path().is_file() {
            if let Some(s) = e.path().to_str() {
                out.push(s.to_string());
            }
        }
    }
    Ok(out)
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only http(s) urls are allowed".into());
    }
    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("explorer").arg(&url).spawn();
    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let spawned = std::process::Command::new("xdg-open").arg(&url).spawn();
    spawned.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg(target_os = "windows")]
fn setup_tray(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show_item = MenuItemBuilder::with_id("tray_show", "Show roexi").build(app)?;
    let quit_item = MenuItemBuilder::with_id("tray_quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show_item, &quit_item]).build()?;

    let _tray = TrayIconBuilder::with_id("main_tray")
        .icon(app.default_window_icon().cloned().ok_or_else(|| {
            tauri::Error::AssetNotFound("default_window_icon".into())
        })?)
        .tooltip("roexi")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray_show" => show_main_window(app.clone()),
            "tray_quit" => quit_app(app.clone()),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle().clone());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn setup_tray(_app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Release builds only: a second launch focuses the running window instead of starting a copy
    // that can't bind the addon port. Skipped in dev so `tauri dev` can run beside an installed roexi.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        show_main_window(app.clone());
    }));
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            start_box_server(app.handle().clone());
            if let Err(e) = setup_tray(app.handle()) {
                log::warn!("[roexi] tray setup failed: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc_status,
            fetch_text,
            read_text_file,
            write_text_file,
            delete_file,
            list_dir,
            open_url,
            show_main_window,
            quit_app,
            send_box_command,
            broadcast_box_command,
            read_installed_addon_version,
            install_addon_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running roexi");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_listening_pid_for_the_port() {
        let out = "\r\nActive Connections\r\n\r\n  Proto  Local Address          Foreign Address        State           PID\r\n  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1100\r\n  TCP    127.0.0.1:24244        0.0.0.0:0              LISTENING       5512\r\n  TCP    127.0.0.1:24244        127.0.0.1:50123        ESTABLISHED     5512\r\n";
        assert_eq!(parse_netstat_listener(out, 24244), Some(5512));
        assert_eq!(parse_netstat_listener(out, 24233), None);
    }

    #[test]
    fn ignores_a_port_that_only_ends_with_the_same_digits() {
        let out = "  TCP    127.0.0.1:124244       0.0.0.0:0              LISTENING       77\r\n";
        assert_eq!(parse_netstat_listener(out, 24244), None);
    }

    #[test]
    fn reads_the_image_name_from_tasklist_csv() {
        let hit = "\"roexi.exe\",\"5512\",\"Console\",\"1\",\"30,000 K\"\r\n";
        assert_eq!(parse_tasklist_name(hit).as_deref(), Some("roexi.exe"));
        let miss = "INFO: No tasks are running which match the specified criteria.\r\n";
        assert_eq!(parse_tasklist_name(miss), None);
    }
}
