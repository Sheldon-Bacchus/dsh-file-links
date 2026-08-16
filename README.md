# dsh-file-links

[English](README.md) | [简体中文](README.zh.md)

Make file paths in DeepSeek Harness replies **clickable, previewable, and revealable** — tested on Windows.

## The problem

When an agent mentions a file path in its reply, that path is just plain text. To open it you have to find it yourself in a file manager. `dsh-file-links` turns those paths into blue clickable links with a context menu.

## Features

- 🖱 **Click a path** → open the file with the system default application
- **Right-click → Preview** → view the file content inline in a panel (text / image)
- **Right-click → Reveal in Explorer** → open the file manager with the file selected *(Windows)*
- **Right-click → Open** → same as clicking the path

## Why this one

| | |
|---|---|
| **Windows-first** | Most community plugins were built and tested on macOS; Windows was "expected to work". This plugin is tested on Windows, including paths with Chinese characters and spaces. |
| **Reuses the official opener** | Opening files goes through the official `openPath` (`Invoke-Item` on Windows) — no reinvented shell commands for the common case. |
| **Zero runtime dependencies** | Pure Node built-ins + native DOM. No bundled framework. |
| **Unobtrusive** | Only enhances paths already in the reply. No extra sidebar, no noisy "mentioned files" list. |

## Install

```sh
dsh plugin --profile web add github:wmglimpser-hash/dsh-file-links
```

Then restart `dsh web` and refresh the browser.

> The plugin is a standard DSH bundle: it mounts a host half (two HTTP routes) and a client half (click handling + context menu + preview panel).

## Usage

Any path wrapped in backticks in a reply (e.g. `` `C:\project\README.md` ``) becomes a blue link:

- **Left-click** the path → opens the file
- **Right-click** the path → context menu with *Open file* / *Preview* / *Reveal in Explorer*

Only **absolute paths** are clickable: Windows drive paths (`C:\...`, `C:/...`), UNC paths (`\\server\share\...`), POSIX absolute paths (`/home/...`), and `~/...`. Relative paths and bare filenames stay plain text — they cannot be resolved reliably because the session records the *launch* directory as its cwd, not the agent's actual working directory.

## How it works

- **Host** (`lib/index.js`): two routes
  - `POST /api/file-links/reveal` → reveals the file in Explorer (`explorer /select,"path"`; directories open themselves)
  - `POST /api/file-links/read` → returns file content for inline preview (text as UTF-8, images as base64 data URIs; 512 KB cap)
- **Client** (`lib/client.js`): recognizes path-like `<code>` nodes, styles them as links, adds a right-click context menu, and renders the preview panel (pure DOM, no framework).
- **Opening** reuses the official `ctx.workspaces.openPath()` (which dispatches `Invoke-Item` on Windows).

## Platform support

| Platform | Status |
|---|---|
| Windows | ✅ Tested (including Chinese / space-containing paths) |
| macOS / Linux | ⚠️ Not tested — the *open* and *preview* paths are platform-neutral; *reveal* uses `explorer` and is Windows-only |

## Known limitations

- **Reveal is Windows-only.** The `explorer /select,` command is a Windows shell convention. On macOS/Linux the "Reveal in Explorer" menu item will not work (open and preview still do).
- **Preview is best-effort.** Text and common image types preview inline; PDFs, Office documents, and binaries are refused with a message (use "Open" instead).
- **Only absolute paths are clickable.** Relative paths and bare filenames are intentionally left as plain text (see Usage) — clicking them would silently fail because the session cwd is not the agent's working directory.

## License

MIT
