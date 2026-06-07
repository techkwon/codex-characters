import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
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
  repeatDays: number[];
  enabled: boolean;
  message: string;
};

type AppSettings = {
  selectedPetId: string;
  petWindowEnabled: boolean;
  animationMode: "event" | "low-fps";
  autostartEnabled: boolean;
};

type AppData = {
  settings: AppSettings;
  routines: Routine[];
  installedPets: PetSummary[];
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

type SessionTick = {
  subject: string;
  phase: "focus" | "break";
  remainingSeconds: number;
  totalSeconds: number;
};

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

const fallbackData: AppData = {
  settings: {
    selectedPetId: "calico",
    petWindowEnabled: false,
    animationMode: "event",
    autostartEnabled: false,
  },
  routines: [
    {
      id: "default-focus",
      subject: "오늘의 학습",
      focusMinutes: 25,
      breakMinutes: 5,
      repeatDays: [1, 2, 3, 4, 5],
      enabled: true,
      message: "하로와 함께 집중할 시간입니다.",
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

function PetSprite({
  pet,
  state,
  active,
  size = 168,
}: {
  pet?: PetSummary;
  state: "idle" | "focus" | "break" | "success" | "wait";
  active: boolean;
  size?: number;
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
    }, 240);
    return () => window.clearInterval(timer);
  }, [active, frames]);

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

function PetWindow({ pet }: { pet?: PetSummary }) {
  return (
    <main className="pet-window">
      <PetSprite pet={pet} state="idle" active={true} size={188} />
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
  const [importPath, setImportPath] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [validation, setValidation] = useState<PetValidation | null>(null);
  const [status, setStatus] = useState("로컬 데이터만 사용합니다.");
  const saveTimer = useRef<number | null>(null);

  const pets = useMemo(() => {
    const map = new Map<string, PetSummary>();
    for (const pet of builtinPets) map.set(pet.id, pet);
    for (const pet of data.installedPets) map.set(pet.id, pet);
    return Array.from(map.values());
  }, [builtinPets, data.installedPets]);

  const selectedPet = pets.find((pet) => pet.id === data.settings.selectedPetId) ?? pets[0];
  const selectedRoutine = data.routines.find((routine) => routine.id === selectedRoutineId) ?? data.routines[0];
  const sessionProgress = session ? 1 - session.remainingSeconds / Math.max(session.totalSeconds, 1) : 0;

  useEffect(() => {
    setWindowLabel(getCurrentWindow().label);
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
        await notify("HighLearning Pet Reminder", `${event.payload.subject} ${phaseLabel} 시간이 끝났습니다.`);
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
      listen("tray-start-focus", () => startFocus()),
    ];
    return () => {
      for (const item of unlisten) item.then((dispose) => dispose());
    };
  });

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
    call<void>("show_pet_window", { show: data.settings.petWindowEnabled }).catch(() => undefined);
  }, [data.settings.petWindowEnabled]);

  if (windowLabel === "pet") {
    return <PetWindow pet={selectedPet} />;
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
    const routine = selectedRoutine ?? data.routines[0];
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">HighLearning</p>
          <h1>Pet Reminder</h1>
        </div>
        <div className="pet-stage">
          <PetSprite
            pet={selectedPet}
            state={petMood}
            active={data.settings.animationMode === "low-fps" || petMood !== "idle"}
            size={154}
          />
          <div>
            <strong>{selectedPet?.displayName}</strong>
            <span>{selectedPet?.description}</span>
          </div>
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
        <div className="toggles">
          <label>
            <input
              type="checkbox"
              checked={data.settings.petWindowEnabled}
              onChange={(event) => patchSettings({ petWindowEnabled: event.target.checked })}
            />
            펫 창 표시
          </label>
          <label>
            <input
              type="checkbox"
              checked={data.settings.animationMode === "low-fps"}
              onChange={(event) => patchSettings({ animationMode: event.target.checked ? "low-fps" : "event" })}
            />
            저FPS 상시 애니메이션
          </label>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
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

        <section className="panel import-panel">
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
