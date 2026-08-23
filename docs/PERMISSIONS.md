# Browser permissions

XHS Clipper requests only the permissions used by its current capture, OCR, export, and local Obsidian features.

## Chrome permissions

| Permission | Use |
|---|---|
| `activeTab` | Access the current Xiaohongshu tab after the user selects the extension button. |
| `scripting` | Reload the workspace if its content script is unavailable and run the extractor in user-selected posts. |
| `storage` | Save OCR settings, panel preferences, the current batch, up to 200 completion records, and Obsidian settings. |
| `offscreen` | Keep local OCR running in a hidden extension document instead of tying it to the floating workspace. |
| `downloads` | Save the generated Markdown file. |

## Host access

| Host pattern | Use |
|---|---|
| `https://www.xiaohongshu.com/*` and `https://*.xiaohongshu.com/*` | Show the floating workspace, scan post cards already loaded on the current page, and process posts selected by the user. |
| `https://*.xhscdn.com/*` | Load post images into memory for optional OCR. |
| Loopback HTTP and HTTPS on `127.0.0.1` and `localhost` | Test and use the user's local Obsidian REST API. |

The floating-workspace content script runs only on Xiaohongshu pages. It does not run on other websites. Scanning and batch processing still require explicit user actions, and each batch is limited to 20 selected posts.

## Extension page policy

The extension permits WebAssembly evaluation on its own pages because `onnxruntime-web` runs the bundled OCR models through WebAssembly. Remote scripts are not allowed by the extension content security policy.
