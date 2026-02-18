// GitHub diff DOM extraction — file paths, line numbers, and selection context

import type {
  DebugStrategy,
  LineInfo,
  PrInfo,
  SelectionContext,
  SelectionResult,
} from "./types";

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
export function findFilePath(
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
export function buildDebugInfo(element: Element): string {
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

export function getSelectionContext(): SelectionResult | null {
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
