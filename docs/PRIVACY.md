# Privacy policy

Effective date: August 24, 2026

XHS Clipper adds a floating workspace to Xiaohongshu pages. It prepares the current post on an article page. The home feed, search results, and creator profiles are scanned only after the user selects **Scan current page**. Clipping starts only after the user selects posts and confirms the settings. The extension has no developer-operated server, account system, advertising SDK, or analytics service.

## Data the extension accesses

When it prepares the current post or scans a Xiaohongshu page, XHS Clipper may read post URLs, titles, visible author names, and thumbnails already loaded in that tab. It does not scroll the page or load more results by itself.

For an open or selected post, XHS Clipper may read the title, body, author information, tags, timestamps, engagement counts, source URL, image URLs, and image content needed for OCR. During a batch, selected posts are opened one at a time in inactive tabs and closed after processing. The extension does not collect comments, read unrelated browser tabs, or process posts that the user did not select.

## Local processing

OCR runs inside Chrome with models bundled in the extension. Images and recognized text are not sent to a remote OCR provider. Image data is read into memory for recognition and is not exported as image files.

Chrome local extension storage may contain the OCR setting, an in-progress OCR job, floating-workspace preferences, the current batch queue, and up to 200 completed clipping records. These records contain post IDs, titles, URLs, filenames, output types, and completion times so the interface can mark posts already handled. The Obsidian API key is also stored locally. Completed OCR image text is removed from the temporary OCR job when the task ends.

The Obsidian note folder and local API address may be stored with Chrome extension sync so the user's own Chrome profile can reuse those preferences. XHS Clipper does not receive that synced data.

## Data leaving the extension

Data leaves the extension only when the user chooses an output action:

- **Copy** places the Markdown on the system clipboard.
- **Download** saves a Markdown file through Chrome.
- **Write to Obsidian** sends the Markdown and bearer token to the loopback address configured by the user. Only `127.0.0.1` and `localhost` addresses are accepted.

The source page and its image delivery hosts receive normal browser requests required to display and read the post. Their own privacy policies apply to those services.

## Retention and deletion

XHS Clipper does not maintain a remote copy of captured content. Users can remove preferences, task records, and completion history from Chrome's extension settings or by uninstalling the extension. Downloaded Markdown files and notes written to Obsidian remain under the user's control.

## Changes and contact

Material changes to this policy will be recorded in the repository. Questions can be opened through the repository's [GitHub issues](https://github.com/LinkisLethe/xhs-clipper/issues).
