// Modal UI for session selection and sending comments

import { buildDebugInfo } from "./diff-parser";
import { showNotification } from "./notification";
import type {
  ListSessionsResponse,
  SelectionContext,
  SendResponse,
} from "./types";

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

export async function showModal(
  context: SelectionContext,
  startElement: Element,
): Promise<void> {
  const overlay = createModal();

  const loadingElement = overlay.querySelector(
    "[data-pigeon-loading]",
  ) as HTMLElement;
  const contentElement = overlay.querySelector(
    "[data-pigeon-content]",
  ) as HTMLElement;
  const errorElement = overlay.querySelector(
    "[data-pigeon-error]",
  ) as HTMLElement;
  const selectElement = overlay.querySelector(
    "[data-pigeon-session]",
  ) as HTMLSelectElement;
  const questionElement = overlay.querySelector(
    "[data-pigeon-question]",
  ) as HTMLTextAreaElement;
  const sendButton = overlay.querySelector(
    "[data-pigeon-send]",
  ) as HTMLButtonElement;
  const cancelButton = overlay.querySelector(
    "[data-pigeon-cancel]",
  ) as HTMLButtonElement;
  const backdrop = overlay.querySelector(
    "[data-pigeon-backdrop]",
  ) as HTMLElement;

  // Fetch sessions
  let sessions: string[] = [];
  try {
    const response = await fetchSessions();
    if (!response.ok) {
      loadingElement.style.display = "none";
      contentElement.style.display = "block";
      errorElement.style.display = "block";
      errorElement.textContent = response.error || "Failed to list sessions";
      sendButton.disabled = true;
      sendButton.style.opacity = "0.5";
    } else {
      sessions = response.sessions || [];
      loadingElement.style.display = "none";
      contentElement.style.display = "block";

      if (sessions.length === 0) {
        errorElement.style.display = "block";
        errorElement.textContent = "No tmux sessions found";
        sendButton.disabled = true;
        sendButton.style.opacity = "0.5";
      } else {
        for (const name of sessions) {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          selectElement.appendChild(option);
        }
        // Pre-select session matching the repo name by prefix
        const repoName = context.pullRequest?.repo;
        if (repoName) {
          const match = sessions.find((session) =>
            session.startsWith(repoName),
          );
          if (match) {
            selectElement.value = match;
          }
        }
      }
    }
  } catch (error) {
    closeModal();
    showNotification(
      `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      true,
    );
    return;
  }

  // Set placeholder text for the question
  const startLine = context.startLine;
  const endLine = context.endLine;
  let lineRange: string;
  if (startLine && endLine && startLine !== endLine) {
    lineRange = `${Math.min(startLine, endLine)}-${Math.max(startLine, endLine)}`;
  } else {
    lineRange = `${startLine || "?"}`;
  }
  const fileHint = `${context.file}:${lineRange}${context.side === "old" ? " (deleted)" : ""}`;
  questionElement.placeholder = `Ask about ${fileHint}`;
  questionElement.focus();

  // Event handlers
  const doSend = async () => {
    const target = selectElement.value;
    if (!target) return;

    sendButton.disabled = true;
    sendButton.textContent = "Sending...";

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
      question: questionElement.value || "",
      tmux_target: target,
      debug_html: debugMode ? buildDebugInfo(startElement) : undefined,
    };

    try {
      const sendResponse: SendResponse = await chrome.runtime.sendMessage({
        action: "sendToServer",
        payload,
      });
      closeModal();
      if (sendResponse?.ok) {
        showNotification("Sent to tmux session");
      } else {
        showNotification(sendResponse?.error || "Failed to send", true);
      }
    } catch (error) {
      closeModal();
      showNotification(
        `Extension error: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  };

  sendButton.addEventListener("click", doSend);
  cancelButton.addEventListener("click", closeModal);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModal();
  });

  // Keyboard handling
  const keyHandler = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      doSend();
    }
  };
  overlay.addEventListener("keydown", keyHandler);
}
