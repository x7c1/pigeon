// GitHub diff DOM extraction — file paths, line numbers, and selection context

import type {
  DebugStrategy,
  LineLocation,
  PullRequest,
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
  const index = pathPart.indexOf(" renamed to ");
  return index >= 0 ? pathPart.slice(index + " renamed to ".length) : pathPart;
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

  const copyButton = diffContainer.querySelector("clipboard-copy[value]");
  if (copyButton) {
    const value = copyButton.getAttribute("value");
    if (value && (value.includes("/") || value.includes("."))) {
      debugTrace?.push({ strategy: "3-clipboard", found: value });
      return value;
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
function summarizeElement(element: Element): {
  tag: string;
  attributes: Record<string, string>;
} {
  const attributes: Record<string, string> = {};
  for (const attribute of element.attributes) {
    attributes[attribute.name] = attribute.value.substring(0, 200);
  }
  return { tag: element.tagName.toLowerCase(), attributes };
}

// Build debug info: strategy trace + DOM context around the selection
export function buildDebugInfo(element: Element): string {
  // 1. Strategy execution trace
  const trace: DebugStrategy[] = [];
  findFilePath(element, trace);

  // 2. Ancestor chain from selection to body
  const ancestors: {
    tag: string;
    attributes: Record<string, string>;
  }[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && ancestors.length < 15) {
    ancestors.push(summarizeElement(current));
    current = current.parentElement;
  }

  // 3. Diff container's direct children (siblings of the table, file header, etc.)
  const table =
    element.closest("table[data-diff-anchor]") || element.closest("table");
  const diffContainer =
    table?.closest('[id^="diff-"]') || table?.parentElement?.parentElement;
  let containerChildren:
    | { tag: string; attributes: Record<string, string> }[]
    | null = null;
  if (diffContainer) {
    containerChildren = Array.from(diffContainer.children).map(
      summarizeElement,
    );
  }

  return JSON.stringify({ trace, ancestors, containerChildren });
}

// Extract line number and side (new/old) from the selection
function findLineNumber(node: Node): LineLocation | null {
  const element =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  if (!element) return null;

  // React UI (split diff): the <td> itself carries side and line number
  const cell = element.closest("td[data-diff-side]");
  if (cell) {
    const lineNumber = cell.getAttribute("data-line-number");
    if (lineNumber) {
      return {
        line: Number.parseInt(lineNumber, 10),
        side: cell.getAttribute("data-diff-side") === "left" ? "old" : "new",
      };
    }
  }

  // Fallback: classic unified diff (no data-diff-side)
  const row = element.closest("tr");
  if (!row) return null;

  const cells = row.querySelectorAll("[data-line-number]");
  if (cells.length >= 2) {
    const lineNumber = cells[cells.length - 1].getAttribute("data-line-number");
    if (lineNumber) {
      return { line: Number.parseInt(lineNumber, 10), side: "new" };
    }
  }
  if (cells.length >= 1) {
    const lineNumber = cells[0].getAttribute("data-line-number");
    if (lineNumber) {
      return { line: Number.parseInt(lineNumber, 10), side: "old" };
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

  const pullRequestMatch = window.location.pathname.match(
    /\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
  );
  const pullRequest: PullRequest | null = pullRequestMatch
    ? {
        owner: pullRequestMatch[1],
        repo: pullRequestMatch[2],
        number: pullRequestMatch[3],
      }
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
    pullRequest: pullRequest,
    url: window.location.href,
  };
  return { context, startElement };
}
