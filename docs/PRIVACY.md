# Privacy policy

Effective date: July 29, 2026

XHS Clipper processes a Xiaohongshu image post only after the user opens that post and activates the extension. The extension has no developer-operated server, account system, advertising SDK, or analytics service.

## Data the extension accesses

For the current user-opened post, XHS Clipper may read the title, body, author information, tags, timestamps, engagement counts, source URL, image URLs, and image content needed for OCR. It does not browse creator profiles, collect comments, or capture other posts in the background.

## Local processing

OCR runs inside Chrome with models bundled in the extension. Images and recognized text are not sent to a remote OCR provider. Image data is read into memory for recognition and is not exported as image files.

The extension may keep the OCR enabled state, the latest OCR job, recognized text, image URLs, and the Obsidian API key in Chrome local extension storage. The Obsidian note folder and local API address may be stored with Chrome extension sync so the user's own Chrome profile can reuse those preferences. XHS Clipper does not receive that synced data.

## Data leaving the extension

Data leaves the extension only when the user chooses an output action:

- **Copy** places the Markdown on the system clipboard.
- **Download** saves a Markdown file through Chrome.
- **Write to Obsidian** sends the Markdown and bearer token to the loopback address configured by the user. Only `127.0.0.1` and `localhost` addresses are accepted.

The source page and its image delivery hosts receive normal browser requests required to display and read the post. Their own privacy policies apply to those services.

## Retention and deletion

XHS Clipper does not maintain a remote copy of captured content. Users can remove locally stored extension data from Chrome's extension settings or by uninstalling the extension. Downloaded Markdown files and notes written to Obsidian remain under the user's control.

## Changes and contact

Material changes to this policy will be recorded in the repository. Questions can be opened through the repository's [GitHub issues](https://github.com/LinkisLethe/xhs-clipper/issues).
