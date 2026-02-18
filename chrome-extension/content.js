// content.js - Extract file path, line numbers, and selected text from GitHub PR diff pages

(function () {
  "use strict";
  console.log("pigeon: content.js loaded");

  // Find the closest diff container from the selection and extract file path
  function findFilePath(element) {
    // Strategy 1: data-tagsearch-path / data-path on an ancestor (most reliable)
    // closest() checks the element itself AND ancestors, unlike querySelector
    const pathAncestor = element.closest(
      "[data-tagsearch-path], [data-path]"
    );
    if (pathAncestor) {
      const path =
        pathAncestor.getAttribute("data-tagsearch-path") ||
        pathAncestor.getAttribute("data-path");
      if (path) return path;
    }

    // Strategy 2: Find the diff container and search within it
    const table = element.closest("table[data-diff-anchor]");
    const diffContainer = table
      ? table.closest('[id^="diff-"]') || table.parentElement
      : element.closest('[id^="diff-"]');
    if (!diffContainer) return null;

    // file path inside a link > code (GitHub Primer UI)
    const linkWithCode = diffContainer.querySelector(
      'a.Link--primary code, a[href*="#diff-"] code'
    );
    if (linkWithCode) {
      // Strip invisible characters (LRM, ZWNJ, etc.) from textContent
      const path = linkWithCode.textContent
        .replace(/[\u200E\u200F\u200B\u200C\u200D\uFEFF]/g, "")
        .trim();
      if (path) return path;
    }

    // File path stored in a[title]
    const link = diffContainer.querySelector(
      'a[title][href*="#diff-"], a.Link--primary[title]'
    );
    if (link) {
      const title = link.getAttribute("title");
      if (title && (title.includes("/") || title.includes("."))) {
        return title;
      }
    }

    // clipboard-copy button value
    const copyBtn = diffContainer.querySelector("clipboard-copy[value]");
    if (copyBtn) {
      const val = copyBtn.getAttribute("value");
      if (val && (val.includes("/") || val.includes("."))) {
        return val;
      }
    }

    return null;
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

    return {
      file: filePath || "(unknown file)",
      startLine,
      endLine,
      code: selectedText,
      pr: prInfo,
      url: window.location.href,
    };
  }

  // Send to server via background script (to avoid CORS)
  async function sendToTmux(context, question) {
    const payload = {
      file: context.file,
      start_line: context.startLine,
      end_line: context.endLine,
      code: context.code,
      question: question || "",
      tmux_target: context.pr?.repo || "",
      pr: context.pr,
      url: context.url,
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
      const context = getSelectionContext();
      if (!context) {
        showNotification("No code selected", true);
        sendResponse({ ok: false });
        return;
      }

      const question = prompt(
        `Ask about ${context.file}:${context.startLine || "?"}`,
        ""
      );
      if (question === null) {
        sendResponse({ ok: false });
        return;
      }

      sendToTmux(context, question);
      sendResponse({ ok: true });
    }
  });

  // Keyboard shortcut: Ctrl+Shift+L
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "L") {
      e.preventDefault();
      const context = getSelectionContext();
      if (!context) {
        showNotification("No code selected", true);
        return;
      }

      const question = prompt(
        `Ask about ${context.file}:${context.startLine || "?"}`,
        ""
      );
      if (question === null) return;

      sendToTmux(context, question);
    }
  });
})();
