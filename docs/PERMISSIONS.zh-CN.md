# 浏览器权限说明

XHS Clipper 只申请当前采集、OCR、导出和本机 Obsidian 写入功能所需的权限。

## Chrome 权限

| 权限 | 用途 |
|---|---|
| `activeTab` | 用户打开扩展弹窗后，访问当前小红书笔记页面。 |
| `scripting` | 在当前文章或用户选择的文章中运行提取脚本，读取结构化页面状态和可见内容。 |
| `storage` | 保存 OCR 设置、面板偏好、当前批量任务、最多 200 条完成记录和 Obsidian 配置。 |
| `offscreen` | 在隐藏的扩展页面中运行本地 OCR，避免任务依赖弹窗是否打开。 |
| `downloads` | 保存生成的 Markdown 文件。 |
| `clipboardWrite` | 将用户编辑后的 Markdown 复制到系统剪贴板。 |

## 网站访问范围

| 地址范围 | 用途 |
|---|---|
| `https://www.xiaohongshu.com/*` 和 `https://*.xiaohongshu.com/*` | 显示悬浮工作台，扫描当前页面已经加载的笔记卡片，并处理用户选择的文章。 |
| `https://*.xhscdn.com/*` | 将笔记图片读入内存，供可选 OCR 使用。 |
| `127.0.0.1` 和 `localhost` 的 HTTP、HTTPS 地址 | 测试并使用用户本机的 Obsidian REST API。 |

悬浮工作台的内容脚本只在小红书页面运行，不会进入其他网站。扫描和批量处理仍需要用户主动操作，每批最多处理 20 篇已选择的文章。

## 扩展页面策略

`onnxruntime-web` 需要通过 WebAssembly 运行内置 OCR 模型，因此扩展自己的页面允许 WebAssembly 执行。内容安全策略不允许加载远程脚本。
