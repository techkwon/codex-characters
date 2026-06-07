# HighLearning Pet Reminder Release Checklist

상업 배포 전에 매번 확인할 항목입니다.

## 1. 빌드 검증

```bash
npm run typecheck
npm run build:ui
cd src-tauri && cargo check
cd ..
npm run build
npm run package:portable:mac
```

통과 기준:

- TypeScript 오류 없음
- Rust `cargo check` 오류 없음
- macOS `.app`, `.dmg`, portable `.zip` 생성
- 앱 실행 후 첫 화면에서 `Calico`, `Max`, `Haro`, `Airo`가 선택 가능

## 2. 기능 회귀 확인

- 펫 클릭 메뉴: 집중 시작/정지, 빠른 알림, 오늘 루틴, 펫 변경, 펫 추가, 설정 동작
- 루틴: 과목명, 집중 시간, 쉬는 시간, 알림 시각, 반복 요일, 알림 메시지 저장
- 반복 알림: 앱 실행 중 오늘 요일과 알림 시각이 맞으면 OS 알림 표시
- 펫 창: 표시/숨김, 항상 위 표시, 클릭 메뉴 표시
- Codex 펫 추가: 로컬 폴더, GitHub 폴더, `pet.json` URL, ZIP URL 검증
- 바로가기: URL 열기, 파일 경로 열기, 활성/비활성, 삭제
- 리소스 반응: CPU/메모리/배터리 배지 표시, 배터리 없는 기기에서 `BAT -` 표시

## 3. 초경량 기준

macOS 기준 측정:

```bash
npm run measure:mac
```

현재 기준선:

| 상태 | 샘플 | 평균 CPU | 최대 CPU | 평균 메모리 | 최대 메모리 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 메인 창 표시, 펫 창 숨김 | 20초 | 0.88% | 1.30% | 94.98MiB | 95.05MiB |

배포 전 목표:

- 메인 창 표시 상태 평균 CPU 2% 이하
- 펫 창 숨김 상태에서 불필요한 프론트 애니메이션 루프 없음
- 메모리 사용량이 20초 측정 중 계속 증가하지 않음
- portable ZIP과 DMG 용량이 각각 25MiB 이하

## 4. 배포 산출물

macOS:

```text
src-tauri/target/release/bundle/macos/HighLearning Pet Reminder.app
src-tauri/target/release/bundle/dmg/HighLearning Pet Reminder_0.1.0_aarch64.dmg
src-tauri/target/release/bundle/portable/HighLearning-Pet-Reminder_macos_aarch64_portable.zip
```

Windows는 별도 Windows 환경에서 `npm run build` 후 `msi`, `nsis`, portable ZIP을 확인합니다.

## 5. 배포 제외 사항

- Mac App Store 등록 제외
- 계정/서버/클라우드 동기화 제외
- 네트워크/디스크/GPU 모니터링 제외
- 글로벌 단축키 제외
