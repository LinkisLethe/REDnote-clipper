# XHS Clipper

[![Chrome 116+](https://img.shields.io/badge/Chrome-116%2B-4285F4?logo=googlechrome&logoColor=white&style=flat-square)](https://www.google.com/chrome/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![OCR](https://img.shields.io/badge/OCR-PP--OCRv6-0C7BDC?style=flat-square)](https://github.com/PaddlePaddle/PaddleOCR)
[![Version](https://img.shields.io/badge/version-0.4.0-D8473E?style=flat-square)](https://github.com/LinkisLethe/xhs-clipper)
[![License](https://img.shields.io/badge/license-Apache--2.0-7B68EE?style=flat-square)](LICENSE)

[English](README.md)

XHS Clipper 是一个 Chrome Manifest V3 扩展。打开一篇小红书图文笔记后，它可以读取页面内容，将指定图片交给浏览器本地 OCR，再生成可编辑的纯文本 Markdown。结果既能下载，也能直接写入本机 Obsidian 仓库。

## 主要功能

- 采集当前笔记的标题、正文、作者、标签、发布时间、互动数据、来源链接和图片顺序。
- 优先读取页面结构化数据，失败时退回可见 DOM 内容。
- 在浏览器本地运行内置 PP-OCRv6 Tiny，不把图片或 OCR 文字发送给远程识别服务。
- 支持全部图片、跳过封面和自定义页码三种识别范围。
- 修复常见中英文空格、错误换行、段落结构和重复 OCR 内容。
- 支持 Markdown 预览、手动编辑、复制、下载和写入 Obsidian。
- 写入前检查 Obsidian 同名笔记，覆盖时必须确认。
- 提供简体中文和英文界面，默认跟随 Chrome 的显示语言。

## 从源码安装

需要 Node.js 20 以上版本和 pnpm。

```bash
pnpm install
pnpm verify
```

构建结果位于 `dist`。

1. 打开 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目的 `dist` 文件夹。
5. 打开一篇小红书图文笔记，再点击扩展图标。

## OCR 使用方式

OCR 可以随时关闭。扩展内置约 6 MB 的 PP-OCRv6 Tiny 模型，正常使用时不需要下载模型。第一次识别会初始化本地 ONNX 运行库，后续任务会复用已经加载的引擎。进度卡会显示初始化、逐图识别、文字汇总、已用时间和预计剩余时间。

长图会先分块，再按原图顺序合并。单张图片失败不会中断剩余图片。后处理只修复排版和完全重复的内容，不会改写作者原文。

## 写入 Obsidian

直接写入依赖 Obsidian 社区插件 [Local REST API with MCP](https://github.com/coddingtonbear/obsidian-local-rest-api)。

1. 在 Obsidian 中安装并启用该插件。
2. 在插件设置里启用非加密 HTTP 服务。
3. 点击 XHS Clipper 右上角的齿轮按钮。
4. 填写笔记目录、本地 API 地址和 API Key。
5. 保存设置并测试连接。

默认目录为 `Clippings/Xiaohongshu`，默认地址为 `http://127.0.0.1:27123`。API Key 只保存在本机扩展存储中，插件只允许连接本机回环地址。

## Markdown 内容

文件包含固定结构的 YAML Frontmatter、笔记正文和按图片顺序排列的 OCR 文字。文件名格式为 `标题_作者_日期.md`。图片不会嵌入 Markdown，也不会作为文件下载。

## 当前范围

XHS Clipper 每次只处理用户当前打开的一篇小红书图文笔记。目前不采集评论，不搜索博主，不批量采集账号内容，不发布或互动，不下载图片文件，也不使用云端数据库。

数据处理方式见[隐私说明](docs/PRIVACY.zh-CN.md)，浏览器权限用途见[权限说明](docs/PERMISSIONS.zh-CN.md)。

## 使用边界

XHS Clipper 是独立开发的非官方项目，与小红书不存在隶属、认可或赞助关系。小红书及相关名称和标识归其权利人所有。

请只处理你有权访问和使用的内容，并自行遵守适用法律、版权规则和平台条款。未经许可，不要用本项目转载、出售或传播他人的内容。

## 本地开发

```bash
pnpm test
pnpm build
pnpm verify
```

代码按页面提取、OCR、文字后处理、Markdown 导出和 Obsidian 写入拆分。以后增加搜索或 Skill 入口时，可以继续使用现有 `Note` 数据结构，不需要改动导出模块。

OCR 使用 Apache-2.0 许可的 PP-OCRv6 Tiny 模型和 MIT 许可的 `onnxruntime-web`。图片预处理与结果解码参考 PaddleOCR.js 的公开行为，并用 Canvas 和 TypeScript 替代 OpenCV。项目参考了 Obsidian Web Clipper、Bilibili Obsidian Clipper、ChatGPT Exporter、xiaohongshu-mcp 和 xiaohongshu-skills 的产品流程或数据结构，没有直接复制这些项目的业务代码。

XHS Clipper 采用 [Apache License 2.0](LICENSE)。模型、运行库和署名信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，版本记录见 [CHANGELOG.md](CHANGELOG.md)。
