# Codex Characters

하이러닝(HighLearning) 캐릭터를 Codex 호환 펫 자산으로 정리한 저장소입니다.

이 저장소는 캐릭터 자산만 보관합니다. 단독 데스크탑 앱과 실행 패키지는 별도 저장소에서 배포합니다.

- 앱 저장소: https://github.com/techkwon/codex-pet
- 앱 다운로드: https://github.com/techkwon/codex-pet/releases/latest

## 포함 캐릭터

| 캐릭터 | 폴더 | 설명 |
| --- | --- | --- |
| Calico | `highlearning/calico/` | 첨부 이미지에서 분리한 삼색 고양이형 마스코트 |
| Max | `highlearning/max/` | 첨부 이미지에서 분리한 골든 강아지형 마스코트 |
| Airo | `highlearning/airo/` | 파란 마법 모자를 쓴 고양이형 마스코트 |
| Haro | `highlearning/haro/` | 초록 귀와 노란 볼을 가진 작은 동반자 마스코트 |

각 캐릭터 폴더는 Codex 펫 패키지 단위입니다.

```text
highlearning/<character>/
  pet.json
  spritesheet.webp
  qa/
    contact-sheet.png
    review.json
```

- `pet.json`: 펫 ID, 표시 이름, 설명, 스프라이트시트 경로를 담은 manifest
- `spritesheet.webp`: Codex 펫 런타임이 사용하는 애니메이션 atlas
- `qa/contact-sheet.png`: 전체 프레임을 한눈에 확인하는 검수 이미지
- `qa/review.json`: 자동 프레임 검사 결과

## Codex에 직접 설치하기

Codex는 기본적으로 `~/.codex/pets/<pet-id>/` 아래의 `pet.json`과 `spritesheet.webp`를 읽습니다.

예시:

```bash
git clone https://github.com/techkwon/codex-characters.git
cd codex-characters

mkdir -p ~/.codex/pets/airo
cp highlearning/airo/pet.json highlearning/airo/spritesheet.webp ~/.codex/pets/airo/
```

네 캐릭터를 모두 설치하려면:

```bash
for pet in calico max airo haro; do
  mkdir -p ~/.codex/pets/$pet
  cp highlearning/$pet/pet.json highlearning/$pet/spritesheet.webp ~/.codex/pets/$pet/
done
```

설치 후 Codex 앱을 새로고침하거나 재시작하면 펫 목록에서 사용할 수 있습니다.

## Codex Pet 앱에서 사용하기

Codex Pet 앱에서는 `펫 추가`에서 이 저장소의 GitHub 폴더 URL을 입력하면 됩니다.

예시:

- `https://github.com/techkwon/codex-characters/tree/main/highlearning/calico`
- `https://github.com/techkwon/codex-characters/tree/main/highlearning/max`
- `https://github.com/techkwon/codex-characters/tree/main/highlearning/airo`
- `https://github.com/techkwon/codex-characters/tree/main/highlearning/haro`

앱은 설치 전 `pet.json`과 `spritesheet.webp` 존재 여부를 검증합니다.
