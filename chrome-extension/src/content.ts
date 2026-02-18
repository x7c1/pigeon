// content.ts - Entry point for GitHub PR diff page content script

import { getSelectionContext } from "./diff-parser";
import { showModal } from "./modal";
import { showNotification } from "./notification";

console.log("pigeon: content.ts loaded");

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
  (message, _sender, sendResponse): undefined => {
    if (message.action === "pigeonSend") {
      triggerPigeon();
      sendResponse({ ok: true });
    }
  },
);

// Keyboard shortcut: Ctrl+Shift+L
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key === "L") {
    event.preventDefault();
    triggerPigeon();
  }
});
