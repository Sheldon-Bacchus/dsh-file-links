/**
 * dsh-file-links — Host side.
 *
 * Provides two routes:
 *   - POST /api/file-links/reveal  { path }        -> reveal in Explorer (explorer /select,)
 *   - POST /api/file-links/read    { path }        -> read file content for inline preview
 *
 * Opening a file (default app) is NOT a route here: the client reuses the
 * official `ctx.workspaces.openPath()` (which dispatches `Invoke-Item` on
 * Windows), so this host half only adds what the official surface lacks.
 */
import { existsSync, statSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { homedir } from 'node:os'
import { exec } from 'node:child_process'

export const name = 'dsh-file-links'
export const inject = ['webServer', 'systemPrompt']

/** Text extensions previewed inline; images returned as base64 data URIs. */
const TEXT_EXTS = new Set([
  '.md', '.markdown', '.txt', '.text', '.json', '.js', '.jsx', '.ts', '.tsx',
  '.py', '.yaml', '.yml', '.toml', '.css', '.html', '.xml', '.csv', '.log',
  '.sh', '.bash', '.ini', '.conf', '.cfg', '.sql', '.env', '.lock',
])
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
const MAX_PREVIEW_BYTES = 512 * 1024 // 512 KB cap for inline preview

export function apply(ctx) {
  const webServer = ctx.webServer
  if (webServer === undefined) return

  // Prompt guidance: reference key files by ABSOLUTE path so they become
  // clickable. Relative paths cannot be resolved reliably (the session cwd is
  // the launch directory, not the agent's actual working directory).
  if (ctx.systemPrompt && typeof ctx.systemPrompt.section === 'function') {
    ctx.systemPrompt.section({
      name: 'dsh-file-links:absolute-paths',
      order: 110,
      text: 'When you mention a file the user may want to open, prefer the absolute path (e.g. `E:\\project\\README.md`) over a relative path or bare filename. Only absolute paths become clickable links in the Web UI.',
    })
  }

  // Reveal in Explorer: a file selects itself in its folder; a directory opens.
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/api/file-links/reveal',
    handler: async (req, res) => {
      try {
        const body = await readBody(req)
        const path = body && typeof body.path === 'string' && body.path !== '' ? body.path : null
        if (path === null) { writeJson(res, 400, { ok: false, error: 'missing path' }); return }
        const abs = absolutize(path)
        if (!existsSync(abs)) { writeJson(res, 404, { ok: false, error: 'not found: ' + path }); return }
        const isDir = statSync(abs).isDirectory()
        // Verified: `explorer.exe /select,"path"` (comma immediately followed by
        // the QUOTED path, run through the shell so the quotes are interpreted)
        // opens the folder and selects the file. A directory opens itself.
        const cmd = isDir
          ? 'explorer.exe "' + abs + '"'
          : 'explorer.exe /select,"' + abs + '"'
        await runExplorer(cmd)
        writeJson(res, 200, { ok: true })
      } catch (error) {
        writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'file-links: reveal route')

  // Read for inline preview: text -> { kind:'text', content }; image -> data URI.
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/api/file-links/read',
    handler: async (req, res) => {
      try {
        const body = await readBody(req)
        const path = body && typeof body.path === 'string' && body.path !== '' ? body.path : null
        if (path === null) { writeJson(res, 400, { ok: false, error: 'missing path' }); return }
        const abs = absolutize(path)
        if (!existsSync(abs)) { writeJson(res, 404, { ok: false, error: 'not found: ' + path }); return }
        if (statSync(abs).isDirectory()) { writeJson(res, 400, { ok: false, error: 'is a directory: ' + path }); return }
        const size = statSync(abs).size
        if (size > MAX_PREVIEW_BYTES) {
          writeJson(res, 413, { ok: false, error: 'too large to preview (' + size + ' bytes > ' + MAX_PREVIEW_BYTES + ')' })
          return
        }
        const ext = extname(abs).toLowerCase()
        if (IMAGE_EXTS.has(ext)) {
          const buf = readFileSync(abs)
          const mime = ext === '.svg' ? 'image/svg+xml' : 'image/' + ext.slice(1)
          writeJson(res, 200, { ok: true, kind: 'image', mime, data: 'data:' + mime + ';base64,' + buf.toString('base64') })
          return
        }
        if (TEXT_EXTS.has(ext) || ext === '') {
          const content = readFileSync(abs, 'utf8')
          writeJson(res, 200, { ok: true, kind: 'text', content })
          return
        }
        writeJson(res, 415, { ok: false, error: 'unsupported type for preview: ' + ext })
      } catch (error) {
        writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'file-links: read route')
}

function absolutize(p) {
  if (p.startsWith('~/')) return homedir() + p.slice(1)
  return p
}

function runExplorer(commandLine) {
  return new Promise((resolveRun, rejectRun) => {
    // `explorer` returns a non-zero exit code even on success (it forwards to an
    // already-running instance and exits), so only a spawn error is a real
    // failure — a non-zero exit code is ignored. exec runs through the shell so
    // the quotes in `/select,"path with space"` are interpreted correctly.
    exec(commandLine, { timeout: 10000, windowsHide: true }, (error) => {
      if (error && error.code === 'ENOENT') rejectRun(error)
      else resolveRun()
    })
  })
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolveBody(text === '' ? {} : JSON.parse(text))
      } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
