# Changelog

## Unreleased

### Performance

- Added repeatable OCR and large-job stress benchmarks.
- Reduced large OCR job state size by compacting processed line geometry after formatting.
- Replaced long-image PNG re-encoding with streamed in-memory tiles.
- Avoided full job persistence and popup redraws for transient per-image stage updates.
- Released ONNX input and output tensors explicitly after each inference.

- Licensed the project under Apache License 2.0 with Hongjia LIN as the copyright holder.
- Added third-party notices for PaddleOCR models and ONNX Runtime Web.
- Added responsible-use and unofficial-project notices to both READMEs.
- Removed unused PP-OCRv6 Small model files from the repository.
- Removed development-only OCR benchmark files and archived internal planning notes locally.

## 0.4.0 - 2026-07-29

### Added

- Selective OCR for all images, all images except the cover, or a custom page range.
- A bilingual Obsidian settings page with local connection testing.
- Direct Markdown writing through Obsidian Local REST API, including same-name checks and overwrite confirmation.
- Persistent inline status for Obsidian writes.
- Privacy and browser-permission documentation.

### Changed

- Bundled PP-OCRv6 Tiny models replace runtime model downloads.
- OCR startup, progress timing, pause, and stop behavior are more explicit.
- The popup uses a fixed-height layout with a scrollable Markdown preview and always-visible actions.
- OCR post-processing repairs common Chinese-English spacing, wrapped lines, paragraph boundaries, and exact duplicates.

### Fixed

- Preserved source image indexes when only part of a post is recognized.
- Corrected selected-image counts in the Markdown preview.
- Removed duplicate Xiaohongshu topic tags ending in `[话题]#`.
- Recovered split Chinese names and sentence fragments more reliably.
- Prevented stale or incomplete OCR jobs from being reused.

## 0.3.2

- Optimized the bundled browser OCR pipeline.

## 0.3.1

- Bundled OCR models with the extension.

## 0.3.0

- Added the first browser-local OCR workflow.
