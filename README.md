# XHS Clipper

[![Chrome 116+](https://img.shields.io/badge/Chrome-116%2B-4285F4?logo=googlechrome&logoColor=white&style=flat-square)](https://www.google.com/chrome/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![OCR](https://img.shields.io/badge/OCR-PP--OCRv6-0C7BDC?style=flat-square)](https://github.com/PaddlePaddle/PaddleOCR)
[![Version](https://img.shields.io/badge/version-0.4.0-D8473E?style=flat-square)](https://github.com/LinkisLethe/xhs-clipper)

[中文说明](README.zh-CN.md)

XHS Clipper is a Chrome Manifest V3 extension that turns the currently open Xiaohongshu image post into editable plain-text Markdown. It reads the post metadata and body, optionally recognizes text inside selected images, and can download the result or write it directly to a local Obsidian vault.

## Features

- Capture the title, body, author, tags, timestamps, engagement counts, source URL, and image order from the current post.
- Prefer structured page data and fall back to visible DOM content.
- Run bundled PP-OCRv6 Tiny models locally in the browser. Images and OCR text are not sent to a remote OCR service.
- Recognize all images, skip the cover, or enter a custom page range.
- Repair common Chinese-English spacing, wrapped lines, paragraph breaks, and repeated OCR text.
- Preview and edit Markdown before copying, downloading, or writing it to Obsidian.
- Check for an existing Obsidian note and ask before overwriting it.
- Use a Simplified Chinese or English interface based on Chrome's display language.

## Install from source

Requirements: Node.js 20 or newer and pnpm.

```bash
pnpm install
pnpm verify
```

The production build is written to `dist`.

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Choose this project's `dist` directory.
5. Open a Xiaohongshu image post, then click the extension icon.

## OCR workflow

OCR is optional. The extension includes about 6 MB of PP-OCRv6 Tiny models, so it does not download models during normal use. The first OCR job initializes the local ONNX runtime; later jobs reuse the loaded engine. The progress card shows initialization, image recognition, text combination, elapsed time, and estimated time remaining.

Long images are split into smaller sections before recognition and merged in source order. A failed image does not stop the remaining images. OCR output is kept as extracted text; post-processing only repairs layout and exact duplicates rather than rewriting the author's content.

## Write to Obsidian

Direct writing uses the [Local REST API with MCP](https://github.com/coddingtonbear/obsidian-local-rest-api) community plugin.

1. Install and enable the plugin in Obsidian.
2. Enable its non-encrypted HTTP server.
3. Open XHS Clipper settings from the gear button.
4. Enter the note folder, local API address, and API key.
5. Save the settings and test the connection.

The default folder is `Clippings/Xiaohongshu`, and the default API address is `http://127.0.0.1:27123`. The API key stays in local extension storage. XHS Clipper only permits loopback Obsidian addresses.

## Markdown output

The file contains stable YAML frontmatter followed by the post body and one section for each recognized image. The filename format is `title_author_date.md`. Images are not embedded or downloaded.

## Current scope

XHS Clipper handles one user-opened Xiaohongshu image post at a time. It does not collect comments, search creators, batch-capture accounts, publish or interact with posts, download image files, or use a cloud database.

See the [privacy policy](docs/PRIVACY.md) and [permission reference](docs/PERMISSIONS.md) for the data and browser-access details.

## Development

```bash
pnpm test
pnpm build
pnpm verify
```

The code is split into page extraction, OCR, post-processing, Markdown export, and Obsidian integration modules. Future search or Skill entry points can reuse the same `Note` data model without changing the exporter.

OCR uses PP-OCRv6 Tiny models and the Apache-2.0 licensed `onnxruntime-web` runtime. Image preprocessing and output decoding follow the public PaddleOCR.js implementation, with Canvas and TypeScript replacing OpenCV. Product and data-structure references include Obsidian Web Clipper, Bilibili Obsidian Clipper, ChatGPT Exporter, xiaohongshu-mcp, and xiaohongshu-skills. Their business code was not copied into this project.

See [CHANGELOG.md](CHANGELOG.md) for version history.
