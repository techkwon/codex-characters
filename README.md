# Codex Characters

하이러닝(HighLearning) 캐릭터를 Codex 앱에서 사용할 수 있는 애니메이션 펫 형태로 정리한 저장소입니다.

현재 포함된 캐릭터는 `아이로(Airo)`와 `하로(Haro)`입니다. 두 캐릭터 모두 `hatch-pet` 워크플로우로 생성했고, Codex 펫 런타임에서 바로 읽을 수 있도록 `pet.json`과 `spritesheet.webp`를 함께 제공합니다.

## 포함 캐릭터

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

## HighLearning Pet Reminder 앱

`apps/desktop`에는 Codex 없이 단독 실행되는 학습 알림 앱 MVP가 들어 있습니다.

핵심 방향은 세 가지입니다.

1. 쉬운 설치: 첫 배포는 portable 빌드를 우선합니다.
2. Codex 펫 호환: `pet.json`과 `spritesheet.webp`를 그대로 읽습니다.
3. 가벼움: 기본은 트레이/메뉴바 상주와 이벤트 중심 펫 반응입니다.

현재 배포 목표:

- Windows: `MSI`, `NSIS`, portable ZIP
- macOS: `DMG`, portable app
- Mac App Store 등록은 제외

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
cd src-tauri
cargo check
```

패키징:

```bash
cd apps/desktop
npm run build
```

앱 기능:

- 오늘 루틴 보기
- 집중 시작/정지
- 과목명, 집중 시간, 쉬는 시간, 반복 요일, 알림 메시지 편집
- 기본 펫 `Haro`, `Airo` 선택
- 펫 창 열기/닫기
- 로컬 Codex 펫 폴더 가져오기
- GitHub 폴더, `pet.json` URL, ZIP URL에서 펫 가져오기
- 설치 전 `pet.json`과 `spritesheet.webp` 검증
- 설정/루틴/추가 펫 목록 로컬 저장

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
