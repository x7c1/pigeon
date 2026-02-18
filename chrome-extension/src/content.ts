// content.ts - Extract file path, line numbers, and selected text from GitHub PR diff pages

(() => {
  console.log("pigeon: content.ts loaded");

  interface LineInfo {
    line: number;
    side: "old" | "new";
  }

  interface PrInfo {
    owner: string;
    repo: string;
    number: string;
  }

  interface SelectionContext {
    file: string;
    startLine: number | null;
    endLine: number | null;
    side: string | null;
    code: string;
    pr: PrInfo | null;
    url: string;
  }

  interface SelectionResult {
    context: SelectionContext;
    startElement: Element;
  }

  interface DebugStrategy {
    strategy: number | string;
    found: string | null;
    [key: string]: unknown;
  }

  interface ListSessionsResponse {
    ok: boolean;
    sessions?: string[];
    error?: string;
  }

  interface SendResponse {
    ok: boolean;
    error?: string;
  }

  // Extract file path from a table's aria-label (React UI)
  // e.g. "Diff for: path/to/file.ts"
  // e.g. "Diff for: old/path.ts renamed to new/path.ts"
  function parseAriaLabel(table: Element | null): string | null {
    const ariaLabel = table?.getAttribute("aria-label");
    if (!ariaLabel?.startsWith("Diff for: ")) return null;
    const pathPart = ariaLabel.slice("Diff for: ".length);
    const idx = pathPart.indexOf(" renamed to ");
    return idx >= 0 ? pathPart.slice(idx + " renamed to ".length) : pathPart;
  }

  // Find the closest diff container from the selection and extract file path.
  // When debugTrace is provided, each strategy records what it tried and found.
  function findFilePath(
    element: Element,
    debugTrace?: DebugStrategy[],
  ): string | null {
    // Strategy 1: data-tagsearch-path / data-path on an ancestor (classic UI)
    const pathAncestor = element.closest("[data-tagsearch-path], [data-path]");
    if (pathAncestor) {
      const path =
        pathAncestor.getAttribute("data-tagsearch-path") ||
        pathAncestor.getAttribute("data-path");
      if (path) {
        debugTrace?.push({ strategy: 1, found: path });
        return path;
      }
    }
    debugTrace?.push({ strategy: 1, found: null });

    // Strategy 2: aria-label on the diff table (React UI)
    const table = element.closest("table[data-diff-anchor]");
    const ariaPath = parseAriaLabel(table);
    if (ariaPath) {
      debugTrace?.push({ strategy: 2, found: ariaPath });
      return ariaPath;
    }
    debugTrace?.push({
      strategy: 2,
      found: null,
      tableAriaLabel: table?.getAttribute("aria-label") ?? null,
    });

    // Strategy 3: Find the diff container and search within it
    const diffContainer = table
      ? table.closest('[id^="diff-"]') || table.parentElement
      : element.closest('[id^="diff-"]');
    if (!diffContainer) {
      debugTrace?.push({
        strategy: 3,
        found: null,
        reason: "no diffContainer",
      });
      return null;
    }

    const linkWithCode = diffContainer.querySelector(
      'a.Link--primary code, a[href*="#diff-"] code',
    );
    if (linkWithCode) {
      const path = linkWithCode.textContent
        ?.replace(/\u200E|\u200F|\u200B|\u200C|\u200D|\uFEFF/g, "")
        .trim();
      if (path) {
        debugTrace?.push({ strategy: "3-link-code", found: path });
        return path;
      }
    }

    const link = diffContainer.querySelector(
      'a[title][href*="#diff-"], a.Link--primary[title]',
    );
    if (link) {
      const title = link.getAttribute("title");
      if (title && (title.includes("/") || title.includes("."))) {
        debugTrace?.push({ strategy: "3-title", found: title });
        return title;
      }
    }

    const copyBtn = diffContainer.querySelector("clipboard-copy[value]");
    if (copyBtn) {
      const val = copyBtn.getAttribute("value");
      if (val && (val.includes("/") || val.includes("."))) {
        debugTrace?.push({ strategy: "3-clipboard", found: val });
        return val;
      }
    }

    debugTrace?.push({
      strategy: 3,
      found: null,
      diffContainerId: diffContainer.id || null,
    });
    return null;
  }

  // Summarize an element: tag, key attributes (truncated)
  function summarizeElement(el: Element): {
    tag: string;
    attrs: Record<string, string>;
  } {
    const attrs: Record<string, string> = {};
    for (const attr of el.attributes) {
      attrs[attr.name] = attr.value.substring(0, 200);
    }
    return { tag: el.tagName.toLowerCase(), attrs };
  }

  // Build debug info: strategy trace + DOM context around the selection
  function buildDebugInfo(element: Element): string {
    // 1. Strategy execution trace
    const trace: DebugStrategy[] = [];
    findFilePath(element, trace);

    // 2. Ancestor chain from selection to body
    const ancestors: { tag: string; attrs: Record<string, string> }[] = [];
    let el: Element | null = element;
    while (el && el !== document.body && ancestors.length < 15) {
      ancestors.push(summarizeElement(el));
      el = el.parentElement;
    }

    // 3. Diff container's direct children (siblings of the table, file header, etc.)
    const table =
      element.closest("table[data-diff-anchor]") || element.closest("table");
    const diffContainer =
      table?.closest('[id^="diff-"]') || table?.parentElement?.parentElement;
    let containerChildren:
      | { tag: string; attrs: Record<string, string> }[]
      | null = null;
    if (diffContainer) {
      containerChildren = Array.from(diffContainer.children).map(
        summarizeElement,
      );
    }

    return JSON.stringify({ trace, ancestors, containerChildren });
  }

  // Extract line number and side (new/old) from the selection
  function findLineNumber(node: Node): LineInfo | null {
    const element =
      node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    if (!element) return null;

    // React UI (split diff): the <td> itself carries side and line number
    const cell = element.closest("td[data-diff-side]");
    if (cell) {
      const num = cell.getAttribute("data-line-number");
      if (num) {
        return {
          line: Number.parseInt(num, 10),
          side: cell.getAttribute("data-diff-side") === "left" ? "old" : "new",
        };
      }
    }

    // Fallback: classic unified diff (no data-diff-side)
    const row = element.closest("tr");
    if (!row) return null;

    const cells = row.querySelectorAll("[data-line-number]");
    if (cells.length >= 2) {
      const num = cells[cells.length - 1].getAttribute("data-line-number");
      if (num) {
        return { line: Number.parseInt(num, 10), side: "new" };
      }
    }
    if (cells.length >= 1) {
      const num = cells[0].getAttribute("data-line-number");
      if (num) {
        return { line: Number.parseInt(num, 10), side: "old" };
      }
    }
    return null;
  }

  function getSelectionContext(): SelectionResult | null {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;

    const selectedText = selection.toString().trim();
    if (!selectedText) return null;

    const anchorNode = selection.anchorNode;
    if (!anchorNode) return null;

    const startElement =
      anchorNode.nodeType === Node.TEXT_NODE
        ? anchorNode.parentElement
        : (anchorNode as Element);
    if (!startElement) return null;

    const filePath = findFilePath(startElement);
    const startInfo = anchorNode ? findLineNumber(anchorNode) : null;
    const endInfo = selection.focusNode
      ? findLineNumber(selection.focusNode)
      : null;

    const prMatch = window.location.pathname.match(
      /\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
    );
    const prInfo: PrInfo | null = prMatch
      ? { owner: prMatch[1], repo: prMatch[2], number: prMatch[3] }
      : null;

    // Determine if the selection spans deleted lines
    const startSide = startInfo?.side || null;
    const endSide = endInfo?.side || null;
    const side =
      startSide === "old" || endSide === "old" ? "old" : startSide || endSide;

    const context: SelectionContext = {
      file: filePath || "(unknown file)",
      startLine: startInfo?.line || null,
      endLine: endInfo?.line || null,
      side,
      code: selectedText,
      pr: prInfo,
      url: window.location.href,
    };
    return { context, startElement };
  }

  // --- Modal ---

  const MODAL_ID = "pigeon-modal";

  function createModal(): HTMLDivElement {
    const existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div data-pigeon-backdrop style="
        position: fixed; inset: 0; z-index: 100000;
        background: rgba(0,0,0,0.5); display: flex;
        align-items: center; justify-content: center;
      ">
        <div data-pigeon-dialog style="
          background: #1c2128; color: #e6edf3; border-radius: 12px;
          padding: 24px; width: 520px; max-width: 90vw;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5); font-family: system-ui, sans-serif;
        ">
          <div style="font-size: 15px; font-weight: 600; margin-bottom: 16px;">
            Send to tmux session
          </div>

          <div data-pigeon-loading style="text-align: center; padding: 20px; color: #8b949e;">
            Loading sessions...
          </div>

          <div data-pigeon-content style="display: none;">
            <div data-pigeon-error style="
              display: none; padding: 8px 12px; margin-bottom: 12px;
              background: #3d1f28; border: 1px solid #d73a49; border-radius: 6px;
              color: #f85149; font-size: 13px;
            "></div>

            <label style="display: block; margin-bottom: 12px;">
              <div style="font-size: 13px; color: #8b949e; margin-bottom: 4px;">Session</div>
              <select data-pigeon-session style="
                width: 100%; padding: 6px 8px; border-radius: 6px;
                background: #0d1117; color: #e6edf3; border: 1px solid #30363d;
                font-size: 14px;
              "></select>
            </label>

            <label style="display: block; margin-bottom: 16px;">
              <div style="font-size: 13px; color: #8b949e; margin-bottom: 4px;">Question</div>
              <textarea data-pigeon-question rows="6" style="
                width: 100%; padding: 6px 8px; border-radius: 6px;
                background: #0d1117; color: #e6edf3; border: 1px solid #30363d;
                font-size: 14px; resize: vertical; font-family: inherit;
                box-sizing: border-box;
              "></textarea>
            </label>

            <div style="display: flex; justify-content: flex-end; gap: 8px;">
              <button data-pigeon-cancel style="
                padding: 6px 16px; border-radius: 6px; border: 1px solid #30363d;
                background: #21262d; color: #e6edf3; cursor: pointer; font-size: 13px;
              ">Cancel</button>
              <button data-pigeon-send style="
                padding: 6px 16px; border-radius: 6px; border: none;
                background: #238636; color: white; cursor: pointer; font-size: 13px;
                font-weight: 600;
              ">Send</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  function closeModal(): void {
    document.getElementById(MODAL_ID)?.remove();
  }

  async function fetchSessions(): Promise<ListSessionsResponse> {
    return chrome.runtime.sendMessage({ action: "listSessions" });
  }

  async function showModal(
    context: SelectionContext,
    startElement: Element,
  ): Promise<void> {
    const overlay = createModal();

    const loadingEl = overlay.querySelector(
      "[data-pigeon-loading]",
    ) as HTMLElement;
    const contentEl = overlay.querySelector(
      "[data-pigeon-content]",
    ) as HTMLElement;
    const errorEl = overlay.querySelector("[data-pigeon-error]") as HTMLElement;
    const selectEl = overlay.querySelector(
      "[data-pigeon-session]",
    ) as HTMLSelectElement;
    const questionEl = overlay.querySelector(
      "[data-pigeon-question]",
    ) as HTMLTextAreaElement;
    const sendBtn = overlay.querySelector(
      "[data-pigeon-send]",
    ) as HTMLButtonElement;
    const cancelBtn = overlay.querySelector(
      "[data-pigeon-cancel]",
    ) as HTMLButtonElement;
    const backdrop = overlay.querySelector(
      "[data-pigeon-backdrop]",
    ) as HTMLElement;

    // Fetch sessions
    let sessions: string[] = [];
    try {
      const resp = await fetchSessions();
      if (!resp.ok) {
        loadingEl.style.display = "none";
        contentEl.style.display = "block";
        errorEl.style.display = "block";
        errorEl.textContent = resp.error || "Failed to list sessions";
        sendBtn.disabled = true;
        sendBtn.style.opacity = "0.5";
      } else {
        sessions = resp.sessions || [];
        loadingEl.style.display = "none";
        contentEl.style.display = "block";

        if (sessions.length === 0) {
          errorEl.style.display = "block";
          errorEl.textContent = "No tmux sessions found";
          sendBtn.disabled = true;
          sendBtn.style.opacity = "0.5";
        } else {
          for (const name of sessions) {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            selectEl.appendChild(opt);
          }
          // Pre-select session matching the repo name by prefix
          const repoName = context.pr?.repo;
          if (repoName) {
            const match = sessions.find((s) => s.startsWith(repoName));
            if (match) {
              selectEl.value = match;
            }
          }
        }
      }
    } catch (e) {
      closeModal();
      showNotification(
        `Failed to connect: ${e instanceof Error ? e.message : String(e)}`,
        true,
      );
      return;
    }

    // Set placeholder text for the question
    const s = context.startLine;
    const e = context.endLine;
    let lineRange: string;
    if (s && e && s !== e) {
      lineRange = `${Math.min(s, e)}-${Math.max(s, e)}`;
    } else {
      lineRange = `${s || "?"}`;
    }
    const fileHint = `${context.file}:${lineRange}${context.side === "old" ? " (deleted)" : ""}`;
    questionEl.placeholder = `Ask about ${fileHint}`;
    questionEl.focus();

    // Event handlers
    const doSend = async () => {
      const target = selectEl.value;
      if (!target) return;

      sendBtn.disabled = true;
      sendBtn.textContent = "Sending...";

      const { debugMode } = await chrome.storage.local.get("debugMode");
      const payload = {
        action: "send",
        file: context.file,
        start_line:
          context.startLine && context.endLine
            ? Math.min(context.startLine, context.endLine)
            : context.startLine,
        end_line:
          context.startLine && context.endLine
            ? Math.max(context.startLine, context.endLine)
            : context.endLine,
        side: context.side,
        code: context.code,
        question: questionEl.value || "",
        tmux_target: target,
        debug_html: debugMode ? buildDebugInfo(startElement) : undefined,
      };

      try {
        const response: SendResponse = await chrome.runtime.sendMessage({
          action: "sendToServer",
          payload,
        });
        closeModal();
        if (response?.ok) {
          showNotification("Sent to tmux session");
        } else {
          showNotification(response?.error || "Failed to send", true);
        }
      } catch (e) {
        closeModal();
        showNotification(
          `Extension error: ${e instanceof Error ? e.message : String(e)}`,
          true,
        );
      }
    };

    sendBtn.addEventListener("click", doSend);
    cancelBtn.addEventListener("click", closeModal);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });

    // Keyboard handling
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        doSend();
      }
    };
    overlay.addEventListener("keydown", keyHandler);
  }

  function showNotification(msg: string, isError = false): void {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 99999;
      padding: 12px 20px; border-radius: 8px; font-size: 14px;
      color: white; background: ${isError ? "#d73a49" : "#2ea44f"};
      box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: opacity 0.3s;
    `;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }, 2000);
  }

  function triggerPigeon(): void {
    const result = getSelectionContext();
    if (!result) {
      showNotification("No code selected", true);
      return;
    }
    showModal(result.context, result.startElement);
  }

  // Handle messages from context menu
  chrome.runtime.onMessage.addListener(
    (msg, _sender, sendResponse): undefined => {
      if (msg.action === "pigeonSend") {
        triggerPigeon();
        sendResponse({ ok: true });
      }
    },
  );

  // Keyboard shortcut: Ctrl+Shift+L
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "L") {
      e.preventDefault();
      triggerPigeon();
    }
  });
})();
