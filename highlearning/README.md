# HighLearning Characters

하이러닝 캐릭터용 Codex 펫 패키지 모음입니다.

## 캐릭터 목록

| 캐릭터 | 폴더 | 설명 |
| --- | --- | --- |
| Calico | `calico/` | 삼색 고양이형 기본 캐릭터 |
| Max | `max/` | 골든 강아지형 기본 캐릭터 |
| Airo | `airo/` | 파란 마법 모자를 쓴 고양이형 캐릭터 |
| Haro | `haro/` | 초록 귀와 노란 볼을 가진 작은 동반자 캐릭터 |

## 폴더 구성

```text
<character>/
  pet.json
  spritesheet.webp
  qa/
    contact-sheet.png
    review.json
```

## Codex에 설치하기

예를 들어 `airo`를 설치하려면:

```bash
mkdir -p ~/.codex/pets/airo
cp airo/pet.json airo/spritesheet.webp ~/.codex/pets/airo/
```

전체 캐릭터 설치:

```bash
for pet in calico max airo haro; do
  mkdir -p ~/.codex/pets/$pet
  cp $pet/pet.json $pet/spritesheet.webp ~/.codex/pets/$pet/
done
```

설치 후 Codex 앱을 새로고침하거나 재시작하면 펫 목록에서 사용할 수 있습니다.
