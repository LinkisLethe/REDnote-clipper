# XHS Clipper

[![Chrome](https://img.shields.io/badge/Chrome-116%2B-4285F4?logo=googlechrome&logoColor=white&style=flat-square)](https://www.google.com/chrome/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![OCR](https://img.shields.io/badge/OCR-PP--OCRv6-0C7BDC?style=flat-square)](https://github.com/PaddlePaddle/PaddleOCR)

[中文说明](README.zh-CN.md)

XHS Clipper is a Chrome Manifest V3 extension that exports the current Xiaohongshu post as a plain-text Markdown file. It collects the title, body, author, tags, engagement data, and image order. Optional local OCR can add text found inside images without embedding or packaging the image files.

## Use the extension

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Select `Load unpacked`.
4. Choose this project's `dist` directory.
5. Open a Xiaohongshu image post and wait for the page to finish loading.
6. Open the extension, review the Markdown preview, and select `Download .md`.

OCR is disabled by default. The first OCR run downloads about 31 MB of PaddleOCR models; later runs use the browser cache. The progress card shows model download, engine initialization, per-image recognition, text combining, elapsed time, and an estimated remaining time. OCR can be paused between images or stopped immediately. A cache read that takes too long fails instead of leaving the popup waiting indefinitely. Images are processed locally. A failed image does not stop the remaining images, and long images are split before their OCR text is merged in the original order.

A regular image usually takes about 5 to 15 seconds on a recent desktop. Long screenshots can take tens of seconds because they are split into several tiles. A full VPN can slow the initial model and Xiaohongshu image downloads when it routes traffic away from mainland China; the local OCR and progress display are unaffected once the required files are available.

The interface supports Simplified Chinese and English and follows Chrome's display language. YAML field names remain in English. Post content and OCR output are not translated.

## Current scope

- Collect the currently open Xiaohongshu image post.
- Prefer structured page data and fall back to DOM extraction.
- Preview, edit, copy, and download plain-text Markdown.
- Run optional PP-OCRv6 Small OCR in the browser.
- Exclude comments, batch collection, creator keyword search, image export, and Obsidian integration for now.

Xiaohongshu page changes may temporarily break individual fields. When reporting a problem, keep the post URL and note whether the missing part is the title, body, images, or OCR text.

## Development

Node.js 20 or newer and pnpm are required.

```bash
pnpm install
pnpm verify
```

The production build is written to `dist`. Chrome 116 or newer can load that directory directly.

To check OCR separately, run `pnpm dev` and open `http://127.0.0.1:5173/tests/browser/ocr-smoke.html`. A `Passed` result verifies mixed Chinese and English recognition, the worker, and the local WASM runtime.

The core modules are separated into `SourceAdapter`, `OcrEngine`, and `Exporter`. Future creator search, keyword filtering, a web interface, or a Skill entry point can reuse the same `Note` data model and Markdown exporter.

OCR uses the Apache-2.0 licensed `@paddleocr/paddleocr-js` package. Product flow and data-structure references include Obsidian Web Clipper, Bilibili Obsidian Clipper, ChatGPT Exporter, xiaohongshu-mcp, and xiaohongshu-skills. No business code was copied from those projects.
