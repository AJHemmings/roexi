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

fn conns() -> &'static Mutex<HashMap<u64, TcpStream>> {
    static C: OnceLock<Mutex<HashMap<u64, TcpStream>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone, serde::Serialize)]
struct BoxMsg {
    conn: u64,
    line: String,
}

/// Accepts addon connections forever. Each line received is forwarded to the webview as a
/// `roexi://box-msg` event tagged with the connection id; a closed socket emits `roexi://box-gone`.
fn start_box_server(app: AppHandle) {
    std::thread::spawn(move || loop {
        let listener = match TcpListener::bind(("127.0.0.1", BOX_PORT)) {
            Ok(l) => l,
            Err(e) => {
                log::warn!("[roexi] could not bind 127.0.0.1:{BOX_PORT}: {e}; retrying");
                IPC_BOUND.store(false, Ordering::Relaxed);
                std::thread::sleep(std::time::Duration::from_secs(3));
                continue;
            }
        };
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

#[tauri::command]
fn ipc_bound() -> bool {
    IPC_BOUND.load(Ordering::Relaxed)
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
    tauri::Builder::default()
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
            ipc_bound,
            read_text_file,
            write_text_file,
            delete_file,
            list_dir,
            open_url,
            show_main_window,
            quit_app,
            send_box_command,
            broadcast_box_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running roexi");
}
