// background.js - Context menu + Native Messaging relay to tmux

const NATIVE_HOST = "pigeon";
let port = null;

function getPort() {
  if (!port) {
    port = chrome.runtime.connectNative(NATIVE_HOST);
    port.onDisconnect.addListener(() => {
      port = null;
      if (chrome.runtime.lastError) {
        console.error(
          "pigeon: Native host disconnected:",
          chrome.runtime.lastError.message
        );
      }
    });
  }
  return port;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pigeon-send",
    title: "Send to tmux session",
    contexts: ["selection"],
    documentUrlPatterns: [
      "https://github.com/*/pull/*/files*",
      "https://github.com/*/pull/*/changes*",
    ],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pigeon-send") {
    chrome.tabs.sendMessage(tab.id, { action: "pigeonSend" });
  }
});

// Relay requests from content script via Native Messaging
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "sendToServer") {
    try {
      const p = getPort();

      // Receive response only once
      const listener = (response) => {
        p.onMessage.removeListener(listener);
        sendResponse(response);
      };
      p.onMessage.addListener(listener);

      p.postMessage(msg.payload);
    } catch (e) {
      sendResponse({
        ok: false,
        error:
          "Cannot connect to native host. Is pigeon-host installed? Run install.sh.",
      });
    }

    return true; // async response
  }
});
