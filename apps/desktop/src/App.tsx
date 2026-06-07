import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getCurrentWindow } from "@tauri-apps/api/window";

type PetSummary = {
  id: string;
  displayName: string;
  description: string;
  source: "builtin" | "installed" | string;
  manifestPath?: string | null;
  spritesheetPath: string;
  spritesheetUrl?: string | null;
};

type Routine = {
  id: string;
  subject: string;
  focusMinutes: number;
  breakMinutes: number;
  startTime: string;
  repeatDays: number[];
  enabled: boolean;
  message: string;
};

type AppSettings = {
  selectedPetId: string;
  petWindowEnabled: boolean;
  animationMode: "event" | "low-fps";
  autostartEnabled: boolean;
  resourceMonitorEnabled: boolean;
  batteryMonitorEnabled: boolean;
  quickActions: QuickAction[];
};

type AppData = {
  settings: AppSettings;
  routines: Routine[];
  installedPets: PetSummary[];
};

type QuickAction = {
  id: string;
  name: string;
  target: string;
  enabled: boolean;
};

type PetValidation = {
  ok: boolean;
  id?: string | null;
  displayName?: string | null;
  description?: string | null;
  spritesheetPath?: string | null;
  width?: number | null;
  height?: number | null;
  format?: string | null;
  errors: string[];
  warnings: string[];
};

type RecommendedPet = {
  id: string;
  displayName: string;
  description: string;
  url: string;
};

type UpdateCheck = {
  currentVersion: string;
  latestVersion?: string | null;
  latestTag?: string | null;
  releaseName?: string | null;
  releaseUrl?: string | null;
  updateAvailable: boolean;
  prerelease: boolean;
  message: string;
};

type SessionTick = {
  subject: string;
  phase: "focus" | "break";
  remainingSeconds: number;
  totalSeconds: number;
};

type ResourceSnapshot = {
  cpuPercent: number;
  memoryPercent: number;
  batteryPercent?: number | null;
  batteryState?: string | null;
};

type RoutineDue = {
  id: string;
  subject: string;
  message: string;
  focusMinutes: number;
  breakMinutes: number;
  startTime: string;
};

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

const fallbackData: AppData = {
  settings: {
    selectedPetId: "calico",
    petWindowEnabled: true,
    animationMode: "event",
    autostartEnabled: false,
    resourceMonitorEnabled: true,
    batteryMonitorEnabled: true,
    quickActions: [],
  },
  routines: [
    {
      id: "default-focus",
      subject: "오늘의 학습",
      focusMinutes: 25,
      breakMinutes: 5,
      startTime: "09:00",
      repeatDays: [1, 2, 3, 4, 5],
      enabled: true,
      message: "오늘의 펫과 함께 집중할 시간입니다.",
    },
  ],
  installedPets: [],
};

const builtinFallback: PetSummary[] = [
  {
    id: "calico",
    displayName: "Calico",
    description: "첨부 이미지에서 분리한 삼색 고양이 기본 펫",
    source: "builtin",
    spritesheetPath: "/pets/calico/spritesheet.webp",
    spritesheetUrl: "/pets/calico/spritesheet.webp",
  },
  {
    id: "max",
    displayName: "Max",
    description: "첨부 이미지에서 분리한 골든 강아지 기본 펫",
    source: "builtin",
    spritesheetPath: "/pets/max/spritesheet.webp",
    spritesheetUrl: "/pets/max/spritesheet.webp",
  },
  {
    id: "haro",
    displayName: "Haro",
    description: "초록 귀와 노란 볼을 가진 하이러닝 동반자 펫",
    source: "builtin",
    spritesheetPath: "/pets/haro/spritesheet.webp",
    spritesheetUrl: "/pets/haro/spritesheet.webp",
  },
  {
    id: "airo",
    displayName: "Airo",
    description: "파란 마법 모자를 쓴 하이러닝 고양이 펫",
    source: "builtin",
    spritesheetPath: "/pets/airo/spritesheet.webp",
    spritesheetUrl: "/pets/airo/spritesheet.webp",
  },
];

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    if (command === "load_app_data") return fallbackData as T;
    if (command === "list_builtin_pets") return builtinFallback as T;
    if (command === "recommended_pets") {
      return [
        {
          id: "calico",
          displayName: "Calico",
          description: "삼색 고양이 기본 캐릭터",
          url: "https://github.com/techkwon/codex-characters/tree/main/apps/desktop/public/pets/calico",
        },
        {
          id: "max",
          displayName: "Max",
          description: "골든 강아지 기본 캐릭터",
          url: "https://github.com/techkwon/codex-characters/tree/main/apps/desktop/public/pets/max",
        },
        {
          id: "haro",
          displayName: "Haro",
          description: "기본 하이러닝 동반자 캐릭터",
          url: "https://github.com/techkwon/codex-characters/tree/main/highlearning/haro",
        },
        {
          id: "airo",
          displayName: "Airo",
          description: "파란 마법 모자 캐릭터",
          url: "https://github.com/techkwon/codex-characters/tree/main/highlearning/airo",
        },
      ] as T;
    }
    if (command === "validate_pet_folder" || command === "validate_pet_url") {
      return {
        ok: false,
        errors: ["브라우저 미리보기에서는 로컬/웹 펫 검증을 실행할 수 없습니다."],
        warnings: [],
      } as T;
    }
    if (command === "app_data_location") return "/preview/codex-pet" as T;
    if (command === "check_for_updates") {
      return {
        currentVersion: "0.1.0",
        latestVersion: null,
        latestTag: null,
        releaseName: null,
        releaseUrl: null,
        updateAvailable: false,
        prerelease: false,
        message: "브라우저 미리보기에서는 업데이트 확인을 실행할 수 없습니다.",
      } as T;
    }
    return undefined as T;
  }
  return invoke<T>(command, args);
}

function spriteUrl(pet?: PetSummary) {
  if (!pet) return "/pets/calico/spritesheet.webp";
  if (pet.spritesheetUrl) return pet.spritesheetUrl;
  if (pet.source === "builtin") return pet.spritesheetPath;
  return convertFileSrc(pet.spritesheetPath);
}

function formatTime(seconds: number) {
  const minute = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const second = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minute}:${second}`;
}

function isUrlTarget(target: string) {
  return /^(https?:|mailto:|tel:)/i.test(target.trim());
}

function resourceLevel(resource: ResourceSnapshot | null) {
  if (!resource) return "대기";
  const pressure = Math.max(resource.cpuPercent, resource.memoryPercent);
  if (pressure >= 80) return "높음";
  if (pressure >= 50) return "보통";
  return "낮음";
}

function resourcePetState(resource: ResourceSnapshot | null): "idle" | "focus" | "break" | "wait" {
  if (!resource) return "idle";
  const pressure = Math.max(resource.cpuPercent, resource.memoryPercent);
  if (pressure >= 80) return "wait";
  if (pressure >= 50) return "focus";
  return "idle";
}

function PetSprite({
  pet,
  state,
  active,
  size = 168,
  speedMs = 240,
}: {
  pet?: PetSummary;
  state: "idle" | "focus" | "break" | "success" | "wait";
  active: boolean;
  size?: number;
  speedMs?: number;
}) {
  const [frame, setFrame] = useState(0);
  const row = state === "focus" ? 8 : state === "break" ? 3 : state === "success" ? 4 : state === "wait" ? 6 : 0;
  const frames = row === 3 ? 4 : row === 4 ? 5 : 6;

  useEffect(() => {
    if (!active) {
      setFrame(0);
      return;
    }
    const timer = window.setInterval(() => {
      setFrame((value) => (value + 1) % frames);
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [active, frames, speedMs]);

  return (
    <div
      className="pet-sprite"
      style={{
        width: size,
        height: Math.round(size * 1.083),
        backgroundImage: `url("${spriteUrl(pet)}")`,
        backgroundSize: "800% 900%",
        backgroundPosition: `${(frame / 7) * 100}% ${(row / 8) * 100}%`,
      }}
      aria-label={pet?.displayName ?? "pet"}
    />
  );
}

function QuickMenu({
  quickActions,
  sessionActive,
  onStartFocus,
  onStopFocus,
  onQuickReminder,
  onShowRoutines,
  onShowPets,
  onShowImport,
  onShowSettings,
  onOpenQuickAction,
}: {
  quickActions: QuickAction[];
  sessionActive: boolean;
  onStartFocus: () => void;
  onStopFocus: () => void;
  onQuickReminder: () => void;
  onShowRoutines: () => void;
  onShowPets: () => void;
  onShowImport: () => void;
  onShowSettings: () => void;
  onOpenQuickAction: (action: QuickAction) => void;
}) {
  return (
    <div className="quick-menu" onClick={(event) => event.stopPropagation()}>
      <button onClick={sessionActive ? onStopFocus : onStartFocus}>{sessionActive ? "집중 정지" : "집중 시작"}</button>
      <button onClick={onQuickReminder}>빠른 알림</button>
      <button onClick={onShowRoutines}>오늘 루틴</button>
      <button onClick={onShowPets}>펫 변경</button>
      <button onClick={onShowImport}>펫 추가</button>
      <button onClick={onShowSettings}>설정</button>
      {quickActions.filter((action) => action.enabled).map((action) => (
        <button key={action.id} onClick={() => onOpenQuickAction(action)}>
          {action.name}
        </button>
      ))}
    </div>
  );
}

function PetWindow({
  pet,
  petState,
  resource,
  menuOpen,
  quickActions,
  sessionActive,
  onToggleMenu,
  onStartFocus,
  onStopFocus,
  onQuickReminder,
  onShowMain,
  onOpenQuickAction,
}: {
  pet?: PetSummary;
  petState: "idle" | "focus" | "break" | "success" | "wait";
  resource: ResourceSnapshot | null;
  menuOpen: boolean;
  quickActions: QuickAction[];
  sessionActive: boolean;
  onToggleMenu: () => void;
  onStartFocus: () => void;
  onStopFocus: () => void;
  onQuickReminder: () => void;
  onShowMain: (section?: "routines" | "pets" | "import" | "settings") => void;
  onOpenQuickAction: (action: QuickAction) => void;
}) {
  const level = resourceLevel(resource);
  const speedMs = level === "높음" ? 150 : level === "보통" ? 220 : 320;
  return (
    <main className="pet-window" onPointerDown={onToggleMenu}>
      <PetSprite pet={pet} state={petState} active={true} size={188} speedMs={speedMs} />
      <div className={`resource-pill level-${level}`}>
        CPU {Math.round(resource?.cpuPercent ?? 0)}% · MEM {Math.round(resource?.memoryPercent ?? 0)}%
        {resource?.batteryPercent != null ? ` · BAT ${Math.round(resource.batteryPercent)}%` : ""}
      </div>
      {menuOpen && (
        <QuickMenu
          quickActions={quickActions}
          sessionActive={sessionActive}
          onStartFocus={onStartFocus}
          onStopFocus={onStopFocus}
          onQuickReminder={onQuickReminder}
          onShowRoutines={() => onShowMain("routines")}
          onShowPets={() => onShowMain("pets")}
          onShowImport={() => onShowMain("import")}
          onShowSettings={() => onShowMain("settings")}
          onOpenQuickAction={onOpenQuickAction}
        />
      )}
    </main>
  );
}

function App() {
  const [windowLabel, setWindowLabel] = useState("main");
  const [data, setData] = useState<AppData>(fallbackData);
  const [builtinPets, setBuiltinPets] = useState<PetSummary[]>(builtinFallback);
  const [recommendedPets, setRecommendedPets] = useState<RecommendedPet[]>([]);
  const [selectedRoutineId, setSelectedRoutineId] = useState("default-focus");
  const [session, setSession] = useState<SessionTick | null>(null);
  const [petMood, setPetMood] = useState<"idle" | "focus" | "break" | "success" | "wait">("idle");
  const [resource, setResource] = useState<ResourceSnapshot | null>(null);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [importPath, setImportPath] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [quickActionName, setQuickActionName] = useState("");
  const [quickActionTarget, setQuickActionTarget] = useState("");
  const [validation, setValidation] = useState<PetValidation | null>(null);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheck | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [status, setStatus] = useState("로컬 데이터만 사용합니다.");
  const saveTimer = useRef<number | null>(null);
  const dataRef = useRef<AppData>(fallbackData);
  const selectedRoutineIdRef = useRef("default-focus");
  const routinesRef = useRef<HTMLDivElement | null>(null);
  const petsRef = useRef<HTMLDivElement | null>(null);
  const importRef = useRef<HTMLElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  const pets = useMemo(() => {
    const map = new Map<string, PetSummary>();
    for (const pet of builtinPets) map.set(pet.id, pet);
    for (const pet of data.installedPets) map.set(pet.id, pet);
    return Array.from(map.values());
  }, [builtinPets, data.installedPets]);

  const selectedPet = pets.find((pet) => pet.id === data.settings.selectedPetId) ?? pets[0];
  const selectedRoutine = data.routines.find((routine) => routine.id === selectedRoutineId) ?? data.routines[0];
  const sessionProgress = session ? 1 - session.remainingSeconds / Math.max(session.totalSeconds, 1) : 0;
  const currentPetMood = petMood === "idle" ? resourcePetState(resource) : petMood;
  const level = resourceLevel(resource);

  useEffect(() => {
    dataRef.current = data;
    selectedRoutineIdRef.current = selectedRoutineId;
  }, [data, selectedRoutineId]);

  useEffect(() => {
    if (isTauriRuntime()) {
      const label = getCurrentWindow().label;
      document.documentElement.dataset.window = label;
      setWindowLabel(label);
    } else {
      document.documentElement.dataset.window = "main";
      setWindowLabel("main");
    }
    Promise.all([
      call<AppData>("load_app_data"),
      call<PetSummary[]>("list_builtin_pets"),
      call<RecommendedPet[]>("recommended_pets"),
    ])
      .then(([loadedData, loadedPets, loadedRecommended]) => {
        setData(loadedData);
        setBuiltinPets(loadedPets);
        setRecommendedPets(loadedRecommended);
        setSelectedRoutineId(loadedData.routines[0]?.id ?? "default-focus");
      })
      .catch((error) => setStatus(String(error)));
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const unlisten = [
      listen<SessionTick>("session-tick", (event) => {
        setSession(event.payload);
        setPetMood(event.payload.phase === "focus" ? "focus" : "break");
      }),
      listen<{ subject: string; phase: string }>("session-phase-complete", async (event) => {
        const phaseLabel = event.payload.phase === "focus" ? "집중" : "휴식";
        setPetMood("success");
        await notify("Codex Pet", `${event.payload.subject} ${phaseLabel} 시간이 끝났습니다.`);
      }),
      listen<string>("session-complete", async (event) => {
        setSession(null);
        setPetMood("idle");
        await notify("루틴 완료", `${event.payload} 루틴이 끝났습니다.`);
      }),
      listen("session-cancelled", () => {
        setSession(null);
        setPetMood("idle");
      }),
      listen<ResourceSnapshot>("resource-snapshot", (event) => setResource(event.payload)),
      listen<RoutineDue>("routine-due", async (event) => {
        const routine = event.payload;
        setPetMood("wait");
        setStatus(`${routine.subject} 반복 알림이 도착했습니다.`);
        await notify("학습 루틴 알림", routine.message || `${routine.subject} 집중할 시간입니다.`);
      }),
      listen<"routines" | "pets" | "import" | "settings">("show-main-section", (event) => {
        if (windowLabel === "main") scrollToSection(event.payload);
      }),
      listen("tray-start-focus", () => startFocus()),
    ];
    return () => {
      for (const item of unlisten) item.then((dispose) => dispose());
    };
  }, [windowLabel]);

  useEffect(() => {
    if (!isTauriRuntime() || windowLabel !== "main") return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      call<void>("save_app_data", { data }).catch((error) => setStatus(String(error)));
    }, 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [data, windowLabel]);

  useEffect(() => {
    call<void>("show_pet_window", { show: true }).catch(() => undefined);
  }, []);

  useEffect(() => {
    call<void>("set_resource_monitor_settings", {
      enabled: data.settings.resourceMonitorEnabled,
      batteryEnabled: data.settings.batteryMonitorEnabled,
    }).catch(() => undefined);
  }, [data.settings.resourceMonitorEnabled, data.settings.batteryMonitorEnabled]);

  if (windowLabel === "pet") {
    return (
      <PetWindow
        pet={selectedPet}
        petState={currentPetMood}
        resource={resource}
        menuOpen={quickMenuOpen}
        quickActions={data.settings.quickActions}
        sessionActive={Boolean(session)}
        onToggleMenu={() => showMainSection("settings")}
        onStartFocus={startFocus}
        onStopFocus={stopFocus}
        onQuickReminder={quickReminder}
        onShowMain={showMainSection}
        onOpenQuickAction={openQuickAction}
      />
    );
  }

  async function notify(title: string, body: string) {
    if (!isTauriRuntime()) return;
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      permissionGranted = (await requestPermission()) === "granted";
    }
    if (permissionGranted) sendNotification({ title, body });
  }

  function patchSettings(patch: Partial<AppSettings>) {
    setData((value) => ({ ...value, settings: { ...value.settings, ...patch } }));
  }

  function scrollToSection(section: "routines" | "pets" | "import" | "settings") {
    const target =
      section === "routines" ? routinesRef.current : section === "pets" ? petsRef.current : section === "import" ? importRef.current : settingsRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    setQuickMenuOpen(false);
  }

  function showMainSection(section: "routines" | "pets" | "import" | "settings" = "routines") {
    if (isTauriRuntime() && windowLabel === "pet") {
      call<void>("show_main_section", { section }).catch((error) => setStatus(String(error)));
      setQuickMenuOpen(false);
      return;
    }
    scrollToSection(section);
  }

  function patchRoutine(id: string, patch: Partial<Routine>) {
    setData((value) => ({
      ...value,
      routines: value.routines.map((routine) => (routine.id === id ? { ...routine, ...patch } : routine)),
    }));
  }

  function addRoutine() {
    const id = `routine-${Date.now()}`;
    setData((value) => ({
      ...value,
      routines: [
        ...value.routines,
        {
          id,
          subject: "새 학습",
          focusMinutes: 25,
          breakMinutes: 5,
          startTime: "09:00",
          repeatDays: [1, 2, 3, 4, 5],
          enabled: true,
          message: "집중할 시간입니다.",
        },
      ],
    }));
    setSelectedRoutineId(id);
  }

  function removeRoutine(id: string) {
    setData((value) => {
      const next = value.routines.filter((routine) => routine.id !== id);
      setSelectedRoutineId(next[0]?.id ?? "");
      return { ...value, routines: next };
    });
  }

  async function startFocus() {
    const latest = dataRef.current;
    const routine = latest.routines.find((item) => item.id === selectedRoutineIdRef.current) ?? latest.routines[0];
    if (!routine) return;
    setStatus(`${routine.subject} 집중 타이머를 시작했습니다.`);
    await notify("집중 시작", routine.message || `${routine.subject} 집중 시간입니다.`);
    await call<void>("start_focus_session", {
      subject: routine.subject,
      focusMinutes: routine.focusMinutes,
      breakMinutes: routine.breakMinutes,
    });
  }

  async function stopFocus() {
    await call<void>("stop_focus_session");
    setSession(null);
    setPetMood("idle");
    setStatus("타이머를 정지했습니다.");
  }

  async function quickReminder() {
    await notify("빠른 알림", `${selectedPet?.displayName ?? "펫"}이 지금 확인할 일을 알려줍니다.`);
    setStatus("빠른 알림을 보냈습니다.");
    setPetMood("success");
    setQuickMenuOpen(false);
  }

  async function openQuickAction(action: QuickAction) {
    const target = action.target.trim();
    if (!target) return;
    if (!isTauriRuntime()) {
      setStatus("브라우저 미리보기에서는 바로가기를 열 수 없습니다.");
      return;
    }
    if (isUrlTarget(target)) {
      await openUrl(target);
    } else {
      await openPath(target);
    }
    setStatus(`${action.name} 바로가기를 열었습니다.`);
    setQuickMenuOpen(false);
  }

  function addQuickAction() {
    const name = quickActionName.trim();
    const target = quickActionTarget.trim();
    if (!name || !target) return;
    const action: QuickAction = {
      id: `quick-${Date.now()}`,
      name,
      target,
      enabled: true,
    };
    patchSettings({ quickActions: [...data.settings.quickActions, action] });
    setQuickActionName("");
    setQuickActionTarget("");
    setStatus(`${name} 바로가기를 추가했습니다.`);
  }

  function removeQuickAction(id: string) {
    patchSettings({ quickActions: data.settings.quickActions.filter((action) => action.id !== id) });
  }

  function toggleQuickAction(id: string) {
    patchSettings({
      quickActions: data.settings.quickActions.map((action) =>
        action.id === id ? { ...action, enabled: !action.enabled } : action,
      ),
    });
  }

  async function chooseFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setImportPath(selected);
  }

  async function validateFolder() {
    const result = await call<PetValidation>("validate_pet_folder", { path: importPath });
    setValidation(result);
    setStatus(result.ok ? "설치 가능한 Codex 펫입니다." : "펫 검증에 실패했습니다.");
  }

  async function installFolder() {
    const pet = await call<PetSummary>("install_pet_from_folder", { path: importPath });
    setData((value) => ({ ...value, installedPets: upsertPet(value.installedPets, pet) }));
    setValidation(null);
    setStatus(`${pet.displayName} 펫을 추가했습니다.`);
    setPetMood("success");
  }

  async function validateUrl(url = importUrl) {
    const result = await call<PetValidation>("validate_pet_url", { url });
    setValidation(result);
    setStatus(result.ok ? "웹에서 받은 펫을 설치할 수 있습니다." : "웹 펫 검증에 실패했습니다.");
  }

  async function installUrl(url = importUrl) {
    const pet = await call<PetSummary>("install_pet_from_url", { url });
    setData((value) => ({ ...value, installedPets: upsertPet(value.installedPets, pet) }));
    setValidation(null);
    setStatus(`${pet.displayName} 펫을 추가했습니다.`);
    setPetMood("success");
  }

  async function exportBackup() {
    if (!isTauriRuntime()) {
      setStatus("브라우저 미리보기에서는 백업을 만들 수 없습니다.");
      return;
    }
    const selected = await save({
      defaultPath: `codex-pet-backup-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: "Codex Pet Backup", extensions: ["zip"] }],
    });
    if (!selected) return;
    await call<void>("export_app_backup", { path: selected });
    setStatus("설정, 루틴, 설치한 펫 백업을 저장했습니다.");
  }

  async function exportDiagnostics() {
    if (!isTauriRuntime()) {
      setStatus("브라우저 미리보기에서는 진단 파일을 만들 수 없습니다.");
      return;
    }
    const selected = await save({
      defaultPath: `codex-pet-diagnostics-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: "Codex Pet Diagnostics", extensions: ["zip"] }],
    });
    if (!selected) return;
    await call<void>("export_diagnostics", { path: selected });
    setStatus("지원용 진단 ZIP을 저장했습니다. 바로가기 대상 값은 제외됩니다.");
  }

  async function importBackup() {
    if (!isTauriRuntime()) {
      setStatus("브라우저 미리보기에서는 백업을 가져올 수 없습니다.");
      return;
    }
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "Codex Pet Backup", extensions: ["zip"] }],
    });
    if (typeof selected !== "string") return;
    const restored = await call<AppData>("import_app_backup", { path: selected });
    setData(restored);
    setSelectedRoutineId(restored.routines[0]?.id ?? "");
    setValidation(null);
    setStatus("백업을 복구했습니다. 루틴, 설정, 설치한 펫을 다시 불러왔습니다.");
    setPetMood("success");
  }

  async function openDataFolder() {
    const location = await call<string>("app_data_location");
    if (!isTauriRuntime()) {
      setStatus(`데이터 폴더: ${location}`);
      return;
    }
    await openPath(location);
    setStatus("앱 데이터 폴더를 열었습니다.");
  }

  async function checkUpdates() {
    setCheckingUpdate(true);
    try {
      const result = await call<UpdateCheck>("check_for_updates");
      setUpdateCheck(result);
      setStatus(result.message);
    } catch (error) {
      setStatus(`업데이트 확인 실패: ${String(error)}`);
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function openReleasePage() {
    const url = updateCheck?.releaseUrl;
    if (!url) return;
    if (!isTauriRuntime()) {
      setStatus(`릴리스 페이지: ${url}`);
      return;
    }
    await openUrl(url);
    setStatus("릴리스 페이지를 열었습니다.");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Codex</p>
          <h1>Pet Settings</h1>
        </div>
        <div className="pet-stage" ref={petsRef} onClick={() => setQuickMenuOpen((value) => !value)}>
          <PetSprite
            pet={selectedPet}
            state={currentPetMood}
            active={data.settings.animationMode === "low-fps" || currentPetMood !== "idle"}
            size={154}
            speedMs={level === "높음" ? 150 : level === "보통" ? 220 : 320}
          />
          <div>
            <strong>{selectedPet?.displayName}</strong>
            <span>{selectedPet?.description}</span>
          </div>
          <div className={`resource-inline level-${level}`}>
            <span>CPU {Math.round(resource?.cpuPercent ?? 0)}%</span>
            <span>MEM {Math.round(resource?.memoryPercent ?? 0)}%</span>
            <span>{resource?.batteryPercent != null ? `BAT ${Math.round(resource.batteryPercent)}%` : "BAT -"}</span>
          </div>
          {quickMenuOpen && (
            <QuickMenu
              quickActions={data.settings.quickActions}
              sessionActive={Boolean(session)}
              onStartFocus={startFocus}
              onStopFocus={stopFocus}
              onQuickReminder={quickReminder}
              onShowRoutines={() => scrollToSection("routines")}
              onShowPets={() => scrollToSection("pets")}
              onShowImport={() => scrollToSection("import")}
              onShowSettings={() => scrollToSection("settings")}
              onOpenQuickAction={openQuickAction}
            />
          )}
        </div>
        <nav className="pet-list">
          {pets.map((pet) => (
            <button
              key={pet.id}
              className={pet.id === data.settings.selectedPetId ? "selected" : ""}
              onClick={() => patchSettings({ selectedPetId: pet.id })}
            >
              <span>{pet.displayName}</span>
              <small>{pet.source === "builtin" ? "기본" : "추가됨"}</small>
            </button>
          ))}
        </nav>
        <div className="toggles" ref={settingsRef}>
          <p className="settings-note">캐릭터는 항상 단독으로 떠 있고, 클릭하면 이 설정 팝업이 열립니다.</p>
          <label>
            <input
              type="checkbox"
              checked={data.settings.animationMode === "low-fps"}
              onChange={(event) => patchSettings({ animationMode: event.target.checked ? "low-fps" : "event" })}
            />
            저FPS 상시 애니메이션
          </label>
          <label>
            <input
              type="checkbox"
              checked={data.settings.resourceMonitorEnabled}
              onChange={(event) => patchSettings({ resourceMonitorEnabled: event.target.checked })}
            />
            리소스 반응
          </label>
          <label>
            <input
              type="checkbox"
              checked={data.settings.batteryMonitorEnabled}
              onChange={(event) => patchSettings({ batteryMonitorEnabled: event.target.checked })}
            />
            배터리 반응
          </label>
          <div className="quick-action-editor">
            <strong>바로가기</strong>
            <input value={quickActionName} onChange={(event) => setQuickActionName(event.target.value)} placeholder="이름" />
            <input value={quickActionTarget} onChange={(event) => setQuickActionTarget(event.target.value)} placeholder="https:// 또는 파일 경로" />
            <button onClick={addQuickAction} disabled={!quickActionName.trim() || !quickActionTarget.trim()}>추가</button>
            {data.settings.quickActions.map((action) => (
              <div className="quick-action-row" key={action.id}>
                <button className={action.enabled ? "selected" : ""} onClick={() => toggleQuickAction(action.id)}>
                  {action.name}
                </button>
                <button className="ghost" onClick={() => removeQuickAction(action.id)}>삭제</button>
              </div>
            ))}
          </div>
          <div className="quick-action-editor">
            <strong>데이터 관리</strong>
            <button onClick={exportBackup}>백업 내보내기</button>
            <button onClick={importBackup}>백업 가져오기</button>
            <button onClick={exportDiagnostics}>진단 내보내기</button>
            <button onClick={openDataFolder}>데이터 폴더 열기</button>
          </div>
          <div className="quick-action-editor">
            <strong>업데이트</strong>
            <button onClick={checkUpdates} disabled={checkingUpdate}>
              {checkingUpdate ? "확인 중" : "업데이트 확인"}
            </button>
            <button onClick={openReleasePage} disabled={!updateCheck?.releaseUrl}>릴리스 열기</button>
            {updateCheck && (
              <small>
                현재 {updateCheck.currentVersion}
                {updateCheck.latestVersion ? ` · 최신 ${updateCheck.latestVersion}` : ""}
              </small>
            )}
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div ref={routinesRef}>
            <p className="eyebrow">로컬 전용 루틴</p>
            <h2>오늘 루틴</h2>
          </div>
          <div className="actions">
            <button onClick={addRoutine}>+ 루틴</button>
            <button className="primary" onClick={startFocus}>집중 시작</button>
            <button onClick={stopFocus}>정지</button>
          </div>
        </header>

        <section className="timer-panel">
          <div>
            <p>{session ? `${session.subject} · ${session.phase === "focus" ? "집중" : "휴식"}` : "대기 중"}</p>
            <strong>{session ? formatTime(session.remainingSeconds) : "00:00"}</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${Math.round(sessionProgress * 100)}%` }} />
          </div>
        </section>

        <section className="grid">
          <div className="panel routines-panel">
            <div className="panel-heading">
              <h3>학습 루틴</h3>
              <span>{data.routines.length}개</span>
            </div>
            <div className="routine-list">
              {data.routines.map((routine) => (
                <button
                  key={routine.id}
                  className={routine.id === selectedRoutineId ? "routine-card selected" : "routine-card"}
                  onClick={() => setSelectedRoutineId(routine.id)}
                >
                  <span>{routine.subject}</span>
                  <small>
                    {routine.focusMinutes}분 집중 / {routine.breakMinutes}분 휴식
                  </small>
                </button>
              ))}
            </div>
          </div>

          {selectedRoutine && (
            <div className="panel editor-panel">
              <div className="panel-heading">
                <h3>루틴 편집</h3>
                <button className="ghost" onClick={() => removeRoutine(selectedRoutine.id)}>삭제</button>
              </div>
              <label>
                과목명
                <input
                  value={selectedRoutine.subject}
                  onChange={(event) => patchRoutine(selectedRoutine.id, { subject: event.target.value })}
                />
              </label>
              <div className="two-col">
                <label>
                  집중 시간
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={selectedRoutine.focusMinutes}
                    onChange={(event) => patchRoutine(selectedRoutine.id, { focusMinutes: Number(event.target.value) })}
                  />
                </label>
                <label>
                  쉬는 시간
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={selectedRoutine.breakMinutes}
                    onChange={(event) => patchRoutine(selectedRoutine.id, { breakMinutes: Number(event.target.value) })}
                  />
                </label>
              </div>
              <label>
                알림 시각
                <input
                  type="time"
                  value={selectedRoutine.startTime}
                  onChange={(event) => patchRoutine(selectedRoutine.id, { startTime: event.target.value })}
                />
              </label>
              <label>
                알림 메시지
                <input
                  value={selectedRoutine.message}
                  onChange={(event) => patchRoutine(selectedRoutine.id, { message: event.target.value })}
                />
              </label>
              <div className="weekday-row">
                {weekdayLabels.map((label, index) => {
                  const checked = selectedRoutine.repeatDays.includes(index);
                  return (
                    <button
                      key={label}
                      className={checked ? "selected" : ""}
                      onClick={() => {
                        const repeatDays = checked
                          ? selectedRoutine.repeatDays.filter((day) => day !== index)
                          : [...selectedRoutine.repeatDays, index].sort();
                        patchRoutine(selectedRoutine.id, { repeatDays });
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <label className="inline">
                <input
                  type="checkbox"
                  checked={selectedRoutine.enabled}
                  onChange={(event) => patchRoutine(selectedRoutine.id, { enabled: event.target.checked })}
                />
                반복 알림 활성화
              </label>
            </div>
          )}
        </section>

        <section className="panel import-panel" ref={importRef}>
          <div className="panel-heading">
            <h3>Codex 펫 추가</h3>
            <span>pet.json + spritesheet.webp</span>
          </div>
          <div className="import-grid">
            <div className="import-box">
              <strong>추천 펫</strong>
              {recommendedPets.map((pet) => (
                <div className="recommended" key={pet.id}>
                  <div>
                    <span>{pet.displayName}</span>
                    <small>{pet.description}</small>
                  </div>
                  <button onClick={() => installUrl(pet.url)}>추가</button>
                </div>
              ))}
            </div>
            <div className="import-box">
              <strong>로컬 폴더</strong>
              <div className="input-row">
                <input value={importPath} onChange={(event) => setImportPath(event.target.value)} placeholder="/path/to/pet" />
                <button onClick={chooseFolder}>찾기</button>
              </div>
              <div className="button-row">
                <button onClick={validateFolder} disabled={!importPath}>검증</button>
                <button className="primary" onClick={installFolder} disabled={!validation?.ok || !importPath}>설치</button>
              </div>
            </div>
            <div className="import-box">
              <strong>웹/GitHub/ZIP</strong>
              <input
                value={importUrl}
                onChange={(event) => setImportUrl(event.target.value)}
                placeholder="https://github.com/.../tree/main/pet"
              />
              <div className="button-row">
                <button onClick={() => validateUrl()} disabled={!importUrl}>검증</button>
                <button className="primary" onClick={() => installUrl()} disabled={!validation?.ok || !importUrl}>설치</button>
              </div>
            </div>
          </div>
          {validation && (
            <div className={validation.ok ? "validation ok" : "validation error"}>
              <strong>{validation.ok ? "검증 통과" : "검증 실패"}</strong>
              <span>
                {validation.displayName ?? validation.id ?? "알 수 없는 펫"} · {validation.width ?? "-"}x{validation.height ?? "-"} ·{" "}
                {validation.format ?? "format unknown"}
              </span>
              {[...validation.errors, ...validation.warnings].map((message) => (
                <small key={message}>{message}</small>
              ))}
            </div>
          )}
        </section>

        <footer className="statusbar">
          <span>{status}</span>
          <span>Codex 펫 호환 · 로컬 저장 · 이벤트 중심 렌더링</span>
        </footer>
      </section>
    </main>
  );
}

function upsertPet(pets: PetSummary[], pet: PetSummary) {
  return [...pets.filter((item) => item.id !== pet.id), pet];
}

export default App;
