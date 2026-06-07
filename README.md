# Codex Characters

하이러닝(HighLearning) 캐릭터를 Codex 앱에서 사용할 수 있는 애니메이션 펫 형태로 정리한 저장소입니다.

현재 포함된 캐릭터는 `칼리코(Calico)`, `맥스(Max)`, `아이로(Airo)`, `하로(Haro)`입니다. 모든 캐릭터는 Codex 펫 런타임에서 바로 읽을 수 있도록 `pet.json`과 `spritesheet.webp`를 함께 제공합니다.

## 포함 캐릭터

### 칼리코(Calico)

첨부 이미지에서 분리한 삼색 고양이형 마스코트입니다.

- 위치: `apps/desktop/public/pets/calico`
- 런타임 파일: `pet.json`, `spritesheet.webp`
- 특징: 삼색 털, 큰 눈, 흰 가슴, 작은 목걸이 태그
- 앱 기본 펫: 예

### 맥스(Max)

첨부 이미지에서 분리한 골든 강아지형 마스코트입니다.

- 위치: `apps/desktop/public/pets/max`
- 런타임 파일: `pet.json`, `spritesheet.webp`
- 특징: 골든 털, 처진 귀, 둥근 코, 뼈 모양 목걸이 태그
- 앱 기본 펫: 예

### 아이로(Airo)

파란 마법 모자를 쓴 고양이형 마스코트입니다.

- 위치: `highlearning/airo`
- 런타임 파일: `pet.json`, `spritesheet.webp`
- QA 파일: `qa/contact-sheet.png`, `qa/review.json`
- 특징: 파란 모자, 보라색 뒷머리, 작은 망토, 별 지팡이

### 하로(Haro)

초록 귀를 가진 작은 동반자 마스코트입니다.

- 위치: `highlearning/haro`
- 런타임 파일: `pet.json`, `spritesheet.webp`
- QA 파일: `qa/contact-sheet.png`, `qa/review.json`
- 특징: 흰 몸, 연두색 귀와 손, 노란 볼, 이마의 하늘색 다이아몬드 표식

## 파일 구조

```text
codex-characters/
  README.md
  apps/
    desktop/
      src/
      src-tauri/
      public/pets/
        calico/
        max/
  highlearning/
    README.md
    airo/
      pet.json
      spritesheet.webp
      qa/
        contact-sheet.png
        review.json
    haro/
      pet.json
      spritesheet.webp
      qa/
        contact-sheet.png
        review.json
```

각 캐릭터 폴더는 Codex 펫 패키지 단위입니다.

- `pet.json`: 펫의 ID, 표시 이름, 설명, 스프라이트시트 경로를 담은 manifest
- `spritesheet.webp`: 실제 애니메이션 atlas
- `qa/contact-sheet.png`: 행별 애니메이션 프레임을 한눈에 확인하는 검수 이미지
- `qa/review.json`: 자동 프레임 검사 결과

## Codex Pet 앱

`apps/desktop`에는 Codex 없이 단독 실행되는 데스크톱 펫 앱이 들어 있습니다.

핵심 방향은 세 가지입니다.

1. 쉬운 설치: 첫 배포는 portable 빌드를 우선합니다.
2. Codex 펫 호환: `pet.json`과 `spritesheet.webp`를 그대로 읽습니다.
3. 가벼움: 기본은 투명한 단독 펫 창, 트레이/메뉴바 상주, 저주기 리소스 감지, 이벤트 중심 펫 반응입니다.

현재 배포 목표:

- Windows: `MSI`, `NSIS`, portable ZIP
- macOS: `DMG`, portable app
- Mac App Store 등록은 제외

상업 수준 v0.2에서 추가된 제품 포인트:

- 단독 펫 런처: 앱 실행 시 큰 화면이 뜨지 않고 투명한 펫만 떠 있습니다.
- 설정 팝업: 펫을 클릭하면 설정/루틴/펫 관리 화면이 작은 팝업으로 열립니다.
- 리소스 반응: Rust 백엔드가 CPU, 메모리, 배터리를 낮은 주기로 확인하고 펫 상태와 속도 배지로 보여줍니다.
- 사용자 바로가기: URL 또는 파일 경로를 등록해 설정 팝업에서 관리하고 펫 액션으로 확장할 수 있습니다.
- 로컬 전용 저장: 루틴, 설정, 설치한 펫, 바로가기는 앱 데이터 디렉터리에만 저장합니다.
- Codex 펫 확장: 로컬 폴더, GitHub 폴더, `pet.json` URL, ZIP URL에서 외부 펫을 추가할 수 있습니다.

개발 실행:

```bash
cd apps/desktop
npm install
npm run dev
```

검증:

```bash
cd apps/desktop
npm run typecheck
npm run build:ui
cd src-tauri
cargo check
```

릴리즈 체크리스트와 리소스 측정 기준은 `apps/desktop/RELEASE_CHECKLIST.md`에 정리되어 있습니다.

패키징:

```bash
cd apps/desktop
npm run build
```

macOS portable ZIP 만들기:

```bash
cd apps/desktop
npm run build
npm run package:portable:mac
```

Windows portable ZIP 만들기:

```powershell
cd apps/desktop
npm run build
npm run package:portable:win
```

macOS 리소스 측정:

```bash
cd apps/desktop
npm run measure:mac
```

앱 기능:

- 오늘 루틴 보기
- 집중 시작/정지
- 과목명, 집중 시간, 쉬는 시간, 알림 시각, 반복 요일, 알림 메시지 편집
- 알림 시각과 반복 요일에 맞춘 자동 루틴 알림
- 기본 펫 `Calico`, `Max` 제공
- 기존 펫 `Haro`, `Airo` 선택 가능
- 앱 실행 시 투명한 단독 펫 표시
- 펫 클릭 시 설정/루틴/펫 관리 팝업 열기
- CPU/메모리/배터리 상태에 따른 펫 반응
- URL/파일 사용자 바로가기 추가, 켜기/끄기, 삭제
- 로컬 Codex 펫 폴더 가져오기
- GitHub 폴더, `pet.json` URL, ZIP URL에서 펫 가져오기
- 설치 전 `pet.json`과 `spritesheet.webp` 검증
- 설정/루틴/추가 펫 목록 로컬 저장

빌드가 끝나면 macOS에서는 다음 산출물이 생성됩니다.

```text
apps/desktop/src-tauri/target/release/bundle/macos/Codex Pet.app
apps/desktop/src-tauri/target/release/bundle/dmg/Codex Pet_0.1.0_aarch64.dmg
apps/desktop/src-tauri/target/release/bundle/portable/Codex-Pet_macos_aarch64_portable.zip
apps/desktop/src-tauri/target/release/bundle/msi/*.msi
apps/desktop/src-tauri/target/release/bundle/nsis/*.exe
apps/desktop/src-tauri/target/release/bundle/portable/Codex-Pet_windows_x64_portable.zip
```

앱 아이콘은 기본 캐릭터 방향에 맞춘 `HL PET` 브랜드 마크를 사용합니다. 원본 아이콘 세트는 `apps/desktop/src-tauri/icons/`에 있으며 Tauri 번들에 포함됩니다.

GitHub Actions의 `Desktop Build` 워크플로는 `main` push, pull request, 수동 실행에서 macOS arm64와 Windows x64 빌드를 검증하고 설치 파일/portable ZIP을 artifact로 업로드합니다.

### 데스크톱 앱 사용 방법

1. 앱을 실행하면 큰 앱 화면 대신 투명한 작은 펫만 단독으로 뜹니다. 기본 펫은 `Calico`입니다.
2. 펫을 클릭하면 설정 팝업이 열립니다. 여기서 `Max`, `Haro`, `Airo` 또는 설치한 외부 펫으로 바꿀 수 있습니다.
3. 설정 팝업에서 집중 시작/정지, 빠른 알림, 오늘 루틴, 펫 변경, 펫 추가, 설정을 관리합니다.
4. 루틴 편집에서 알림 시각과 반복 요일을 지정하면 앱 실행 중 해당 시각에 OS 알림을 보냅니다.
5. `리소스 반응`을 켜면 CPU와 메모리 사용률에 따라 펫 상태와 애니메이션 속도가 바뀝니다.
6. `배터리 반응`을 켜면 배터리가 있는 기기에서 배터리 잔량도 함께 표시합니다. 배터리가 없는 데스크톱에서는 `BAT -`로 표시됩니다.
7. `바로가기`에 이름과 대상을 입력하면 펫 클릭 메뉴에 추가됩니다. 대상은 `https://...` 같은 URL 또는 로컬 파일 경로를 사용할 수 있습니다.
8. 외부 Codex 펫은 `Codex 펫 추가` 영역에서 로컬 폴더, GitHub 폴더, `pet.json` URL, ZIP URL로 가져옵니다. 검증을 통과해야 설치됩니다.

## 사용 방법

### 1. 저장소 받기

```bash
git clone https://github.com/techkwon/codex-characters.git
cd codex-characters
```

### 2. Codex 펫 폴더에 복사하기

Codex는 기본적으로 `~/.codex/pets/<pet-id>/` 아래의 `pet.json`과 `spritesheet.webp`를 읽습니다.

아이로만 설치:

```bash
mkdir -p ~/.codex/pets/airo
cp highlearning/airo/pet.json ~/.codex/pets/airo/
cp highlearning/airo/spritesheet.webp ~/.codex/pets/airo/
```

하로만 설치:

```bash
mkdir -p ~/.codex/pets/haro
cp highlearning/haro/pet.json ~/.codex/pets/haro/
cp highlearning/haro/spritesheet.webp ~/.codex/pets/haro/
```

둘 다 설치:

```bash
mkdir -p ~/.codex/pets/airo ~/.codex/pets/haro
cp highlearning/airo/pet.json highlearning/airo/spritesheet.webp ~/.codex/pets/airo/
cp highlearning/haro/pet.json highlearning/haro/spritesheet.webp ~/.codex/pets/haro/
```

### 3. 설치 확인

설치 후 폴더가 아래처럼 보이면 됩니다.

```text
~/.codex/pets/
  airo/
    pet.json
    spritesheet.webp
  haro/
    pet.json
    spritesheet.webp
```

Codex 앱에서 펫 목록을 다시 불러오면 `Airo`, `Haro`를 선택할 수 있습니다. 이미 Codex가 실행 중이라면 앱을 새로고침하거나 재시작하면 반영됩니다.

## 애니메이션 구성

각 스프라이트시트는 Codex 펫 atlas 규격을 따릅니다.

- 전체 크기: `1536x1872`
- 셀 크기: `192x208`
- 열: `8`
- 행: `9`
- 형식: 투명 배경을 포함한 `RGBA` WebP

행별 상태:

| Row | 상태 | 프레임 수 | 설명 |
| --- | --- | ---: | --- |
| 0 | `idle` | 6 | 기본 대기/깜빡임 |
| 1 | `running-right` | 8 | 오른쪽 이동 |
| 2 | `running-left` | 8 | 왼쪽 이동 |
| 3 | `waving` | 4 | 인사 |
| 4 | `jumping` | 5 | 점프 |
| 5 | `failed` | 8 | 실패/속상함 |
| 6 | `waiting` | 6 | 기다림 |
| 7 | `running` | 6 | 제자리 달리기 |
| 8 | `review` | 6 | 집중/검토 |

## 검증 결과

두 캐릭터 모두 생성 후 자동 검증을 통과했습니다.

- `spritesheet.webp`: `1536x1872`, `RGBA`
- 사용 셀: 비어 있지 않음
- 미사용 셀: 투명 처리
- `qa/review.json`: errors/warnings 없음
- `qa/contact-sheet.png`: 행별 캐릭터 정체성 및 프레임 구성 확인 완료

하로는 초록색 귀와 손을 가진 캐릭터라 green chroma key와 충돌했습니다. 최종 버전은 magenta chroma key로 다시 생성해 검증을 통과한 결과물입니다.

## 업데이트할 때

캐릭터를 다시 생성하거나 새 캐릭터를 추가할 때는 다음 원칙을 지킵니다.

1. `pet.json`과 `spritesheet.webp`를 항상 같은 캐릭터 폴더에 함께 둡니다.
2. QA 확인용 `qa/contact-sheet.png`와 `qa/review.json`도 같이 업데이트합니다.
3. `spritesheet.webp`는 `1536x1872` atlas 규격을 유지합니다.
4. 캐릭터 색이 chroma key와 충돌하지 않는지 확인합니다.
5. 행별 프레임 수가 Codex 펫 규격과 맞는지 확인합니다.

## 라이선스와 사용 범위

이 저장소는 하이러닝 캐릭터 자산을 Codex 펫 형태로 보관하기 위한 공개 저장소입니다. 외부 배포, 상업적 이용, 2차 창작 범위는 원 캐릭터 권리자의 정책을 따르세요.
