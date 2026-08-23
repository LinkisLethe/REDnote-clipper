[简体中文](README.zh-CN.md) | [English](README.md)

<p align="center">
  <img src="docs/images/xhs-clipper-logo.png" alt="XHS Clipper Logo" width="128" />
</p>

<h1 align="center">XHS Clipper</h1>

<p align="center">把一篇或多篇小红书图文笔记整理成可编辑的纯文本 Markdown。</p>

<p align="center">
  <a href="https://www.google.com/chrome/"><img src="https://img.shields.io/badge/Chrome-116%2B-4285F4?logo=googlechrome&amp;logoColor=white&amp;style=flat-square" alt="Chrome 116+" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&amp;logoColor=white&amp;style=flat-square" alt="TypeScript 7.x" /></a>
  <a href="https://github.com/PaddlePaddle/PaddleOCR"><img src="https://img.shields.io/badge/OCR-PP--OCRv6-0C7BDC?style=flat-square" alt="PP-OCRv6" /></a>
  <a href="https://github.com/LinkisLethe/xhs-clipper/releases/latest"><img src="https://img.shields.io/badge/version-1.0.0-D8473E?style=flat-square" alt="版本 1.0.0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-7B68EE?style=flat-square" alt="Apache 2.0 许可证" /></a>
</p>

XHS Clipper 是一个把小红书图文笔记保存为可编辑 Markdown 的 Chrome 扩展。单篇笔记可以从扩展弹窗剪藏；在首页、搜索结果、博主主页和文章页，也可以通过悬浮工作台筛选并处理一小批笔记。OCR 在 Chrome 本地运行，结果可以下载为 `.md` 文件，或者直接写入本机 Obsidian 仓库。

<p align="center">
  <img
    src="docs/images/workflow-redacted.png"
    alt="在小红书页面中使用 XHS Clipper"
    width="1000"
  />
</p>

## 主要功能

- 采集标题、正文、作者、标签、发布时间、互动数量、来源链接和图片顺序。
- 扫描当前页面已经加载的笔记卡片，按标题关键词筛选，单批最多选择 20 篇。
- 可选本地 OCR，支持全部图片、跳过封面和自定义页码。
- 查看每篇笔记的处理阶段和剩余时间，也可以在当前篇完成后停止任务。
- 修正常见的中英文空格、错误换行、段落断裂和完全重复的 OCR 内容。
- 在下载前预览并编辑 Markdown。
- 下载 `.md` 文件，或通过本机 REST API 写入 Obsidian。
- 遇到 Obsidian 重复笔记时，可以跳过、另存为新版本或覆盖同一来源的原笔记。
- 在当前 Chrome 配置中记住 OCR、导出位置、设置分区和浮窗收起状态。
- 界面跟随 Chrome 的显示语言：`zh_CN` 显示简体中文，`zh_TW` 显示繁体中文，香港及其他语言显示英文。

OCR 使用内置 PP-OCRv6 Tiny 模型。图片和识别结果不会发送给远程 OCR 服务。

## 安装

### 直接安装

1. 打开 [Releases](https://github.com/LinkisLethe/xhs-clipper/releases/latest)，在 Assets 中下载 `xhs-clipper-v1.0.0.zip`。不要下载 GitHub 自动生成的 `Source code`。
2. 解压 ZIP，得到 `xhs-clipper-v1.0.0` 文件夹。Chrome 不能直接加载压缩包。
3. 在 Chrome 地址栏输入 `chrome://extensions/`，打开右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”，直接选择解压后的 `xhs-clipper-v1.0.0` 文件夹。

直接安装不需要 Node.js 或 pnpm。安装完成后，把 XHS Clipper 固定到浏览器工具栏，并刷新安装前已经打开的小红书页面。

升级已解压安装的旧版时，可以把新文件覆盖到 Chrome 当前加载的目录，再点击扩展卡片上的“重新加载”。这样可以保留扩展 ID 和本地设置。如果直接加载新的版本文件夹，请先停用或移除旧版，避免页面出现两个悬浮工作台。

### 从源码构建

从源码构建需要 Node.js 20 或更高版本，以及 pnpm。

```bash
pnpm install
pnpm verify
```

构建结果位于 `dist` 文件夹。在 `chrome://extensions/` 中加载该文件夹即可。

## 批量剪藏工作台

小红书首页、搜索结果、博主主页和文章页都会显示悬浮工作台。点击“扫描当前页”后，插件只读取这个标签页已经加载的笔记卡片。想加载更多内容时，可以先向下滚动，再重新扫描。页面路由切换后，旧结果会被清空。

关键词之间用空格分隔，标题需要同时包含全部关键词才会进入结果。你可以逐篇勾选，也可以选择前 20 篇。确认 OCR 和导出位置后，XHS Clipper 会用非活动标签页逐篇打开、处理并关闭所选文章。

面板会显示当前阶段、已用时间、预计剩余时间和每篇结果。点击停止后，插件会先完成当前文章，再取消后面的任务。点击列表中的文章标题，可以直接进入对应文章。

自动访问仍可能触发平台限流或账号验证。建议控制批量大小，避免短时间反复运行；遇到登录验证或验证码时立即停止。

## 单篇采集和 OCR

采集器打开后会先读取笔记正文和元数据。打开“识别图片文字”后，可以选择识别范围，再点击“开始识别”或“重新识别”。

<p align="center">
  <img
    src="docs/images/popup-overview.png"
    alt="OCR 范围、进度和 Markdown 预览"
    width="520"
  />
</p>

第一次 OCR 会初始化本地 ONNX 运行库。后续任务会复用已经加载的引擎。长图会先分块，再按原图顺序合并结果；单张图片失败不会中断其余图片。

后处理只修复排版，不改写原文。你也可以直接修改预览框里的内容，然后复制、下载或写入 Obsidian。

## 写入 Obsidian

直接写入依赖 Obsidian 社区插件 [Local REST API with MCP](https://github.com/coddingtonbear/obsidian-local-rest-api)。写入时需要保持 Obsidian 打开。

### 1. 获取本机 API 地址和 Key

1. 在 Obsidian 打开“设置 > 第三方插件 > 浏览”。
2. 安装并启用 Local REST API with MCP。
3. 打开该插件的设置，启用非加密 HTTP 服务。
4. 复制 `Non-encrypted (HTTP) API URL` 和 API Key。

<details>
<summary>查看 Obsidian 插件设置示例</summary>

![Obsidian Local REST API 地址与 API Key 位置](docs/images/obsidian-local-rest-api.png)

</details>

### 2. 配置 XHS Clipper

1. 点击采集器右上角的齿轮按钮，或者点击悬浮工作台中的“配置 Obsidian 权限和导出路径”。
2. 确认共用导出目录 `Clippings/XHS`。
3. 填写本机 API 地址。默认值是 `http://127.0.0.1:27123`。
4. 粘贴 API Key，保存设置，再点击“测试连接”。

<p align="center">
  <img
    src="docs/images/obsidian-settings.png"
    alt="XHS Clipper 的 Obsidian 写入设置"
    width="550"
  />
</p>

API Key 只保存在当前 Chrome 配置的扩展存储中。XHS Clipper 只接受 `127.0.0.1` 或 `localhost` 地址。不要在截图、Issue 或日志中公开 API Key。

## Markdown 内容

导出的文件包含 YAML Frontmatter、笔记正文，以及按图片顺序排列的 OCR 文字。默认文件名是 `标题_作者_日期.md`。项目只导出纯文本，不下载或嵌入原始图片。

```markdown
---
title: "示例笔记"
source: "https://www.xiaohongshu.com/explore/example"
platform: "xiaohongshu"
author: "示例作者"
ocr: true
---

# 示例笔记

## 正文

笔记正文……

## 图片文字

### 图片 1

识别结果……
```

## 使用边界

XHS Clipper 是独立开发的非官方项目，与小红书没有隶属、认可或赞助关系。小红书及相关名称和标识归其权利人所有。

请只处理你有权访问和使用的内容，并自行遵守适用法律、版权规则和平台条款。未经许可，不要用本项目转载、出售或传播他人的内容。

## 本地开发

```bash
pnpm test
pnpm build
pnpm verify
pnpm benchmark:job
pnpm benchmark:ocr
```

OCR 浏览器基准会自动完成构建、启动临时服务器、运行 Chrome 和关闭服务器，基准资源不会进入扩展安装包。如果 Chrome 不在系统默认路径，可通过 `CHROME_PATH` 指定。测试轮数可由 `OCR_BENCHMARK_ITERATIONS` 和 `OCR_BENCHMARK_WARMUP` 调整。

代码按页面提取、OCR、文字后处理、Markdown 导出和 Obsidian 写入拆分。以后增加搜索或 Skill 入口时，可以继续使用现有 `Note` 数据结构。

OCR 使用 Apache-2.0 许可的 PP-OCRv6 Tiny 模型和 MIT 许可的 `onnxruntime-web`。图片预处理与结果解码参考 PaddleOCR.js 的公开行为，并用 Canvas 和 TypeScript 替代 OpenCV。项目参考了 Obsidian Web Clipper、Bilibili Obsidian Clipper、ChatGPT Exporter、xiaohongshu-mcp 和 xiaohongshu-skills 的产品流程或数据结构，没有直接复制这些项目的业务代码。

XHS Clipper 采用 [Apache License 2.0](LICENSE)。模型、运行库和署名信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，版本记录见 [CHANGELOG.md](CHANGELOG.md)。
