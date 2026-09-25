(() => {
  "use strict";

  const FONT_URL = "./fonts/NanumMyeongjo-Regular.ttf";

  const $ = (id) => document.getElementById(id);

  const txtInput = $("txtFile");
  const titleInput = $("bookTitle");
  const authorInput = $("author");
  const coverInput = $("coverFile");
  const coverPreview = $("coverPreview");
  const txtPreview = $("txtPreview");
  const txtFileName = $("txtFileName");
  const coverFileName = $("coverFileName");
  const fontState = $("fontState");
  const makeBtn = $("makeBtn");
  const status = $("status");

  const sideMargin = $("sideMargin");
  const titleTop = $("titleTop");
  const titleBottom = $("titleBottom");
  const paragraphGap = $("paragraphGap");

  const sideMarginValue = $("sideMarginValue");
  const titleTopValue = $("titleTopValue");
  const titleBottomValue = $("titleBottomValue");
  const paragraphGapValue = $("paragraphGapValue");

  const previewPage = $("chapterPreviewPage");
  const previewChapterNumber = $("previewChapterNumber");
  const previewBody = $("previewBody");

  let loadedTxt = "";
  let loadedSources = [];
  let parsedChapters = [];
  let duplicateChapters = [];
  let missingChapters = [];
  let lastCoverObjectURL = null;

  function escapeXML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
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
      const end = i + 1 < matches.length
        ? matches[i + 1].index
        : normalized.length;

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
    const chapterOnly = new RegExp(
      `^제?\\s*${chapterNumber}\\s*화(?:\\s*[:：.\\-–—]?\\s*)?$`
    );

    while (lines.length && !lines[0].trim()) lines.shift();

    let checked = 0;

    while (lines.length && checked < 8) {
      const current = lines[0].trim();

      if (!current) {
        lines.shift();
        checked++;
        continue;
      }

      const normalizedCurrent = normalizeForCompare(current);

      if (normalizedTitle && normalizedCurrent === normalizedTitle) {
        lines.shift();
        checked++;
        continue;
      }

      if (chapterOnly.test(current)) {
        lines.shift();
        checked++;
        continue;
      }

      if (normalizedTitle && normalizedCurrent.includes(normalizedTitle)) {
        const remainder = normalizedCurrent.replace(normalizedTitle, "");
        const ch1 = normalizeForCompare(`${chapterNumber}화`);
        const ch2 = normalizeForCompare(`제${chapterNumber}화`);

        if (remainder === "" || remainder === ch1 || remainder === ch2) {
          lines.shift();
          checked++;
          continue;
        }
      }

      break;
    }

    return lines.join("\n").trim();
  }

  function splitParagraphs(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .map(block =>
        block
          .split(/\n+/)
          .map(line => line.trim())
          .filter(Boolean)
          .join(" ")
          .trim()
      )
      .filter(Boolean);
  }

  function textToXhtml(text) {
    const paragraphs = splitParagraphs(text);

    if (!paragraphs.length) return "<p></p>";

    return paragraphs
      .map(part => `<p>${escapeXML(part)}</p>`)
      .join("\n");
  }

  function getCoverInfo(file) {
    if (!file) return null;
    if (file.type === "image/jpeg") return { ext: "jpg", media: "image/jpeg" };
    if (file.type === "image/png") return { ext: "png", media: "image/png" };
    return null;
  }


  function mergeChapterSources(sources) {
    const chapterMap = new Map();
    const duplicates = [];

    // 선택된 파일 순서대로 읽고, 같은 화수가 겹치면 첫 번째 것을 유지
    for (const source of sources) {
      for (const chapter of source.chapters) {
        if (chapterMap.has(chapter.number)) {
          duplicates.push({
            number: chapter.number,
            keptFrom: chapterMap.get(chapter.number).sourceName,
            skippedFrom: source.name
          });
          continue;
        }

        chapterMap.set(chapter.number, {
          ...chapter,
          sourceName: source.name
        });
      }
    }

    const merged = [...chapterMap.values()]
      .sort((a, b) => a.number - b.number);

    return {
      chapters: merged,
      duplicates
    };
  }

  function detectMissingChapterNumbers(chapters) {
    if (!chapters.length) return [];

    const first = chapters[0].number;
    const last = chapters[chapters.length - 1].number;
    const have = new Set(chapters.map(ch => ch.number));
    const missing = [];

    for (let n = first; n <= last; n++) {
      if (!have.has(n)) missing.push(n);
    }

    return missing;
  }

  function formatNumberList(numbers, limit = 20) {
    if (!numbers.length) return "";

    const shown = numbers.slice(0, limit).join(", ");
    return numbers.length > limit
      ? `${shown} 외 ${numbers.length - limit}개`
      : shown;
  }

  function getSettings() {
    return {
      side: Number(sideMargin.value),
      top: Number(titleTop.value),
      bottom: Number(titleBottom.value),
      paragraphGap: Number(paragraphGap.value)
    };
  }

  function updateSliderLabels() {
    sideMarginValue.textContent = `${sideMargin.value}%`;
    titleTopValue.textContent = `${titleTop.value}%`;
    titleBottomValue.textContent = `${titleBottom.value}%`;
    paragraphGapValue.textContent = `${Number(paragraphGap.value).toFixed(2)}em`;
  }

  function updatePreview() {
    updateSliderLabels();

    const s = getSettings();

    previewChapterNumber.style.paddingTop = `${s.top}%`;
    previewChapterNumber.style.paddingBottom = `${s.bottom}%`;
    previewPage.style.paddingLeft = `${s.side}%`;
    previewPage.style.paddingRight = `${s.side}%`;

    previewBody.querySelectorAll("p").forEach(p => {
      p.style.marginBottom = `${s.paragraphGap}em`;
    });

    if (!parsedChapters.length) return;

    const sourceTitle = loadedSources.find(source => source.detectedTitle)?.detectedTitle || inferTitle(loadedTxt) || "";
    const bookTitle = titleInput.value.trim() || sourceTitle;
    const ch = parsedChapters[0];

    previewChapterNumber.textContent = ch.title;

    const cleaned = cleanChapterBody(ch.body, bookTitle, ch.number);
    const paragraphs = splitParagraphs(cleaned).slice(0, 8);

    previewBody.innerHTML = paragraphs.length
      ? paragraphs.map(p =>
          `<p>${escapeXML(p)}</p>`
        ).join("")
      : "<p>본문이 없습니다.</p>";

    previewBody.querySelectorAll("p").forEach(p => {
      p.style.marginBottom = `${s.paragraphGap}em`;
    });
  }

  [sideMargin, titleTop, titleBottom, paragraphGap].forEach(input => {
    input.addEventListener("input", updatePreview);
  });

  titleInput.addEventListener("input", updatePreview);

  async function tryLoadFont() {
    try {
      const response = await fetch(FONT_URL, { cache: "no-store" });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buffer = await response.arrayBuffer();

      if (!buffer || buffer.byteLength < 1000) {
        throw new Error("font file too small");
      }

      fontState.className = "notice good";
      fontState.textContent =
        "✅ NanumMyeongjo-Regular.ttf 확인됨 — 미리보기와 EPUB에 사용됩니다.";

      return buffer;
    } catch (error) {
      fontState.className = "notice warn";
      fontState.textContent =
        "⚠️ NanumMyeongjo-Regular.ttf를 찾지 못했습니다. 기본 명조체로 미리보기/생성됩니다.";

      return null;
    }
  }

  txtInput.addEventListener("change", async () => {
    const files = [...(txtInput.files || [])];

    if (!files.length) {
      loadedTxt = "";
      loadedSources = [];
      parsedChapters = [];
      duplicateChapters = [];
      missingChapters = [];

      txtPreview.classList.add("hidden");
      makeBtn.disabled = true;
      txtFileName.textContent = "선택된 파일 없음";
      updatePreview();
      return;
    }

    txtFileName.textContent =
      files.length === 1
        ? files[0].name
        : `${files.length}개 파일 선택됨`;

    loadedSources = [];

    for (const file of files) {
      const text = await file.text();

      loadedSources.push({
        name: file.name,
        text,
        detectedTitle: inferTitle(text),
        chapters: parseChapters(text)
      });
    }

    // 제목 인식용: 첫 번째로 제목이 정상 인식되는 파일 사용
    const firstTitleSource = loadedSources.find(source => source.detectedTitle);
    if (firstTitleSource?.detectedTitle) {
      titleInput.value = firstTitleSource.detectedTitle;
    }

    const merged = mergeChapterSources(loadedSources);
    parsedChapters = merged.chapters;
    duplicateChapters = merged.duplicates;
    missingChapters = detectMissingChapterNumbers(parsedChapters);

    // 기존 미리보기 함수와 호환되도록 첫 소스 텍스트를 대표값으로 저장
    loadedTxt = loadedSources[0]?.text || "";

    txtPreview.classList.remove("hidden");

    if (!parsedChapters.length) {
      txtPreview.className = "notice warn";
      txtPreview.innerHTML =
        "⚠️ 선택한 TXT들에서 <code>##1화</code> 형식의 회차를 찾지 못했습니다.";
      makeBtn.disabled = true;
      updatePreview();
      return;
    }

    const first = parsedChapters[0].number;
    const last = parsedChapters[parsedChapters.length - 1].number;

    const fileSummary =
      files.length === 1
        ? `<b>${files[0].name}</b>`
        : `<b>${files.length}개 TXT</b> 병합`;

    const duplicateSummary = duplicateChapters.length
      ? `<br>↪ 중복 회차 ${duplicateChapters.length}개 제거: ` +
        `${formatNumberList([...new Set(duplicateChapters.map(v => v.number))])}화`
      : "";

    const missingSummary = missingChapters.length
      ? `<br>⚠️ 빠진 회차 ${missingChapters.length}개: ` +
        `${formatNumberList(missingChapters)}화`
      : `<br>✅ ${first}화~${last}화 사이 빠진 회차 없음`;

    txtPreview.className =
      missingChapters.length ? "notice warn" : "notice good";

    txtPreview.innerHTML =
      `${fileSummary}<br>` +
      `✅ 총 <b>${parsedChapters.length}개 회차</b> · ${first}화 → ${last}화` +
      duplicateSummary +
      missingSummary;

    makeBtn.disabled = false;
    updatePreview();
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

    const settings = getSettings();
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
      const hasFont = Boolean(fontBuffer);

      status.textContent = "EPUB 생성 중...";

      const zip = new JSZip();

      zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

      zip.file(
        "META-INF/container.xml",
`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0"
 xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf"
      media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
      );

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
html, body {
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
  font-size: 1.75em;
  font-weight: normal;
  line-height: 1.6;
}

.book-range {
  margin: 0;
  font-size: 1em;
  color: #888888;
}

/* 사용자가 웹페이지에서 조절한 값 */
.chapter {
  padding: 0 ${settings.side}% 8%;
}

.chapter-number {
  margin: 0;
  padding-top: ${settings.top}vh;
  padding-bottom: ${settings.bottom}vh;
  text-align: center;
  font-size: 1.58em;
  font-weight: normal;
  line-height: 1.4;
  color: #bc72d5;
}

.chapter p {
  margin: 0 0 ${settings.paragraphGap}em;
  font-size: 1em;
  font-weight: normal;
  line-height: 1.95;
  text-align: left;
}

.chapter p:last-child {
  margin-bottom: 0;
}

.toc {
  padding: 7%;
}

.toc h1 {
  font-size: 1.4em;
  font-weight: normal;
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
 xml:lang="ko" lang="ko">
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
<item id="cover-image" href="images/cover.${coverInfo.ext}"
 media-type="${coverInfo.media}" properties="cover-image"/>
<item id="cover-page" href="text/cover.xhtml"
 media-type="application/xhtml+xml"/>`;

        coverSpine = `<itemref idref="cover-page" linear="yes"/>`;
      }

      zip.file(
        "OEBPS/text/title.xhtml",
`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
 xml:lang="ko" lang="ko">
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
 xml:lang="ko" lang="ko">
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
<item id="${id}" href="text/${file}"
 media-type="application/xhtml+xml"/>`;

        chapterSpine += `<itemref idref="${id}"/>\n`;
        navList += `<li><a href="text/${file}">${escapeXML(chapter.title)}</a></li>\n`;

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
 xml:lang="ko" lang="ko">
<head>
  <title>목차</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body class="toc">
  <nav epub:type="toc" id="toc">
    <h1>목차</h1>
    <ol>${navList}</ol>
  </nav>
</body>
</html>`
      );

      const uuid = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      zip.file(
        "OEBPS/toc.ncx",
`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXML(bookTitle)}</text></docTitle>
  <navMap>${ncxNavPoints}</navMap>
</ncx>`
      );

      const modified = new Date()
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");

      const fontManifest = hasFont
        ? `<item id="nanum" href="fonts/NanumMyeongjo-Regular.ttf"
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
    <item id="nav" href="nav.xhtml"
      media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx"
      media-type="application/x-dtbncx+xml"/>
    <item id="style" href="style.css"
      media-type="text/css"/>
    <item id="title-page" href="text/title.xhtml"
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

      const sourceCountText =
        loadedSources.length > 1
          ? `\nTXT ${loadedSources.length}개 병합`
          : "";

      const duplicateText =
        duplicateChapters.length
          ? `\n중복 회차 ${duplicateChapters.length}개 제거`
          : "";

      const missingText =
        missingChapters.length
          ? `\n⚠️ 빠진 회차: ${formatNumberList(missingChapters)}화`
          : "";

      status.textContent =
        `✅ 완료\n${parsedChapters.length}개 회차 · ${firstChapter}화 ~ ${lastChapter}화` +
        sourceCountText +
        duplicateText +
        missingText +
        `\n좌우 ${settings.side}% · 제목 위 ${settings.top}vh · 제목 아래 ${settings.bottom}vh`;
    } catch (error) {
      console.error(error);
      status.textContent =
        `❌ EPUB 생성 실패\n${error?.message || String(error)}`;
    } finally {
      makeBtn.disabled = false;
    }
  });

  updatePreview();
  tryLoadFont();
})();
