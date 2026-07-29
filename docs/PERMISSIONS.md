# Browser permissions

XHS Clipper requests only the permissions used by its current capture, OCR, export, and local Obsidian features.

## Chrome permissions

| Permission | Use |
|---|---|
| `activeTab` | Access the Xiaohongshu post selected by the user after they open the extension. |
| `scripting` | Run the extractor in the active page so it can read structured page state and visible content. |
| `storage` | Save OCR preferences and jobs, plus Obsidian settings. |
| `offscreen` | Keep local OCR running in a hidden extension document instead of tying it to the popup lifetime. |
| `downloads` | Save the generated Markdown file. |
| `clipboardWrite` | Copy the edited Markdown preview to the system clipboard. |

## Host access

| Host pattern | Use |
|---|---|
| `https://www.xiaohongshu.com/*` and `https://*.xiaohongshu.com/*` | Read the current Xiaohongshu post. |
| `https://*.xhscdn.com/*` | Load post images into memory for optional OCR. |
| Loopback HTTP and HTTPS on `127.0.0.1` and `localhost` | Test and use the user's local Obsidian REST API. |

The extension does not request broad access to every HTTP or HTTPS website. It does not run a persistent content script across browsing sessions.

## Extension page policy

The extension permits WebAssembly evaluation on its own pages because `onnxruntime-web` runs the bundled OCR models through WebAssembly. Remote scripts are not allowed by the extension content security policy.
