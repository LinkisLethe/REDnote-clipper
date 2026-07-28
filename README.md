# 红薯 Markdown 采集器

这是一个 Chrome Manifest V3 扩展。打开一篇小红书笔记后，点击扩展即可读取标题、正文、作者、标签、互动数据和图片顺序，并导出一个纯文本 Markdown 文件。图片不会写入文件；只有打开 OCR 开关时，扩展才会识别图片文字。

## 直接使用

1. 打开 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目的 `dist` 文件夹。
5. 打开一篇小红书笔记，等页面内容显示完整后点击扩展图标。
6. 检查或修改 Markdown 预览，然后点击“下载 .md”。

OCR 默认关闭。首次打开 OCR 时会下载 PaddleOCR 模型，之后从本机缓存读取。图片在浏览器本地处理，不会上传到我们的服务器。单张图片失败不会阻断其他图片；长图会先切块，再按原顺序合并文字。

界面支持简体中文和英文，默认跟随 Chrome 的界面语言。Markdown 的 YAML 字段固定使用英文，正文和 OCR 原文不会自动翻译。

## 当前范围

- 支持当前打开的小红书图文笔记。
- 优先读取页面结构化数据，失败时退回 DOM 提取。
- 支持 Markdown 预览、手动编辑、复制和下载。
- 支持可选的 PP-OCRv6 Small 浏览器本地 OCR。
- 暂不支持评论、批量采集、博主关键词搜索、图片文件导出和 Obsidian 写入。

小红书页面改版后，部分字段可能临时失效。遇到问题时请保留笔记链接，并说明缺少的是标题、正文、图片还是 OCR 文字。

## 本地开发

需要 Node.js 20 以上版本和 pnpm。

```bash
pnpm install
pnpm verify
```

构建结果在 `dist`。Chrome 116 及以上版本可直接加载该目录。

需要单独检查浏览器 OCR 时，运行 `pnpm dev`，再打开 `http://127.0.0.1:5173/tests/browser/ocr-smoke.html`。页面显示 `Passed` 代表中英混排识别、Worker 和本地 WASM 均正常。

核心模块分为 `SourceAdapter`、`OcrEngine` 和 `Exporter`。以后增加博主与关键词搜索、网页管理端或 Skill 入口时，可以继续复用相同的 `Note` 数据结构和 Markdown 导出逻辑。

OCR 使用 Apache-2.0 许可的 `@paddleocr/paddleocr-js`。本项目参考了 Obsidian Web Clipper、Bilibili Obsidian Clipper、ChatGPT Exporter、xiaohongshu-mcp 和 xiaohongshu-skills 的产品流程或数据结构，没有直接复制其业务代码。
