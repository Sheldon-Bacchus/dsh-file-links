# dsh-file-links

[English](README.md) | [简体中文](README.zh.md)

让 DeepSeek Harness 回复里的文件路径**可点击、可预览、可定位**——Windows 实测。

## 解决的问题

agent 在回复里提到文件路径时，那只是一段普通文本。想打开它，得自己跑去文件管理器里翻。`dsh-file-links` 把这些路径变成蓝色可点击链接，并附带右键菜单。

## 功能

- 🖱 **左键点击路径** → 用系统默认应用打开文件
- **右键 → 预览** → 在当前页面弹窗内直接查看内容（文本 / 图片）
- **右键 → 在文件夹中显示** → 打开文件管理器并选中该文件（*仅 Windows*）
- **右键 → 打开文件** → 等价于左键点击

## 为什么是它

| | |
|---|---|
| **Windows 优先** | 社区同类插件多在 macOS 上开发、Windows「预期可用」但未实测。本插件在 Windows 上实测通过，含中文路径、含空格路径。 |
| **复用官方打开链路** | 打开文件走官方 `openPath`（Windows 上为 `Invoke-Item`），常见场景不重造 shell 命令。 |
| **零运行时依赖** | 纯 Node 标准库 + 原生 DOM，不捆绑任何框架。 |
| **不打扰** | 只增强回复里已有的路径。无额外侧边栏、无臃肿的「提到的文件」列表。 |

## 安装

```sh
dsh plugin --profile web add github:wmglimpser-hash/dsh-file-links
```

然后重启 `dsh web` 并刷新浏览器。

> 这是一个标准 DSH bundle：挂载一个 host 半部分（两条 HTTP 路由）和一个 client 半部分（点击处理 + 右键菜单 + 预览面板）。

## 使用

回复里任何用反引号包裹的路径（如 `` `C:\project\README.md` ``）都会变成蓝色链接：

- **左键点击** 路径 → 打开文件
- **右键点击** 路径 → 弹出菜单（打开文件 / 预览 / 在文件夹中显示）

只有**绝对路径**可点击：Windows 盘符路径（`C:\...`、`C:/...`）、UNC 路径（`\\server\share\...`）、POSIX 绝对路径（`/home/...`）以及 `~/...`。相对路径和裸文件名保持普通文本——因为会话记录的是*启动*目录作为 cwd，而非 agent 实际工作目录，无法可靠解析。

## 工作原理

- **Host**（`lib/index.js`）：两条路由
  - `POST /api/file-links/reveal` → 在资源管理器中定位文件（`explorer /select,"路径"`；目录直接打开）
  - `POST /api/file-links/read` → 返回文件内容供预览（文本按 UTF-8、图片按 base64 data URI；上限 512 KB）
- **Client**（`lib/client.js`）：识别形如路径的 `<code>` 节点、渲染为链接、加右键菜单、渲染预览面板（纯 DOM，无框架）。
- **打开文件** 复用官方 `ctx.workspaces.openPath()`（Windows 上分发到 `Invoke-Item`）。

## 平台支持

| 平台 | 状态 |
|---|---|
| Windows | ✅ 实测（含中文 / 含空格路径） |
| macOS / Linux | ⚠️ 未实测——*打开* 与 *预览* 与平台无关；*在文件夹中显示* 依赖 `explorer`，仅 Windows 可用 |

## 已知限制

- **「在文件夹中显示」仅 Windows 可用。** `explorer /select,` 是 Windows shell 约定。macOS / Linux 上该菜单项不可用（打开、预览仍正常）。
- **预览是尽力而为。** 文本和常见图片类型可内联预览；PDF、Office 文档、二进制会拒绝并提示（请改用「打开」）。
- **仅绝对路径可点击。** 相对路径和裸文件名刻意保持普通文本（见「使用」）——点击它们会静默失败，因为会话 cwd 并非 agent 的工作目录。

## License

MIT
