# HighLearning Characters

하이러닝 캐릭터용 Codex 펫 패키지 모음입니다.

## 캐릭터 목록

| 캐릭터 | 폴더 | 설명 |
| --- | --- | --- |
| Airo | `airo/` | 파란 마법 모자를 쓴 고양이형 마스코트 |
| Haro | `haro/` | 초록 귀와 노란 볼을 가진 작은 동반자 마스코트 |

## 각 폴더 구성

```text
<character>/
  pet.json
  spritesheet.webp
  qa/
    contact-sheet.png
    review.json
```

- `pet.json`: Codex가 읽는 펫 manifest
- `spritesheet.webp`: 최종 애니메이션 atlas
- `qa/contact-sheet.png`: 사람 눈으로 확인하기 위한 전체 프레임 시트
- `qa/review.json`: 자동 검증 결과

## Codex에 설치하기

예를 들어 `airo`를 설치하려면:

```bash
mkdir -p ~/.codex/pets/airo
cp airo/pet.json airo/spritesheet.webp ~/.codex/pets/airo/
```

`haro`를 설치하려면:

```bash
mkdir -p ~/.codex/pets/haro
cp haro/pet.json haro/spritesheet.webp ~/.codex/pets/haro/
```

설치 후 Codex 앱을 새로고침하거나 재시작하면 펫 목록에서 사용할 수 있습니다.

