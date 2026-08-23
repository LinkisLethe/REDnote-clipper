# Changelog

## Unreleased

### Documentation

- Replaced outdated interface images with anonymous v1.0.0 screenshots of the batch workspace, single-post popup, and Obsidian settings.

## 1.0.0 - 2026-08-24

### Added

- Added a floating clipping workspace to Xiaohongshu home, search, creator, and post pages.
- Added current-page scanning, all-keyword title filtering, direct post navigation, and explicit selection for batches of up to 20 posts.
- Added a start summary, per-post status, elapsed and remaining time, and safe stopping after the current post.
- Added Chrome download and Obsidian output choices to the batch workflow.
- Added Obsidian duplicate handling with skip, save as a new version, and source-checked overwrite choices.
- Added local OCR choices for batch tasks, including custom page input and an estimated image count.

### Changed

- Single-post and batch Obsidian exports now share the fixed `Clippings/XHS` directory and the same Local REST API settings.
- The floating workspace remembers OCR, output, section, and collapsed-window preferences in Chrome local storage.
- The wide workspace stays anchored to the right edge, shows richer post rows, and keeps the normal panel width when collapsed.
- Completed batch rows and success messages now clear after a short delay instead of accumulating in the panel.

### Fixed

- Prepared the current post automatically after Xiaohongshu route changes.
- Prevented selection beyond the 20-post limit and guarded repeated task starts.
- Allowed repeated scans and clipping tasks without refreshing the page.
- Fixed repeated wide-mode toggles, stale queue state after reload, and persistent completion notices.
- Added source-note checks before Obsidian overwrite to avoid replacing an unrelated note with the same filename.

## 0.4.1 - 2026-08-13

### Performance

- Added repeatable OCR and large-job stress benchmarks.
- Reduced large OCR job state size by compacting processed line geometry after formatting.
- Replaced long-image PNG re-encoding with streamed in-memory tiles.
- Avoided full job persistence and popup redraws for transient per-image stage updates.
- Released ONNX input and output tensors explicitly after each inference.

### Documentation

- Clarified how to download, extract, and load the packaged Chrome extension.
- Added measured OCR and large-job performance results with reproduction commands.

## 0.4.0 - 2026-07-30

### Project

- Licensed the project under Apache License 2.0 with Hongjia LIN as the copyright holder.
- Added third-party notices for PaddleOCR models and ONNX Runtime Web.
- Added responsible-use and unofficial-project notices to both READMEs.
- Removed unused PP-OCRv6 Small model files from the repository.
- Removed development-only OCR benchmark files and archived internal planning notes locally.

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
