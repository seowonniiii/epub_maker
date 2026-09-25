# TXT → EPUB

GitHub Pages에서 실행되는 개인용 TXT → EPUB 변환기입니다.

## 기능

- `##1화`, `##2화` 기준 자동 회차 분리
- 각 화를 독립 EPUB chapter로 생성
- EPUB 목차 자동 생성
- EPUB 3 `nav.xhtml` + 구형 리더 호환용 `toc.ncx`
- TXT 첫 줄에서 소설 제목 자동 인식
- 제목 페이지에 `소설 제목` + `1화 ~ 10화` 표시
- 각 화 시작부에 반복되는 `소설 제목` / `1화` 자동 제거
- 각 화 제목을 중앙 정렬 + 연보라색으로 스타일링
- 표지 JPG/PNG 선택 지원
- 표지 미선택 시 표지 페이지 생략
- `fonts/NanumMyeongjo-Regular.ttf`가 있으면 EPUB에 자동 임베딩
- 폰트 파일이 없어도 EPUB 생성은 계속되며 기기 기본 명조체 사용

## 저장소 구조

```text
txt-to-epub/
├── index.html
├── app.js
├── style.css
└── fonts/
    └── NanumMyeongjo-Regular.ttf
```

> `NanumMyeongjo-Regular.ttf`는 직접 준비해서 `fonts` 폴더에 올려주세요.
> 이 ZIP에는 폰트 파일 자체가 포함되어 있지 않습니다.

## GitHub Pages 켜기

1. 이 ZIP의 파일들을 GitHub 저장소 루트에 업로드합니다.
2. `fonts/NanumMyeongjo-Regular.ttf`도 업로드합니다.
3. 저장소에서 **Settings → Pages**로 이동합니다.
4. **Source: Deploy from a branch**
5. **Branch: main / (root)**
6. Save

잠시 후 아래 형식의 주소가 생깁니다.

```text
https://YOUR_GITHUB_ID.github.io/YOUR_REPOSITORY/
```

## TXT 형식

```text
소설제목_1~10화


##1화

소설제목

1화

본문...


##2화

소설제목

2화

본문...
```

각 회차 안의 반복 `소설제목`과 `N화`는 EPUB 생성 시 맨 앞부분에서 자동 제거됩니다.
