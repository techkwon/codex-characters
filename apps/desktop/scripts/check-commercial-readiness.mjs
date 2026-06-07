#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const repoDir = resolve(appDir, "../..");

const paths = {
  packageJson: resolve(appDir, "package.json"),
  tauriConfig: resolve(appDir, "src-tauri/tauri.conf.json"),
  cargoToml: resolve(appDir, "src-tauri/Cargo.toml"),
  appTsx: resolve(appDir, "src/App.tsx"),
  appRust: resolve(appDir, "src-tauri/src/lib.rs"),
  desktopBuildWorkflow: resolve(repoDir, ".github/workflows/desktop-build.yml"),
  desktopReleaseWorkflow: resolve(repoDir, ".github/workflows/desktop-release.yml"),
  releaseChecklist: resolve(appDir, "RELEASE_CHECKLIST.md"),
};

const failures = [];
const passes = [];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function pass(message) {
  passes.push(message);
}

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
}

function requirePath(path, label) {
  assert(existsSync(path), `${label} exists`);
}

function checkPackageScripts() {
  const packageJson = readJson(paths.packageJson);
  const requiredScripts = [
    "typecheck",
    "build:ui",
    "smoke:preview",
    "build",
    "release:check",
    "signing:check",
    "commercial:check",
    "package:portable:mac",
    "package:portable:win",
    "measure:mac",
  ];

  for (const script of requiredScripts) {
    assert(Boolean(packageJson.scripts?.[script]), `npm script '${script}' is defined`);
  }
}

function checkTauriSecurity() {
  const config = readJson(paths.tauriConfig);
  const csp = config.app?.security?.csp;
  const assetProtocol = config.app?.security?.assetProtocol;
  const bundleTargets = new Set(config.bundle?.targets ?? []);
  const windows = config.app?.windows ?? [];
  const mainWindow = windows.find((window) => window.label === "main");
  const petWindow = windows.find((window) => window.label === "pet");

  assert(config.productName === "Codex Pet", "Tauri product name is stable");
  assert(config.identifier === "com.highlearning.petreminder", "Tauri app identifier is stable");
  assert(config.bundle?.active === true, "Tauri bundling is enabled");
  assert(config.app?.macOSPrivateApi === true, "macOS transparent pet window support is enabled");
  assert(mainWindow?.visible === false, "main settings window is hidden on launch");
  assert(mainWindow?.title === "Codex Pet Settings", "main settings window is labelled as settings");
  assert(petWindow?.visible === true, "standalone pet window is visible on launch");
  assert(petWindow?.transparent === true, "standalone pet window is transparent");
  assert(petWindow?.backgroundColor === "#00000000", "standalone pet window background is fully transparent");
  assert(petWindow?.decorations === false, "standalone pet window has no native chrome");
  assert(petWindow?.alwaysOnTop === true, "standalone pet window stays above normal windows");
  assert(petWindow?.shadow === false, "standalone pet window does not draw a card shadow");
  for (const target of ["app", "dmg", "msi", "nsis"]) {
    assert(bundleTargets.has(target), `Tauri bundle target '${target}' is enabled`);
  }

  assert(csp && typeof csp === "object", "Tauri CSP is enabled as a directive object");
  assert(csp?.["default-src"] === "'self'", "CSP default-src is self only");
  assert(csp?.["script-src"] === "'self'", "CSP script-src blocks remote scripts");
  assert(!String(csp?.["script-src"] ?? "").includes("unsafe-eval"), "CSP script-src does not allow unsafe-eval");
  assert(String(csp?.["style-src"] ?? "").includes("'self'"), "CSP style-src keeps local styles available");
  assert(String(csp?.["img-src"] ?? "").includes("asset:"), "CSP img-src allows Tauri asset protocol for installed pets");
  assert(String(csp?.["connect-src"] ?? "").includes("ipc:"), "CSP connect-src allows Tauri IPC");
  assert(csp?.["object-src"] === "'none'", "CSP object-src is disabled");
  assert(csp?.["frame-ancestors"] === "'none'", "CSP frame embedding is disabled");

  assert(assetProtocol?.enable === true, "Tauri asset protocol is enabled");
  assert(
    Array.isArray(assetProtocol?.scope) && assetProtocol.scope.includes("$APPDATA/pets/**/*"),
    "Tauri asset protocol scope is limited to app data pets",
  );

  const cargoToml = readText(paths.cargoToml);
  assert(/tauri\s*=\s*\{[^}]*features\s*=\s*\[[^\]]*"protocol-asset"/s.test(cargoToml), "Cargo enables Tauri protocol-asset feature");
  assert(/tauri\s*=\s*\{[^}]*features\s*=\s*\[[^\]]*"tray-icon"/s.test(cargoToml), "Cargo enables Tauri tray-icon feature");
  assert(/tauri\s*=\s*\{[^}]*features\s*=\s*\[[^\]]*"macos-private-api"/s.test(cargoToml), "Cargo enables Tauri macos-private-api feature");
}

function checkBuiltinPets() {
  const requiredPets = ["calico", "max", "haro", "airo"];
  for (const pet of requiredPets) {
    const petDir = resolve(appDir, "public/pets", pet);
    const manifestPath = resolve(petDir, "pet.json");
    const spritesheetPath = resolve(petDir, "spritesheet.webp");
    requirePath(manifestPath, `built-in pet ${pet} manifest`);
    requirePath(spritesheetPath, `built-in pet ${pet} spritesheet`);
    if (existsSync(manifestPath)) {
      const manifest = readJson(manifestPath);
      assert(manifest.id === pet, `built-in pet ${pet} manifest id matches folder`);
      assert(manifest.spritesheetPath === "spritesheet.webp", `built-in pet ${pet} uses local spritesheet.webp`);
    }
  }
}

function checkWorkflow(path, label) {
  const text = readText(path);
  assert(text.includes("actions/checkout@v6"), `${label} uses Node 24 checkout action`);
  assert(text.includes("actions/setup-node@v6"), `${label} uses Node 24 setup-node action`);
  assert(text.includes("actions/upload-artifact@v7"), `${label} uses Node 24 upload-artifact action`);
  assert(!/actions\/(checkout|setup-node|upload-artifact|download-artifact)@v[1-5]\b/.test(text), `${label} has no old official Node 20 action majors`);
  assert(text.includes("windows-2025-vs2026"), `${label} pins Windows runner migration label`);
  assert(!text.includes("windows-latest"), `${label} avoids drifting windows-latest label`);
  assert(text.includes("npm run commercial:check"), `${label} runs commercial readiness gate`);
  assert(text.includes("npm run smoke:preview"), `${label} runs preview smoke test`);
  assert(text.includes("npm run release:check"), `${label} runs release metadata gate`);
  assert(text.includes("npm run signing:check") || text.includes("check-signing-readiness.mjs"), `${label} runs signing readiness gate`);
}

function checkWorkflows() {
  checkWorkflow(paths.desktopBuildWorkflow, "Desktop Build workflow");
  checkWorkflow(paths.desktopReleaseWorkflow, "Desktop Release workflow");
  const releaseText = readText(paths.desktopReleaseWorkflow);
  assert(releaseText.includes("actions/download-artifact@v7"), "Desktop Release workflow uses Node 24 download-artifact action");
  assert(releaseText.includes("softprops/action-gh-release@v2"), "Desktop Release workflow publishes GitHub Releases");
}

function checkReleaseChecklist() {
  const text = readText(paths.releaseChecklist);
  assert(text.includes("npm run commercial:check"), "Release checklist includes commercial readiness gate");
  assert(text.includes("npm run smoke:preview"), "Release checklist includes preview smoke gate");
  assert(text.includes("Mac App Store 등록 제외"), "Release checklist keeps Mac App Store out of scope");
  assert(text.includes("GitHub Release"), "Release checklist covers GitHub Release distribution");
}

function checkStandalonePetExperience() {
  const appTsx = readText(paths.appTsx);
  const appRust = readText(paths.appRust);

  assert(appTsx.includes("setPosition(new LogicalPosition"), "standalone pet can be moved from the character surface");
  assert(appTsx.includes("data-tauri-drag-region"), "standalone pet marks the character surface as a native drag region");
  assert(appTsx.includes("move_pet_window"), "standalone pet exposes button-based move controls");
  assert(appTsx.includes("pet-direct-controls"), "standalone pet exposes always-visible direct controls");
  assert(appTsx.includes("place_pet_window_bottom_right"), "standalone pet defaults to the lower-right screen position");
  assert(appTsx.includes("petSize"), "settings expose pet size control");
  assert(appTsx.includes("petSize: 150"), "standalone pet default size is compact");
  assert(appTsx.includes("petLayoutVersion"), "settings track pet layout migration version");
  assert(appTsx.includes("showPetStatus"), "settings expose pet status bubble visibility");
  assert(appTsx.includes("showPetResource"), "settings expose pet resource info visibility");
  assert(appTsx.includes("showPetTimer"), "settings expose pet timer info visibility");
  assert(appTsx.includes("petStatusText"), "pet shows Codex-style situational status text");
  assert(appTsx.includes("animationSpeed(resource)"), "pet animation speed is linked to resource pressure");
  assert(appRust.includes("set_pet_window_size"), "backend exposes pet window size command");
  assert(appRust.includes("fn default_pet_size() -> u32 {\n    150\n}"), "backend default pet size is compact");
  assert(appRust.includes("pet_layout_version"), "backend migrates old pet layout defaults once");
  assert(appRust.includes("116.0"), "backend lower-right placement leaves room above the Dock/taskbar");
  assert(appRust.includes("move_pet_window"), "backend exposes pet move command");
  assert(appRust.includes("place_pet_window_bottom_right"), "backend exposes lower-right placement command");
  assert(appRust.includes("pet_size: u32"), "settings persist pet size");
  assert(appRust.includes("show_pet_status: bool"), "settings persist pet status display preference");
  assert(appRust.includes("show_pet_resource: bool"), "settings persist pet resource display preference");
  assert(appRust.includes("show_pet_timer: bool"), "settings persist pet timer display preference");
}

checkPackageScripts();
checkTauriSecurity();
checkBuiltinPets();
checkWorkflows();
checkReleaseChecklist();
checkStandalonePetExperience();

for (const message of passes) {
  console.log(`PASS ${message}`);
}

if (failures.length > 0) {
  for (const message of failures) {
    console.error(`FAIL ${message}`);
  }
  console.error(`Commercial readiness failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`Commercial readiness passed with ${passes.length} checks.`);
