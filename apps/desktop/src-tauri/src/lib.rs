use anyhow::{anyhow, Context, Result};
use battery::units::ratio::percent;
use chrono::{Datelike, Local, Timelike};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::{
    fs::{self, File},
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use sysinfo::System;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State,
};
use url::Url;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetManifest {
    id: String,
    display_name: String,
    description: Option<String>,
    spritesheet_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetSummary {
    id: String,
    display_name: String,
    description: String,
    source: String,
    manifest_path: Option<String>,
    spritesheet_path: String,
    spritesheet_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Routine {
    id: String,
    subject: String,
    focus_minutes: u32,
    break_minutes: u32,
    #[serde(default = "default_routine_start_time")]
    start_time: String,
    repeat_days: Vec<u8>,
    enabled: bool,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuickAction {
    id: String,
    name: String,
    target: String,
    enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    #[serde(default = "default_selected_pet_id")]
    selected_pet_id: String,
    #[serde(default)]
    pet_window_enabled: bool,
    #[serde(default = "default_animation_mode")]
    animation_mode: String,
    #[serde(default)]
    autostart_enabled: bool,
    #[serde(default = "default_true")]
    resource_monitor_enabled: bool,
    #[serde(default = "default_true")]
    battery_monitor_enabled: bool,
    #[serde(default)]
    quick_actions: Vec<QuickAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppData {
    #[serde(default = "default_settings")]
    settings: AppSettings,
    #[serde(default)]
    routines: Vec<Routine>,
    #[serde(default)]
    installed_pets: Vec<PetSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetValidation {
    ok: bool,
    id: Option<String>,
    display_name: Option<String>,
    description: Option<String>,
    spritesheet_path: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    format: Option<String>,
    errors: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecommendedPet {
    id: String,
    display_name: String,
    description: String,
    url: String,
}

#[derive(Default)]
struct SessionRuntime {
    cancel: Option<Arc<AtomicBool>>,
}

#[derive(Debug)]
struct ResourceRuntime {
    enabled: bool,
    battery_enabled: bool,
}

#[derive(Clone)]
struct ResourceMonitorState(Arc<Mutex<ResourceRuntime>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResourceSnapshot {
    cpu_percent: f32,
    memory_percent: f32,
    battery_percent: Option<f32>,
    battery_state: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsSummary {
    app_version: String,
    tauri_version: String,
    os: String,
    arch: String,
    app_data_dir_exists: bool,
    routine_count: usize,
    enabled_routine_count: usize,
    installed_pet_count: usize,
    selected_pet_id: String,
    pet_window_enabled: bool,
    animation_mode: String,
    resource_monitor_enabled: bool,
    battery_monitor_enabled: bool,
    quick_action_count: usize,
    enabled_quick_action_count: usize,
    installed_pets: Vec<DiagnosticPet>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticPet {
    id: String,
    display_name: String,
    source: String,
    has_manifest: bool,
    has_spritesheet: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticRoutine {
    focus_minutes: u32,
    break_minutes: u32,
    start_time: String,
    repeat_day_count: usize,
    enabled: bool,
    subject_length: usize,
    message_length: usize,
}

fn default_true() -> bool {
    true
}

fn default_selected_pet_id() -> String {
    "calico".to_string()
}

fn default_animation_mode() -> String {
    "event".to_string()
}

fn default_routine_start_time() -> String {
    "09:00".to_string()
}

fn default_settings() -> AppSettings {
    AppSettings {
        selected_pet_id: default_selected_pet_id(),
        pet_window_enabled: false,
        animation_mode: default_animation_mode(),
        autostart_enabled: false,
        resource_monitor_enabled: true,
        battery_monitor_enabled: true,
        quick_actions: Vec::new(),
    }
}

fn default_data() -> AppData {
    AppData {
        settings: default_settings(),
        routines: vec![Routine {
            id: "default-focus".to_string(),
            subject: "오늘의 학습".to_string(),
            focus_minutes: 25,
            break_minutes: 5,
            start_time: default_routine_start_time(),
            repeat_days: vec![1, 2, 3, 4, 5],
            enabled: true,
            message: "오늘의 펫과 함께 집중할 시간입니다.".to_string(),
        }],
        installed_pets: Vec::new(),
    }
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| anyhow!("failed to resolve app data dir: {error}"))?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn state_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app_data_dir(app)?.join("state.json"))
}

fn pets_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app_data_dir(app)?.join("pets");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn normalize_zip_path(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            std::path::Component::Normal(value) => value.to_str(),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn add_file_to_zip(zip: &mut ZipWriter<File>, source: &Path, archive_name: &str) -> Result<()> {
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file(archive_name, options)?;
    let mut file = File::open(source)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;
    zip.write_all(&buffer)?;
    Ok(())
}

fn add_dir_to_zip(
    zip: &mut ZipWriter<File>,
    root: &Path,
    current: &Path,
    prefix: &str,
) -> Result<()> {
    if !current.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            add_dir_to_zip(zip, root, &path, prefix)?;
        } else {
            let relative = path.strip_prefix(root)?;
            let archive_name = format!("{}/{}", prefix, normalize_zip_path(relative));
            add_file_to_zip(zip, &path, &archive_name)?;
        }
    }
    Ok(())
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<()> {
    if !source.exists() {
        return Ok(());
    }
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else {
            fs::copy(&source_path, &target_path)?;
        }
    }
    Ok(())
}

fn read_manifest(path: &Path) -> Result<PetManifest> {
    let text =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let manifest: PetManifest = serde_json::from_str(&text).context("pet.json is not valid")?;
    Ok(manifest)
}

fn validate_pet_dir(path: &Path) -> PetValidation {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let manifest_path = path.join("pet.json");
    if !manifest_path.is_file() {
        errors.push("pet.json 파일이 없습니다.".to_string());
        return PetValidation {
            ok: false,
            id: None,
            display_name: None,
            description: None,
            spritesheet_path: None,
            width: None,
            height: None,
            format: None,
            errors,
            warnings,
        };
    }

    let manifest = match read_manifest(&manifest_path) {
        Ok(value) => value,
        Err(error) => {
            errors.push(error.to_string());
            return PetValidation {
                ok: false,
                id: None,
                display_name: None,
                description: None,
                spritesheet_path: None,
                width: None,
                height: None,
                format: None,
                errors,
                warnings,
            };
        }
    };

    if manifest.id.trim().is_empty() {
        errors.push("pet.json의 id가 비어 있습니다.".to_string());
    }
    if manifest.display_name.trim().is_empty() {
        errors.push("pet.json의 displayName이 비어 있습니다.".to_string());
    }
    if manifest.spritesheet_path.trim().is_empty() {
        errors.push("pet.json의 spritesheetPath가 비어 있습니다.".to_string());
    }

    let spritesheet = path.join(&manifest.spritesheet_path);
    let mut width = None;
    let mut height = None;
    let mut format = None;
    if !spritesheet.is_file() {
        errors.push(format!("{} 파일이 없습니다.", manifest.spritesheet_path));
    } else {
        match image::ImageReader::open(&spritesheet).and_then(|reader| reader.with_guessed_format())
        {
            Ok(reader) => {
                format = reader.format().map(|value| format!("{value:?}"));
                match reader.decode() {
                    Ok(image) => {
                        width = Some(image.width());
                        height = Some(image.height());
                        if image.width() != 1536 || image.height() != 1872 {
                            errors.push(format!(
                                "spritesheet 크기는 1536x1872여야 합니다. 현재 {}x{}입니다.",
                                image.width(),
                                image.height()
                            ));
                        }
                        if image.color().has_alpha() == false {
                            warnings.push("spritesheet에 alpha 채널이 없습니다.".to_string());
                        }
                    }
                    Err(error) => errors.push(format!("spritesheet를 읽을 수 없습니다: {error}")),
                }
            }
            Err(error) => errors.push(format!("spritesheet 형식을 확인할 수 없습니다: {error}")),
        }
    }

    PetValidation {
        ok: errors.is_empty(),
        id: Some(manifest.id),
        display_name: Some(manifest.display_name),
        description: manifest.description,
        spritesheet_path: Some(manifest.spritesheet_path),
        width,
        height,
        format,
        errors,
        warnings,
    }
}

fn copy_pet_dir(source: &Path, dest_root: &Path, validation: &PetValidation) -> Result<PetSummary> {
    let id = validation
        .id
        .clone()
        .ok_or_else(|| anyhow!("missing pet id"))?;
    let display_name = validation
        .display_name
        .clone()
        .ok_or_else(|| anyhow!("missing display name"))?;
    let description = validation.description.clone().unwrap_or_default();
    let spritesheet_name = validation
        .spritesheet_path
        .clone()
        .ok_or_else(|| anyhow!("missing spritesheet path"))?;
    let target = dest_root.join(&id);
    fs::create_dir_all(&target)?;
    fs::copy(source.join("pet.json"), target.join("pet.json"))?;
    fs::copy(
        source.join(&spritesheet_name),
        target.join("spritesheet.webp"),
    )?;
    Ok(PetSummary {
        id,
        display_name,
        description,
        source: "installed".to_string(),
        manifest_path: Some(target.join("pet.json").to_string_lossy().to_string()),
        spritesheet_path: target
            .join("spritesheet.webp")
            .to_string_lossy()
            .to_string(),
        spritesheet_url: None,
    })
}

fn load_state_inner(app: &AppHandle) -> Result<AppData> {
    let path = state_path(app)?;
    if !path.exists() {
        return Ok(default_data());
    }
    let text = fs::read_to_string(path)?;
    let data = serde_json::from_str(&text)?;
    Ok(data)
}

fn save_state_inner(app: &AppHandle, data: &AppData) -> Result<()> {
    let path = state_path(app)?;
    fs::write(path, serde_json::to_string_pretty(data)?)?;
    Ok(())
}

fn normalize_installed_pet_paths(app: &AppHandle, mut data: AppData) -> Result<AppData> {
    let root = app_data_dir(app)?.join("pets");
    for pet in &mut data.installed_pets {
        if pet.source != "installed" {
            continue;
        }
        let pet_root = root.join(&pet.id);
        pet.manifest_path = Some(pet_root.join("pet.json").to_string_lossy().to_string());
        pet.spritesheet_path = pet_root
            .join("spritesheet.webp")
            .to_string_lossy()
            .to_string();
        pet.spritesheet_url = None;
    }
    Ok(data)
}

fn diagnostics_summary(app: &AppHandle, data: &AppData) -> Result<DiagnosticsSummary> {
    let app_data_dir = app_data_dir(app)?;
    let installed_pets = data
        .installed_pets
        .iter()
        .map(|pet| DiagnosticPet {
            id: pet.id.clone(),
            display_name: pet.display_name.clone(),
            source: pet.source.clone(),
            has_manifest: pet
                .manifest_path
                .as_ref()
                .map(|path| Path::new(path).is_file())
                .unwrap_or(false),
            has_spritesheet: Path::new(&pet.spritesheet_path).is_file(),
        })
        .collect();

    Ok(DiagnosticsSummary {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        tauri_version: tauri::VERSION.to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        app_data_dir_exists: app_data_dir.is_dir(),
        routine_count: data.routines.len(),
        enabled_routine_count: data
            .routines
            .iter()
            .filter(|routine| routine.enabled)
            .count(),
        installed_pet_count: data.installed_pets.len(),
        selected_pet_id: data.settings.selected_pet_id.clone(),
        pet_window_enabled: data.settings.pet_window_enabled,
        animation_mode: data.settings.animation_mode.clone(),
        resource_monitor_enabled: data.settings.resource_monitor_enabled,
        battery_monitor_enabled: data.settings.battery_monitor_enabled,
        quick_action_count: data.settings.quick_actions.len(),
        enabled_quick_action_count: data
            .settings
            .quick_actions
            .iter()
            .filter(|action| action.enabled)
            .count(),
        installed_pets,
    })
}

fn battery_snapshot(enabled: bool) -> (Option<f32>, Option<String>) {
    if !enabled {
        return (None, None);
    }
    let manager = match battery::Manager::new() {
        Ok(value) => value,
        Err(_) => return (None, None),
    };
    let mut batteries = match manager.batteries() {
        Ok(value) => value,
        Err(_) => return (None, None),
    };
    let Some(Ok(battery)) = batteries.next() else {
        return (None, None);
    };
    (
        Some(battery.state_of_charge().get::<percent>()),
        Some(format!("{:?}", battery.state())),
    )
}

fn collect_resource_snapshot(system: &mut System, battery_enabled: bool) -> ResourceSnapshot {
    system.refresh_cpu();
    system.refresh_memory();
    let total_memory = system.total_memory() as f32;
    let memory_percent = if total_memory > 0.0 {
        (system.used_memory() as f32 / total_memory) * 100.0
    } else {
        0.0
    };
    let (battery_percent, battery_state) = battery_snapshot(battery_enabled);
    ResourceSnapshot {
        cpu_percent: system.global_cpu_info().cpu_usage(),
        memory_percent,
        battery_percent,
        battery_state,
    }
}

fn spawn_resource_monitor(app: AppHandle, state: ResourceMonitorState) {
    thread::spawn(move || {
        let mut system = System::new();
        system.refresh_cpu();
        loop {
            let (enabled, battery_enabled) = match state.0.lock() {
                Ok(runtime) => (runtime.enabled, runtime.battery_enabled),
                Err(_) => (false, false),
            };
            if !enabled {
                thread::sleep(Duration::from_secs(10));
                continue;
            }

            let pet_visible = app
                .get_webview_window("pet")
                .and_then(|window| window.is_visible().ok())
                .unwrap_or(false);
            let main_visible = app
                .get_webview_window("main")
                .and_then(|window| window.is_visible().ok())
                .unwrap_or(false);
            if !pet_visible && !main_visible {
                thread::sleep(Duration::from_secs(10));
                continue;
            }

            let snapshot = collect_resource_snapshot(&mut system, battery_enabled);
            let _ = app.emit("resource-snapshot", snapshot);
            thread::sleep(Duration::from_secs(if pet_visible { 2 } else { 10 }));
        }
    });
}

fn parse_start_time(value: &str) -> Option<(u32, u32)> {
    let (hour, minute) = value.split_once(':')?;
    let hour = hour.parse::<u32>().ok()?;
    let minute = minute.parse::<u32>().ok()?;
    if hour < 24 && minute < 60 {
        Some((hour, minute))
    } else {
        None
    }
}

fn spawn_routine_scheduler(app: AppHandle) {
    thread::spawn(move || {
        let mut fired: HashSet<String> = HashSet::new();
        loop {
            let now = Local::now();
            let today_key = now.format("%Y-%m-%d").to_string();
            fired.retain(|key| key.starts_with(&today_key));

            if let Ok(data) = load_state_inner(&app) {
                let weekday = now.weekday().num_days_from_sunday() as u8;
                for routine in data.routines {
                    if !routine.enabled || !routine.repeat_days.contains(&weekday) {
                        continue;
                    }
                    let Some((hour, minute)) = parse_start_time(&routine.start_time) else {
                        continue;
                    };
                    if now.hour() != hour || now.minute() != minute {
                        continue;
                    }
                    let key = format!("{today_key}:{}", routine.id);
                    if fired.insert(key) {
                        let _ = app.emit(
                            "routine-due",
                            serde_json::json!({
                                "id": routine.id,
                                "subject": routine.subject,
                                "message": routine.message,
                                "focusMinutes": routine.focus_minutes,
                                "breakMinutes": routine.break_minutes,
                                "startTime": routine.start_time
                            }),
                        );
                    }
                }
            }

            thread::sleep(Duration::from_secs(30));
        }
    });
}

fn github_tree_to_raw(url: &Url) -> Option<(String, String)> {
    if url.host_str()? != "github.com" {
        return None;
    }
    let segments: Vec<_> = url.path_segments()?.collect();
    if segments.len() < 5 || segments[2] != "tree" {
        return None;
    }
    let owner = segments[0];
    let repo = segments[1];
    let branch = segments[3];
    let folder = segments[4..].join("/");
    let base = format!("https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{folder}");
    Some((
        format!("{base}/pet.json"),
        format!("{base}/spritesheet.webp"),
    ))
}

fn github_blob_to_raw(url: &Url) -> Option<String> {
    if url.host_str()? != "github.com" {
        return None;
    }
    let segments: Vec<_> = url.path_segments()?.collect();
    if segments.len() < 5 || segments[2] != "blob" {
        return None;
    }
    let owner = segments[0];
    let repo = segments[1];
    let branch = segments[3];
    let path = segments[4..].join("/");
    Some(format!(
        "https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
    ))
}

fn download_bytes(url: &str) -> Result<Vec<u8>> {
    let response = reqwest::blocking::get(url)?.error_for_status()?;
    Ok(response.bytes()?.to_vec())
}

fn write_downloaded_pet(temp: &Path, url: &str) -> Result<PathBuf> {
    fs::create_dir_all(temp)?;
    let parsed = Url::parse(url).context("URL 형식이 올바르지 않습니다")?;
    if parsed.path().ends_with(".zip") {
        let bytes = download_bytes(url)?;
        let mut archive = ZipArchive::new(Cursor::new(bytes))?;
        archive.extract(temp)?;
        let pet_json = find_file(temp, "pet.json")
            .ok_or_else(|| anyhow!("ZIP 안에서 pet.json을 찾지 못했습니다"))?;
        return Ok(pet_json.parent().unwrap_or(temp).to_path_buf());
    }

    if let Some((manifest_url, spritesheet_url)) = github_tree_to_raw(&parsed) {
        fs::write(temp.join("pet.json"), download_bytes(&manifest_url)?)?;
        fs::write(
            temp.join("spritesheet.webp"),
            download_bytes(&spritesheet_url)?,
        )?;
        return Ok(temp.to_path_buf());
    }

    if let Some(raw) = github_blob_to_raw(&parsed) {
        if raw.ends_with("pet.json") {
            let base = raw.trim_end_matches("pet.json");
            fs::write(temp.join("pet.json"), download_bytes(&raw)?)?;
            fs::write(
                temp.join("spritesheet.webp"),
                download_bytes(&format!("{base}spritesheet.webp"))?,
            )?;
            return Ok(temp.to_path_buf());
        }
    }

    if parsed.path().ends_with("pet.json") {
        let base = url.trim_end_matches("pet.json");
        fs::write(temp.join("pet.json"), download_bytes(url)?)?;
        fs::write(
            temp.join("spritesheet.webp"),
            download_bytes(&format!("{base}spritesheet.webp"))?,
        )?;
        return Ok(temp.to_path_buf());
    }

    Err(anyhow!(
        "지원하는 URL은 GitHub 폴더, pet.json URL, ZIP URL입니다."
    ))
}

fn find_file(root: &Path, name: &str) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(path) = stack.pop() {
        for entry in fs::read_dir(path).ok()? {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.file_name().and_then(|value| value.to_str()) == Some(name) {
                return Some(path);
            }
        }
    }
    None
}

#[tauri::command]
fn load_app_data(app: AppHandle) -> Result<AppData, String> {
    load_state_inner(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_app_data(app: AppHandle, data: AppData) -> Result<(), String> {
    save_state_inner(&app, &data).map_err(|error| error.to_string())
}

#[tauri::command]
fn app_data_location(app: AppHandle) -> Result<String, String> {
    app_data_dir(&app)
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn export_app_backup(app: AppHandle, path: String) -> Result<(), String> {
    let data = load_state_inner(&app).map_err(|error| error.to_string())?;
    let target = PathBuf::from(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let file = File::create(&target).map_err(|error| error.to_string())?;
    let mut zip = ZipWriter::new(file);
    let state_json = serde_json::to_vec_pretty(&data).map_err(|error| error.to_string())?;
    zip.start_file(
        "state.json",
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
    )
    .map_err(|error| error.to_string())?;
    zip.write_all(&state_json)
        .map_err(|error| error.to_string())?;

    let pet_root = app_data_dir(&app)
        .map_err(|error| error.to_string())?
        .join("pets");
    add_dir_to_zip(&mut zip, &pet_root, &pet_root, "pets").map_err(|error| error.to_string())?;
    zip.finish().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn export_diagnostics(app: AppHandle, path: String) -> Result<(), String> {
    let data = load_state_inner(&app).map_err(|error| error.to_string())?;
    let summary = diagnostics_summary(&app, &data).map_err(|error| error.to_string())?;
    let target = PathBuf::from(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let file = File::create(&target).map_err(|error| error.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("diagnostics.json", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(&serde_json::to_vec_pretty(&summary).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;

    let state = serde_json::json!({
        "routines": data.routines.iter().map(|routine| DiagnosticRoutine {
            focus_minutes: routine.focus_minutes,
            break_minutes: routine.break_minutes,
            start_time: routine.start_time.clone(),
            repeat_day_count: routine.repeat_days.len(),
            enabled: routine.enabled,
            subject_length: routine.subject.chars().count(),
            message_length: routine.message.chars().count(),
        }).collect::<Vec<_>>(),
        "installedPets": summary.installed_pets,
        "settings": {
            "selectedPetId": data.settings.selected_pet_id,
            "petWindowEnabled": data.settings.pet_window_enabled,
            "animationMode": data.settings.animation_mode,
            "autostartEnabled": data.settings.autostart_enabled,
            "resourceMonitorEnabled": data.settings.resource_monitor_enabled,
            "batteryMonitorEnabled": data.settings.battery_monitor_enabled,
            "quickActionCount": data.settings.quick_actions.len(),
            "enabledQuickActionCount": data.settings.quick_actions.iter().filter(|action| action.enabled).count()
        }
    });
    zip.start_file("state-redacted.json", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(&serde_json::to_vec_pretty(&state).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    zip.finish().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn import_app_backup(app: AppHandle, path: String) -> Result<AppData, String> {
    let file = File::open(&path).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
    let temp = tempfile::tempdir().map_err(|error| error.to_string())?;

    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|error| error.to_string())?;
        let Some(enclosed) = file.enclosed_name().map(|value| value.to_owned()) else {
            return Err("백업 ZIP 안에 안전하지 않은 경로가 있습니다.".to_string());
        };
        let allowed = enclosed == PathBuf::from("state.json") || enclosed.starts_with("pets");
        if !allowed {
            continue;
        }
        let output = temp.path().join(enclosed);
        if file.is_dir() {
            fs::create_dir_all(output).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut target = File::create(output).map_err(|error| error.to_string())?;
        std::io::copy(&mut file, &mut target).map_err(|error| error.to_string())?;
    }

    let state_file = temp.path().join("state.json");
    let state_text = fs::read_to_string(&state_file)
        .map_err(|_| "백업 ZIP 안에 state.json이 없습니다.".to_string())?;
    let data: AppData = serde_json::from_str(&state_text)
        .map_err(|error| format!("state.json 형식이 올바르지 않습니다: {error}"))?;
    let app_pet_root = pets_dir(&app).map_err(|error| error.to_string())?;
    if app_pet_root.exists() {
        fs::remove_dir_all(&app_pet_root).map_err(|error| error.to_string())?;
    }
    copy_dir_recursive(&temp.path().join("pets"), &app_pet_root)
        .map_err(|error| error.to_string())?;
    let normalized =
        normalize_installed_pet_paths(&app, data).map_err(|error| error.to_string())?;
    save_state_inner(&app, &normalized).map_err(|error| error.to_string())?;
    Ok(normalized)
}

#[tauri::command]
fn list_builtin_pets() -> Vec<PetSummary> {
    vec![
        PetSummary {
            id: "calico".to_string(),
            display_name: "Calico".to_string(),
            description: "첨부 이미지에서 분리한 삼색 고양이 기본 펫".to_string(),
            source: "builtin".to_string(),
            manifest_path: None,
            spritesheet_path: "/pets/calico/spritesheet.webp".to_string(),
            spritesheet_url: Some("/pets/calico/spritesheet.webp".to_string()),
        },
        PetSummary {
            id: "max".to_string(),
            display_name: "Max".to_string(),
            description: "첨부 이미지에서 분리한 골든 강아지 기본 펫".to_string(),
            source: "builtin".to_string(),
            manifest_path: None,
            spritesheet_path: "/pets/max/spritesheet.webp".to_string(),
            spritesheet_url: Some("/pets/max/spritesheet.webp".to_string()),
        },
        PetSummary {
            id: "haro".to_string(),
            display_name: "Haro".to_string(),
            description: "초록 귀와 노란 볼을 가진 하이러닝 동반자 펫".to_string(),
            source: "builtin".to_string(),
            manifest_path: None,
            spritesheet_path: "/pets/haro/spritesheet.webp".to_string(),
            spritesheet_url: Some("/pets/haro/spritesheet.webp".to_string()),
        },
        PetSummary {
            id: "airo".to_string(),
            display_name: "Airo".to_string(),
            description: "파란 마법 모자를 쓴 하이러닝 고양이 펫".to_string(),
            source: "builtin".to_string(),
            manifest_path: None,
            spritesheet_path: "/pets/airo/spritesheet.webp".to_string(),
            spritesheet_url: Some("/pets/airo/spritesheet.webp".to_string()),
        },
    ]
}

#[tauri::command]
fn recommended_pets() -> Vec<RecommendedPet> {
    vec![
        RecommendedPet {
            id: "calico".to_string(),
            display_name: "Calico".to_string(),
            description: "삼색 고양이 기본 캐릭터".to_string(),
            url: "https://github.com/techkwon/codex-characters/tree/main/apps/desktop/public/pets/calico".to_string(),
        },
        RecommendedPet {
            id: "max".to_string(),
            display_name: "Max".to_string(),
            description: "골든 강아지 기본 캐릭터".to_string(),
            url: "https://github.com/techkwon/codex-characters/tree/main/apps/desktop/public/pets/max".to_string(),
        },
        RecommendedPet {
            id: "haro".to_string(),
            display_name: "Haro".to_string(),
            description: "기본 하이러닝 동반자 캐릭터".to_string(),
            url: "https://github.com/techkwon/codex-characters/tree/main/highlearning/haro".to_string(),
        },
        RecommendedPet {
            id: "airo".to_string(),
            display_name: "Airo".to_string(),
            description: "파란 마법 모자 캐릭터".to_string(),
            url: "https://github.com/techkwon/codex-characters/tree/main/highlearning/airo".to_string(),
        },
    ]
}

#[tauri::command]
fn validate_pet_folder(path: String) -> PetValidation {
    validate_pet_dir(Path::new(&path))
}

#[tauri::command]
fn install_pet_from_folder(app: AppHandle, path: String) -> Result<PetSummary, String> {
    let path = PathBuf::from(path);
    let validation = validate_pet_dir(&path);
    if !validation.ok {
        return Err(validation.errors.join("\n"));
    }
    copy_pet_dir(
        &path,
        &pets_dir(&app).map_err(|error| error.to_string())?,
        &validation,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn validate_pet_url(url: String) -> Result<PetValidation, String> {
    let temp = tempfile::tempdir().map_err(|error| error.to_string())?;
    let folder = write_downloaded_pet(temp.path(), &url).map_err(|error| error.to_string())?;
    Ok(validate_pet_dir(&folder))
}

#[tauri::command]
fn install_pet_from_url(app: AppHandle, url: String) -> Result<PetSummary, String> {
    let temp = tempfile::tempdir().map_err(|error| error.to_string())?;
    let folder = write_downloaded_pet(temp.path(), &url).map_err(|error| error.to_string())?;
    let validation = validate_pet_dir(&folder);
    if !validation.ok {
        return Err(validation.errors.join("\n"));
    }
    copy_pet_dir(
        &folder,
        &pets_dir(&app).map_err(|error| error.to_string())?,
        &validation,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn show_pet_window(app: AppHandle, show: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pet") {
        if show {
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().ok();
        } else {
            window.hide().map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn show_main_section(app: AppHandle, section: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().ok();
    }
    app.emit("show-main-section", section)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_resource_monitor_settings(
    state: State<'_, ResourceMonitorState>,
    enabled: bool,
    battery_enabled: bool,
) -> Result<(), String> {
    let mut runtime = state.0.lock().map_err(|_| "resource monitor lock failed")?;
    runtime.enabled = enabled;
    runtime.battery_enabled = battery_enabled;
    Ok(())
}

#[tauri::command]
fn start_focus_session(
    app: AppHandle,
    runtime: State<'_, Mutex<SessionRuntime>>,
    subject: String,
    focus_minutes: u32,
    break_minutes: u32,
) -> Result<(), String> {
    stop_focus_session(runtime.clone())?;
    let cancel = Arc::new(AtomicBool::new(false));
    runtime.lock().map_err(|_| "session lock failed")?.cancel = Some(cancel.clone());
    thread::spawn(move || {
        let phases = [
            ("focus".to_string(), focus_minutes.saturating_mul(60)),
            ("break".to_string(), break_minutes.saturating_mul(60)),
        ];
        for (phase, total) in phases {
            if total == 0 {
                continue;
            }
            for remaining in (0..=total).rev() {
                if cancel.load(Ordering::Relaxed) {
                    let _ = app.emit("session-cancelled", &subject);
                    return;
                }
                let _ = app.emit(
                    "session-tick",
                    serde_json::json!({
                        "subject": subject,
                        "phase": phase,
                        "remainingSeconds": remaining,
                        "totalSeconds": total
                    }),
                );
                thread::sleep(Duration::from_secs(1));
            }
            let _ = app.emit(
                "session-phase-complete",
                serde_json::json!({ "subject": subject, "phase": phase }),
            );
        }
        let _ = app.emit("session-complete", &subject);
    });
    Ok(())
}

#[tauri::command]
fn stop_focus_session(runtime: State<'_, Mutex<SessionRuntime>>) -> Result<(), String> {
    if let Some(cancel) = runtime
        .lock()
        .map_err(|_| "session lock failed")?
        .cancel
        .take()
    {
        cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}

fn setup_tray(app: &mut tauri::App) -> Result<()> {
    let show = MenuItem::with_id(app, "show", "오늘 루틴 보기", true, None::<&str>)?;
    let focus = MenuItem::with_id(app, "focus", "집중 시작", true, None::<&str>)?;
    let pet = MenuItem::with_id(app, "pet", "펫 창 열기/닫기", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "설정", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &focus, &pet, &settings, &quit])?;
    TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" | "settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "focus" => {
                let _ = app.emit("tray-start-focus", ());
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "pet" => {
                if let Some(window) = app.get_webview_window("pet") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                    }
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    let resource_state = ResourceMonitorState(Arc::new(Mutex::new(ResourceRuntime {
        enabled: true,
        battery_enabled: true,
    })));
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(SessionRuntime::default()))
        .manage(resource_state.clone())
        .setup(|app| {
            setup_tray(app)?;
            spawn_resource_monitor(app.handle().clone(), resource_state);
            spawn_routine_scheduler(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_app_data,
            save_app_data,
            list_builtin_pets,
            recommended_pets,
            validate_pet_folder,
            install_pet_from_folder,
            validate_pet_url,
            install_pet_from_url,
            show_pet_window,
            show_main_section,
            set_resource_monitor_settings,
            app_data_location,
            export_app_backup,
            export_diagnostics,
            import_app_backup,
            start_focus_session,
            stop_focus_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running HighLearning Pet Reminder");
}
