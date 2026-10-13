window.__ModuleLoader__.load({
  id: "dsh-file-links",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const inject = ["sessions", "workspaces", "remote", "remote.session"];

    function apply(ctx) {
      // Use ctx.get(name) exclusively: it is an optional lookup that returns
      // undefined instead of throwing "without inject".
      const sessionsSvc = ctx.get("sessions");
      const workspaces = ctx.get("workspaces");

      // ---- session cwd + relative path resolution ----
      function cwdOf(id) {
        try {
          const snap = sessionsSvc && sessionsSvc.list ? sessionsSvc.list.getSnapshot() : null;
          const s = snap && snap.byId ? snap.byId[id] : null;
          return s && typeof s.cwd === "string" && s.cwd !== "" ? s.cwd : null;
        } catch { return null; }
      }
      function resolveAbs(path, id) {
        // Strip wrapping backticks and whitespace that Markdown rendering may
        // leave inside a <code> node (e.g. `E:\x` -> E:\x), then resolve.
        const cleaned = String(path ?? "").replace(/^[`\s]+/, "").replace(/[`\s]+$/, "").trim();
        if (cleaned === "") return path;
        if (cleaned.startsWith("~/")) return cleaned;
        if (cleaned.startsWith("/") || /^[A-Za-z]:[/\\]/.test(cleaned) || cleaned.startsWith("\\\\")) return cleaned;
        const cwd = cwdOf(id);
        if (cwd === null) return cleaned;
        // Join with a backslash on Windows so `Invoke-Item` parses the path;
        // a mixed `\` + `/` path is rejected by PowerShell.
        return cwd.replace(/[/\\]+$/, "") + "\\" + cleaned.replace(/^[/\\]+/, "");
      }
      // Resolve the currently-viewed session id from the sessions snapshot.
      function currentId() {
        try {
          const snap = sessionsSvc && sessionsSvc.list ? sessionsSvc.list.getSnapshot() : null;
          return snap && typeof snap.current === "string" ? snap.current : null;
        } catch { return null; }
      }

      // ---- open file via official Invoke-Item path ----
      async function openFile(path, id) {
        try {
          const abs = resolveAbs(path, id);
          const remote = ctx.get("remote");
          if (remote && remote.session && typeof remote.session.openWorkspacePath === "function") {
            const result = await remote.session.openWorkspacePath({ path: abs });
            if (!result || result.ok !== true) throw new Error("DSH 未能打开文件");
            return;
          }
          if (workspaces && typeof workspaces.openPath === "function") {
            await workspaces.openPath(abs);
            return;
          }
          throw new Error("当前 DSH 未提供文件打开接口");
        } catch (error) { window.alert("打开文件失败：" + String(error)); }
      }

      // ---- reveal in Explorer: select the file (host route uses /select,"path") ----
      async function reveal(path, id) {
        try {
          await fetch("/api/file-links/reveal", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ path: resolveAbs(path, id) }),
            cache: "no-store",
          });
        } catch { /* ignore */ }
      }

      // ---- preview panel (pure DOM, fixed overlay) ----
      let panel = null;
      function closePanel() {
        if (panel) { panel.remove(); panel = null; }
      }
      function preview(path, id) {
        closePanel();
        const abs = resolveAbs(path, id);
        const overlay = document.createElement("div");
        overlay.setAttribute("data-fm-preview", "1");
        overlay.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;cursor:default;";
        overlay.addEventListener("click", (e) => { if (e.target === overlay) closePanel(); });

        const box = document.createElement("div");
        box.style.cssText = "background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,0.12));border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.35);width:min(880px,92vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;";

        const head = document.createElement("div");
        head.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,0.12));flex:none;";
        const title = document.createElement("span");
        title.textContent = abs;
        title.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:13px/20px monospace;color:var(--dsw-alias-label-primary,#222);";
        const openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.textContent = "打开";
        openBtn.style.cssText = "cursor:pointer;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,0.12));background:transparent;border-radius:6px;padding:3px 10px;font-size:12px;color:var(--dsw-alias-label-secondary,#555);";
        openBtn.addEventListener("click", () => openFile(path, id));
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.textContent = "✕";
        closeBtn.setAttribute("aria-label", "关闭");
        closeBtn.style.cssText = "cursor:pointer;border:none;background:transparent;border-radius:6px;padding:3px 8px;font-size:14px;color:var(--dsw-alias-label-secondary,#555);";
        closeBtn.addEventListener("click", closePanel);
        head.appendChild(title);
        head.appendChild(openBtn);
        head.appendChild(closeBtn);

        const body = document.createElement("div");
        body.style.cssText = "flex:1;overflow:auto;padding:14px;";
        body.textContent = "加载中…";
        box.appendChild(head);
        box.appendChild(body);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        panel = overlay;

        fetch("/api/file-links/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: abs }),
          cache: "no-store",
        }).then((r) => r.json()).then((data) => {
          if (!panel) return;
          body.textContent = "";
          if (!data || data.ok !== true) {
            const err = document.createElement("div");
            err.textContent = data && data.error ? data.error : "无法预览";
            err.style.cssText = "color:var(--dsw-alias-state-error-primary,#c0392b);font:13px/20px sans-serif;";
            body.appendChild(err);
            return;
          }
          if (data.kind === "image") {
            const img = document.createElement("img");
            img.src = data.data;
            img.style.cssText = "max-width:100%;height:auto;border-radius:8px;display:block;margin:0 auto;";
            body.appendChild(img);
          } else {
            const pre = document.createElement("pre");
            pre.textContent = data.content;
            pre.style.cssText = "margin:0;font:12px/1.6 monospace;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary,#222);";
            body.appendChild(pre);
          }
        }).catch((e) => {
          if (!panel) return;
          body.textContent = "加载失败：" + String(e);
        });
      }

      // ---- path recognition ----
      // Only ABSOLUTE paths become clickable. Relative paths / bare filenames
      // cannot be resolved reliably (the session cwd is the launch directory,
      // not the agent's actual working directory), so they stay plain text
      // instead of becoming misleading blue links.
      const cleanText = (t) => String(t ?? "").replace(/^[`\s]+/, "").replace(/[`\s]+$/, "").trim();
      function isAbsolutePath(t) {
        if (t === "" || t.length > 300 || /^https?:\/\//i.test(t)) return false;
        if (t.startsWith("~/")) return true;
        if (t.startsWith("/") || /^[A-Za-z]:[/\\]/.test(t) || t.startsWith("\\\\")) return true;
        return false;
      }

      // ---- style: blue clickable file path (official link look) + context menu ----
      const STYLE_ID = "dsh-file-links-style";
      function ensureStyle() {
        if (document.getElementById(STYLE_ID) !== null) return;
        const st = document.createElement("style");
        st.id = STYLE_ID;
        st.textContent = [
          "code.dsh-file-link {",
          "  color: var(--dsw-alias-link, #2f6fed);",
          "  cursor: pointer;",
          "}",
          "code.dsh-file-link:hover { text-decoration: underline; }",
          ".dsh-fl-menu {",
          "  position: fixed; z-index: 100001;",
          "  background: var(--dsw-alias-bg-layer-1, #fff);",
          "  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12));",
          "  border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.18);",
          "  padding: 4px; min-width: 160px;",
          "  font: 13px/28px sans-serif;",
          "}",
          ".dsh-fl-menu-item {",
          "  display: block; width: 100%; text-align: left;",
          "  border: none; background: transparent;",
          "  color: var(--dsw-alias-label-primary, #222);",
          "  cursor: pointer; border-radius: 5px; padding: 0 10px;",
          "  font: inherit;",
          "}",
          ".dsh-fl-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.06)); }",
        ].join("\n");
        document.head.appendChild(st);
      }

      let menu = null;
      function closeMenu() {
        if (menu) { menu.remove(); menu = null; }
      }
      function showContextMenu(x, y, path) {
        closeMenu();
        ensureStyle();
        const el = document.createElement("div");
        el.className = "dsh-fl-menu";
        el.style.left = x + "px";
        el.style.top = y + "px";
        const items = [
          { label: "打开文件", action: () => openFile(path, currentId()) },
          { label: "预览", action: () => preview(path, currentId()) },
          { label: "在文件夹中显示", action: () => reveal(path, currentId()) },
        ];
        for (const it of items) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "dsh-fl-menu-item";
          btn.textContent = it.label;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeMenu();
            // Defer the action so the click fully settles before opening the
            // file/folder; prevents the explorer window from stealing the
            // browser's event-loop attention mid-click.
            setTimeout(() => { it.action(); }, 30);
          });
          el.appendChild(btn);
        }
        document.body.appendChild(el);
        menu = el;
      }

      function onDocumentClick(event) {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        // Any click outside the open menu closes it (persistent, not once).
        if (menu !== null) {
          const t = event.target;
          if (t && t.nodeType === 1 && !t.closest(".dsh-fl-menu")) closeMenu();
        }
        const target = event.target;
        if (target === null || target.nodeType !== 1) return;
        if (target.closest("[data-fm-preview]") || target.closest(".dsh-fl-menu")) return;
        if (target.closest("button") !== null || target.closest("pre") !== null) return;
        const code = target.closest("code");
        if (code === null) return;
        const text = cleanText(code.textContent);
        if (!isAbsolutePath(text)) return;
        event.preventDefault();
        event.stopPropagation();
        openFile(text, currentId());
      }
      function onDocumentContextMenu(event) {
        const target = event.target;
        if (target === null || target.nodeType !== 1) return;
        if (target.closest("[data-fm-preview]") || target.closest(".dsh-fl-menu")) return;
        if (target.closest("pre") !== null) return;
        const code = target.closest("code");
        if (code === null) return;
        const text = cleanText(code.textContent);
        if (!isAbsolutePath(text)) return;
        event.preventDefault();
        event.stopPropagation();
        showContextMenu(event.clientX, event.clientY, text);
      }

      ctx.effect(() => {
        ensureStyle();
        document.addEventListener("click", onDocumentClick, true);
        document.addEventListener("contextmenu", onDocumentContextMenu);
        return () => {
          document.removeEventListener("click", onDocumentClick, true);
          document.removeEventListener("contextmenu", onDocumentContextMenu);
        };
      }, "file-links: click + context menu");

      // ---- mark path-like <code> as blue clickable links ----
      function processPathCodes() {
        const nodes = document.querySelectorAll("code");
        for (const code of nodes) {
          if (code.dataset.flDone === "1") continue;
          if (code.closest("button") !== null || code.closest("pre") !== null) continue;
          const text = cleanText(code.textContent);
          if (!isAbsolutePath(text)) continue;
          code.dataset.flDone = "1";
          code.classList.add("dsh-file-link");
          code.title = resolveAbs(text, currentId()) + " — 点击打开 · 右键更多操作";
        }
      }
      ctx.effect(() => {
        const observer = new MutationObserver(() => { processPathCodes(); });
        observer.observe(document.body, { childList: true, subtree: true });
        processPathCodes();
        return () => observer.disconnect();
      }, "file-links: mark path codes as links");
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
