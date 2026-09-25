(() => {
  "use strict";

  const FONT_URL = "./fonts/NanumMyeongjo-Regular.ttf";

  const txtInput = document.getElementById("txtFile");
  const titleInput = document.getElementById("bookTitle");
  const authorInput = document.getElementById("author");
  const coverInput = document.getElementById("coverFile");
  const coverPreview = document.getElementById("coverPreview");
  const txtPreview = document.getElementById("txtPreview");
  const txtFileName = document.getElementById("txtFileName");
  const coverFileName = document.getElementById("coverFileName");
  const fontState = document.getElementById("fontState");
  const makeBtn = document.getElementById("makeBtn");
  const status = document.getElementById("status");

  let loadedTxt = "";
  let parsedChapters = [];
  let lastCoverObjectURL = null;

  function escapeXML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function escapeRegExp(value) {
    return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function sanitizeFilename(value) {
    return String(value || "book")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }

  function normalizeForCompare(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[‐‑‒–—―\-_:·•|~～]/g, "")
      .replace(/[〈〉《》<>\[\]\(\){}]/g, "");
  }

  function inferTitle(text) {
    const firstLine = String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean);

    if (!firstLine) return "";

    const rangeMatch = firstLine.match(
      /^(.*?)_\s*(\d+)\s*(?:~|～|-)\s*(\d+)\s*화\s*$/
    );

    if (rangeMatch) return rangeMatch[1].trim();

    if (!/^##/.test(firstLine)) return firstLine;

    return "";
  }

  function parseChapters(text) {
    const normalized = String(text || "")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n");

    const regex = /^##\s*(\d+)\s*화\s*$/gm;
    const matches = [...normalized.matchAll(regex)];
    const chapters = [];

    for (let i = 0; i < matches.length; i++) {
      const number = Number(matches[i][1]);
      const start = matches[i].index + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : normalized.length;

      chapters.push({
        number,
        title: `${number}화`,
        body: normalized.slice(start, end).trim()
      });
    }

    return chapters;
  }

  function cleanChapterBody(body, bookTitle, chapterNumber) {
    let lines = String(body || "")
      .replace(/\r\n?/g, "\n")
      .split("\n");

    const normalizedTitle = normalizeForCompare(bookTitle);
    const chapterOnly = new RegExp(`^제?\\s*${chapterNumber}\\s*화(?:\\s*[:：.\\-–—]?\\s*)?$`);

    // 맨 앞의 공백 제거
    while (lines.length && !lines[0].trim()) lines.shift();

    // 제목 영역은 앞쪽 몇 줄에만 존재한다고 보고 최대 8줄까지만 검사
    let checked = 0;
    while (lines.length && checked < 8) {
      const current = lines[0].trim();

      if (!current) {
        lines.shift();
        checked++;
        continue;
      }

      const normalizedCurrent = normalizeForCompare(current);

      // 소설 제목만 있는 줄
      if (
        normalizedTitle &&
        (
          normalizedCurrent === normalizedTitle ||
          normalizedCurrent === normalizeForCompare(`〈${bookTitle}〉`) ||
          normalizedCurrent === normalizeForCompare(`<${bookTitle}>`)
        )
      ) {
        lines.shift();
        checked++;
        continue;
      }

      // "1화", "제1화" 같은 회차명만 있는 줄
      if (chapterOnly.test(current)) {
        lines.shift();
        checked++;
        continue;
      }

      // "소설제목 1화", "소설제목 - 제1화" 등 한 줄 결합형
      if (normalizedTitle && normalizedCurrent.includes(normalizedTitle)) {
        const withoutTitle = normalizedCurrent.replace(normalizedTitle, "");
        const chapterToken = normalizeForCompare(`제${chapterNumber}화`);
        const chapterToken2 = normalizeForCompare(`${chapterNumber}화`);

        if (
          withoutTitle === chapterToken ||
          withoutTitle === chapterToken2 ||
          withoutTitle === ""
        ) {
          lines.shift();
          checked++;
          continue;
        }
      }

      // 여기까지 왔으면 실제 본문이 시작된 것으로 판단
      break;
    }

    return lines.join("\n").trim();
  }

  function textToXhtml(text) {
    const paragraphs = String(text || "")
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .map(part => part.trim())
      .filter(Boolean);

    if (!paragraphs.length) return "<p></p>";

    return paragraphs
      .map(part => `<p>${escapeXML(part).replace(/\n/g, "<br/>")}</p>`)
      .join("\n");
  }

  function getCoverInfo(file) {
    if (!file) return null;

    if (file.type === "image/jpeg") {
      return { ext: "jpg", media: "image/jpeg" };
    }

    if (file.type === "image/png") {
      return { ext: "png", media: "image/png" };
    }

    return null;
  }

  async function tryLoadFont() {
    try {
      const response = await fetch(FONT_URL, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();

      if (!buffer || buffer.byteLength < 1000) {
        throw new Error("font file too small");
      }

      fontState.className = "notice good";
      fontState.textContent =
        "✅ NanumMyeongjo-Regular.ttf 확인됨 — EPUB에 자동 포함됩니다.";

      return buffer;
    } catch (error) {
      fontState.className = "notice warn";
      fontState.textContent =
        "⚠️ NanumMyeongjo-Regular.ttf를 찾지 못했습니다. EPUB은 생성되지만 기기 기본 명조체로 표시됩니다.";

      return null;
    }
  }

  txtInput.addEventListener("change", async () => {
    const file = txtInput.files?.[0];

    if (!file) {
      loadedTxt = "";
      parsedChapters = [];
      txtPreview.classList.add("hidden");
      makeBtn.disabled = true;
      txtFileName.textContent = "선택된 파일 없음";
      return;
    }

    txtFileName.textContent = file.name;
    loadedTxt = await file.text();
    parsedChapters = parseChapters(loadedTxt);

    const detectedTitle = inferTitle(loadedTxt);
    if (detectedTitle) titleInput.value = detectedTitle;

    txtPreview.classList.remove("hidden");

    if (!parsedChapters.length) {
      txtPreview.className = "notice warn";
      txtPreview.innerHTML =
        "⚠️ <code>##1화</code> 형식의 회차를 찾지 못했습니다.";
      makeBtn.disabled = true;
      return;
    }

    const first = parsedChapters[0].number;
    const last = parsedChapters[parsedChapters.length - 1].number;

    txtPreview.className = "notice good";
    txtPreview.innerHTML =
      `✅ <b>${parsedChapters.length}개 회차</b> 발견<br>` +
      `${first}화 → ${last}화`;

    makeBtn.disabled = false;
  });

  coverInput.addEventListener("change", () => {
    const file = coverInput.files?.[0];

    if (lastCoverObjectURL) {
      URL.revokeObjectURL(lastCoverObjectURL);
      lastCoverObjectURL = null;
    }

    if (!file) {
      coverPreview.classList.add("hidden");
      coverPreview.removeAttribute("src");
      coverFileName.textContent = "선택된 이미지 없음";
      return;
    }

    coverFileName.textContent = file.name;
    lastCoverObjectURL = URL.createObjectURL(file);
    coverPreview.src = lastCoverObjectURL;
    coverPreview.classList.remove("hidden");
  });

  makeBtn.addEventListener("click", async () => {
    if (!parsedChapters.length) {
      alert("TXT 파일을 먼저 선택하세요.");
      return;
    }

    const bookTitle = titleInput.value.trim() || "Untitled";
    const author = authorInput.value.trim();
    const firstChapter = parsedChapters[0].number;
    const lastChapter = parsedChapters[parsedChapters.length - 1].number;
    const rangeText = `${firstChapter}화 ~ ${lastChapter}화`;

    const coverFile = coverInput.files?.[0] || null;
    const coverInfo = getCoverInfo(coverFile);

    makeBtn.disabled = true;
    status.textContent = "나눔명조 확인 중...";

    try {
      const fontBuffer = await tryLoadFont();

      status.textContent = "EPUB 생성 중...";

      const zip = new JSZip();

      // EPUB 규격: mimetype은 반드시 루트에, 무압축 저장
      zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

      zip.file(
        "META-INF/container.xml",
`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0"
 xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile
      full-path="OEBPS/content.opf"
      media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
      );

      const hasFont = Boolean(fontBuffer);

      if (hasFont) {
        zip.file("OEBPS/fonts/NanumMyeongjo-Regular.ttf", fontBuffer);
      }

      const fontFaceCSS = hasFont
        ? `
@font-face {
  font-family: "NanumMyeongjo";
  src: url("fonts/NanumMyeongjo-Regular.ttf") format("truetype");
  font-weight: normal;
  font-style: normal;
}
`
        : "";

      zip.file(
        "OEBPS/style.css",
`${fontFaceCSS}
html,
body {
  margin: 0;
  padding: 0;
}

body {
  font-family: "NanumMyeongjo", "Nanum Myeongjo", serif;
  font-size: 1em;
  line-height: 1.95;
  word-break: keep-all;
  overflow-wrap: break-word;
  color: #222222;
  background: #ffffff;
}

/* 표지: 예시처럼 흰 페이지 중앙에 원본 비율 그대로 */
body.cover-body {
  margin: 0;
  padding: 0;
  background: #ffffff;
}

.cover-wrap {
  min-height: 95vh;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.cover-wrap img {
  display: block;
  width: auto;
  height: auto;
  max-width: 88%;
  max-height: 84vh;
  margin: auto;
  object-fit: contain;
}

/* 제목 페이지 */
.title-page {
  min-height: 88vh;
  padding: 8%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.book-title {
  margin: 0 0 1.55em;
  font-family: "NanumMyeongjo", "Nanum Myeongjo", serif;
  font-size: 1.75em;
  font-weight: normal;
  line-height: 1.6;
}

.book-range {
  margin: 0;
  font-family: "NanumMyeongjo", "Nanum Myeongjo", serif;
  font-size: 1em;
  color: #888888;
}

/* 각 회차 */
.chapter {
  padding: 0 7% 8%;
}

.chapter-number {
  margin: 0;
  padding-top: 17vh;
  padding-bottom: 15vh;
  text-align: center;
  font-family: "NanumMyeongjo", "Nanum Myeongjo", serif;
  font-size: 1.58em;
  font-weight: normal;
  line-height: 1.4;
  color: #bc72d5;
}

.chapter p {
  margin: 0 0 1.32em;
  font-family: "NanumMyeongjo", "Nanum Myeongjo", serif;
  font-size: 1em;
  font-weight: normal;
  line-height: 1.95;
  text-align: left;
}

.chapter p:last-child {
  margin-bottom: 0;
}

/* 목차 */
.toc {
  padding: 7%;
}

.toc h1 {
  font-size: 1.4em;
  font-weight: normal;
}

.toc ol {
  padding-left: 1.5em;
}

.toc li {
  margin: .65em 0;
}
`
      );

      let coverManifest = "";
      let coverSpine = "";

      if (coverFile && coverInfo) {
        zip.file(
          `OEBPS/images/cover.${coverInfo.ext}`,
          await coverFile.arrayBuffer()
        );

        zip.file(
          "OEBPS/text/cover.xhtml",
`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
 xml:lang="ko"
 lang="ko">
<head>
  <title>표지</title>
  <meta name="viewport" content="width=device-width,height=device-height"/>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
</head>
<body class="cover-body">
  <div class="cover-wrap">
    <img src="../images/cover.${coverInfo.ext}"
      alt="${escapeXML(bookTitle)} 표지"/>
  </div>
</body>
</html>`
        );

        coverManifest = `
<item id="cover-image"
 href="images/cover.${coverInfo.ext}"
 media-type="${coverInfo.media}"
 properties="cover-image"/>
<item id="cover-page"
 href="text/cover.xhtml"
 media-type="application/xhtml+xml"/>`;

        coverSpine = `<itemref idref="cover-page" linear="yes"/>`;
      }

      // 표지 다음(표지가 없으면 첫 장)에 제목 + 범위
      zip.file(
        "OEBPS/text/title.xhtml",
`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
 xml:lang="ko"
 lang="ko">
<head>
  <title>${escapeXML(bookTitle)}</title>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
</head>
<body>
  <section class="title-page">
    <h1 class="book-title">${escapeXML(bookTitle)}</h1>
    <p class="book-range">${escapeXML(rangeText)}</p>
  </section>
</body>
</html>`
      );

      let chapterManifest = "";
      let chapterSpine = "";
      let navList = "";
      let ncxNavPoints = "";

      parsedChapters.forEach((chapter, index) => {
        const order = index + 1;
        const id = `chapter-${String(order).padStart(4, "0")}`;
        const file = `${id}.xhtml`;

        const cleanedBody = cleanChapterBody(
          chapter.body,
          bookTitle,
          chapter.number
        );

        zip.file(
          `OEBPS/text/${file}`,
`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
 xmlns:epub="http://www.idpf.org/2007/ops"
 xml:lang="ko"
 lang="ko">
<head>
  <title>${escapeXML(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
</head>
<body>
  <section class="chapter" epub:type="chapter">
    <h1 class="chapter-number">${escapeXML(chapter.title)}</h1>
    ${textToXhtml(cleanedBody)}
  </section>
</body>
</html>`
        );

        chapterManifest += `
<item id="${id}"
 href="text/${file}"
 media-type="application/xhtml+xml"/>`;

        chapterSpine += `<itemref idref="${id}"/>\n`;

        navList += `
<li><a href="text/${file}">${escapeXML(chapter.title)}</a></li>`;

        ncxNavPoints += `
<navPoint id="navPoint-${order}" playOrder="${order}">
  <navLabel><text>${escapeXML(chapter.title)}</text></navLabel>
  <content src="text/${file}"/>
</navPoint>`;
      });

      zip.file(
        "OEBPS/nav.xhtml",
`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
 xmlns:epub="http://www.idpf.org/2007/ops"
 xml:lang="ko"
 lang="ko">
<head>
  <title>목차</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body class="toc">
  <nav epub:type="toc" id="toc">
    <h1>목차</h1>
    <ol>
      ${navList}
    </ol>
  </nav>
</body>
</html>`
      );

      const uuid = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const modified = new Date()
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");

      // EPUB 2 계열 리더 호환성을 위한 NCX도 함께 생성
      zip.file(
        "OEBPS/toc.ncx",
`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"
 version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXML(bookTitle)}</text>
  </docTitle>
  <navMap>
    ${ncxNavPoints}
  </navMap>
</ncx>`
      );

      const fontManifest = hasFont
        ? `
<item id="nanum"
 href="fonts/NanumMyeongjo-Regular.ttf"
 media-type="font/ttf"/>`
        : "";

      zip.file(
        "OEBPS/content.opf",
`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf"
 version="3.0"
 unique-identifier="book-id"
 xml:lang="ko">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXML(bookTitle)}</dc:title>
    <dc:language>ko</dc:language>
    ${author ? `<dc:creator>${escapeXML(author)}</dc:creator>` : ""}
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>

  <manifest>
    <item id="nav"
      href="nav.xhtml"
      media-type="application/xhtml+xml"
      properties="nav"/>
    <item id="ncx"
      href="toc.ncx"
      media-type="application/x-dtbncx+xml"/>
    <item id="style"
      href="style.css"
      media-type="text/css"/>
    <item id="title-page"
      href="text/title.xhtml"
      media-type="application/xhtml+xml"/>
    ${fontManifest}
    ${coverManifest}
    ${chapterManifest}
  </manifest>

  <spine toc="ncx">
    ${coverSpine}
    <itemref idref="title-page" linear="yes"/>
    ${chapterSpine}
  </spine>
</package>`
      );

      status.textContent = "EPUB 압축 중...";

      const blob = await zip.generateAsync({
        type: "blob",
        mimeType: "application/epub+zip",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download =
        `${sanitizeFilename(bookTitle)}_${firstChapter}~${lastChapter}화.epub`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      status.textContent =
        `✅ 완료\n${parsedChapters.length}개 회차 · ${firstChapter}화 ~ ${lastChapter}화` +
        (hasFont ? "\n나눔명조 포함" : "\n폰트 파일 미탑재 — 기기 기본 명조체 사용");
    } catch (error) {
      console.error(error);
      status.textContent =
        `❌ EPUB 생성 실패\n${error?.message || String(error)}`;
    } finally {
      makeBtn.disabled = false;
    }
  });

  // 페이지를 열었을 때 폰트 파일 유무 미리 확인
  tryLoadFont();
})();
