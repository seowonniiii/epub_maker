# epub_maker — 여러 TXT 병합 + 미리보기/여백 조절 버전

## 주요 기능

- TXT 파일 여러 개 동시 선택
- 모든 TXT의 `##N화`를 읽어 화수 기준 자동 정렬
- 예: `1~10화.txt + 11~20화.txt + 21~30화.txt` → 한 번에 `1~30화.epub`
- 파일 선택 순서와 무관하게 회차 번호로 정렬
- 겹치는 회차가 있으면 중복 제거
  - 같은 회차가 여러 파일에 있으면 선택 목록에서 먼저 읽힌 파일의 회차를 유지
- 1화~마지막 화 사이 빠진 회차 자동 표시
- 첫 회차 실시간 미리보기
- 좌우 본문 여백 조절
- 회차 제목 위/아래 여백 조절
- 문단 간격 조절
- 조절한 값을 EPUB CSS에 그대로 반영
- 선택 표지
- 제목 페이지
- 회차별 EPUB chapter
- EPUB 3 목차 + NCX 목차
- 각 회차 맨 앞의 반복 소설 제목/회차명 제거
- 나눔명조 자동 임베딩

## 저장소 구조

```text
epub_maker/
├── index.html
├── app.js
├── style.css
└── fonts/
    └── NanumMyeongjo-Regular.ttf
```

`NanumMyeongjo-Regular.ttf`는 직접 `fonts` 폴더에 넣으세요.

## GitHub 업데이트

기존 저장소의 아래 3개 파일을 새 버전으로 교체하면 됩니다.

- `index.html`
- `app.js`
- `style.css`

폰트는 기존 `fonts/NanumMyeongjo-Regular.ttf`를 그대로 두면 됩니다.
