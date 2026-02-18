// content.js - Extract file path, line numbers, and selected text from GitHub PR diff pages

(function () {
  "use strict";
  console.log("pigeon: content.js loaded");

  // Extract file path from a table's aria-label (React UI)
  // e.g. "Diff for: path/to/file.ts"
  // e.g. "Diff for: old/path.ts renamed to new/path.ts"
  function parseAriaLabel(table) {
    const ariaLabel = table?.getAttribute("aria-label");
    if (!ariaLabel?.startsWith("Diff for: ")) return null;
    const pathPart = ariaLabel.slice("Diff for: ".length);
    const idx = pathPart.indexOf(" renamed to ");
    return idx >= 0 ? pathPart.slice(idx + " renamed to ".length) : pathPart;
  }

  // Find the closest diff container from the selection and extract file path.
  // When debugTrace is provided, each strategy records what it tried and found.
  function findFilePath(element, debugTrace) {
    // Strategy 1: data-tagsearch-path / data-path on an ancestor (classic UI)
    const pathAncestor = element.closest(
      "[data-tagsearch-path], [data-path]"
    );
    if (pathAncestor) {
      const path =
        pathAncestor.getAttribute("data-tagsearch-path") ||
        pathAncestor.getAttribute("data-path");
      if (path) {
        if (debugTrace) debugTrace.push({ strategy: 1, found: path });
        return path;
      }
    }
    if (debugTrace) debugTrace.push({ strategy: 1, found: null });

    // Strategy 2: aria-label on the diff table (React UI)
    const table = element.closest("table[data-diff-anchor]");
    const ariaPath = parseAriaLabel(table);
    if (ariaPath) {
      if (debugTrace) debugTrace.push({ strategy: 2, found: ariaPath });
      return ariaPath;
    }
    if (debugTrace) {
      debugTrace.push({
        strategy: 2,
        found: null,
        tableAriaLabel: table?.getAttribute("aria-label") ?? null,
      });
    }

    // Strategy 3: Find the diff container and search within it
    const diffContainer = table
      ? table.closest('[id^="diff-"]') || table.parentElement
      : element.closest('[id^="diff-"]');
    if (!diffContainer) {
      if (debugTrace) debugTrace.push({ strategy: 3, found: null, reason: "no diffContainer" });
      return null;
    }

    const linkWithCode = diffContainer.querySelector(
      'a.Link--primary code, a[href*="#diff-"] code'
    );
    if (linkWithCode) {
      const path = linkWithCode.textContent
        .replace(/[\u200E\u200F\u200B\u200C\u200D\uFEFF]/g, "")
        .trim();
      if (path) {
        if (debugTrace) debugTrace.push({ strategy: "3-link-code", found: path });
        return path;
      }
    }

    const link = diffContainer.querySelector(
      'a[title][href*="#diff-"], a.Link--primary[title]'
    );
    if (link) {
      const title = link.getAttribute("title");
      if (title && (title.includes("/") || title.includes("."))) {
        if (debugTrace) debugTrace.push({ strategy: "3-title", found: title });
        return title;
      }
    }

    const copyBtn = diffContainer.querySelector("clipboard-copy[value]");
    if (copyBtn) {
      const val = copyBtn.getAttribute("value");
      if (val && (val.includes("/") || val.includes("."))) {
        if (debugTrace) debugTrace.push({ strategy: "3-clipboard", found: val });
        return val;
      }
    }

    if (debugTrace) {
      debugTrace.push({
        strategy: 3,
        found: null,
        diffContainerId: diffContainer.id || null,
      });
    }
    return null;
  }

  // Summarize an element: tag, key attributes (truncated)
  function summarizeElement(el) {
    const attrs = {};
    for (const attr of el.attributes || []) {
      attrs[attr.name] = attr.value.substring(0, 200);
    }
    return { tag: el.tagName.toLowerCase(), attrs };
  }

  // Build debug info: strategy trace + DOM context around the selection
  function buildDebugInfo(element) {
    // 1. Strategy execution trace
    const trace = [];
    findFilePath(element, trace);

    // 2. Ancestor chain from selection to body
    const ancestors = [];
    let el = element;
    while (el && el !== document.body && ancestors.length < 15) {
      ancestors.push(summarizeElement(el));
      el = el.parentElement;
    }

    // 3. Diff container's direct children (siblings of the table, file header, etc.)
    const table = element.closest("table[data-diff-anchor]") || element.closest("table");
    const diffContainer = table?.closest('[id^="diff-"]') || table?.parentElement?.parentElement;
    let containerChildren = null;
    if (diffContainer) {
      containerChildren = Array.from(diffContainer.children).map(summarizeElement);
    }

    return JSON.stringify({ trace, ancestors, containerChildren });
  }

  // Extract line number from the selection
  function findLineNumber(node) {
    const element =
      node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const row = element.closest("tr");
    if (!row) return null;

    const cells = row.querySelectorAll("[data-line-number]");
    // Prefer the right side (new version)
    for (let i = cells.length - 1; i >= 0; i--) {
      const num = cells[i].getAttribute("data-line-number");
      if (num) return parseInt(num, 10);
    }
    return null;
  }

  function getSelectionContext() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;

    const selectedText = selection.toString().trim();
    if (!selectedText) return null;

    const startElement =
      selection.anchorNode.nodeType === Node.TEXT_NODE
        ? selection.anchorNode.parentElement
        : selection.anchorNode;

    const filePath = findFilePath(startElement);
    const startLine = findLineNumber(selection.anchorNode);
    const endLine = findLineNumber(selection.focusNode);

    const prMatch = window.location.pathname.match(
      /\/([^/]+)\/([^/]+)\/pull\/(\d+)/
    );
    const prInfo = prMatch
      ? { owner: prMatch[1], repo: prMatch[2], number: prMatch[3] }
      : null;

    const context = {
      file: filePath || "(unknown file)",
      startLine,
      endLine,
      code: selectedText,
      pr: prInfo,
      url: window.location.href,
    };
    return { context, startElement };
  }

  // Send to server via background script (to avoid CORS)
  async function sendToTmux(context, question, startElement) {
    const { debugMode } = await chrome.storage.local.get("debugMode");
    const payload = {
      file: context.file,
      start_line: context.startLine,
      end_line: context.endLine,
      code: context.code,
      question: question || "",
      tmux_target: context.pr?.repo || "",
      pr: context.pr,
      url: context.url,
      debug_html: debugMode ? buildDebugInfo(startElement) : undefined,
    };

    try {
      const response = await chrome.runtime.sendMessage({
        action: "sendToServer",
        payload,
      });
      if (response && response.ok) {
        showNotification("Sent to tmux session");
      } else {
        showNotification(response?.error || "Failed to send", true);
      }
    } catch (e) {
      showNotification("Extension error: " + e.message, true);
    }
  }

  function showNotification(msg, isError = false) {
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

  // Handle messages from context menu
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "pigeonSend") {
      const result = getSelectionContext();
      if (!result) {
        showNotification("No code selected", true);
        sendResponse({ ok: false });
        return;
      }

      const { context, startElement } = result;
      const question = prompt(
        `Ask about ${context.file}:${context.startLine || "?"}`,
        ""
      );
      if (question === null) {
        sendResponse({ ok: false });
        return;
      }

      sendToTmux(context, question, startElement);
      sendResponse({ ok: true });
    }
  });

  // Keyboard shortcut: Ctrl+Shift+L
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "L") {
      e.preventDefault();
      const result = getSelectionContext();
      if (!result) {
        showNotification("No code selected", true);
        return;
      }

      const { context, startElement } = result;
      const question = prompt(
        `Ask about ${context.file}:${context.startLine || "?"}`,
        ""
      );
      if (question === null) return;

      sendToTmux(context, question, startElement);
    }
  });
})();
