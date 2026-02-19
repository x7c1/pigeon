// background.ts - Context menu + Native Messaging relay to tmux

const NATIVE_HOST = "pigeon";
let port: chrome.runtime.Port | null = null;

function getPort(): chrome.runtime.Port {
  if (!port) {
    port = chrome.runtime.connectNative(NATIVE_HOST);
    port.onDisconnect.addListener((p) => {
      port = null;
      // chrome.runtime.lastError is not in chrome-types MV3 defs;
      // the port-level error is available via p.
      const err = (p as unknown as { error?: { message: string } }).error;
      if (err) {
        console.error("pigeon: Native host disconnected:", err.message);
      }
    });
  }
  return port;
}

function relayToNativeHost(
  payload: unknown,
  sendResponse: (response: unknown) => void,
): void {
  try {
    const p = getPort();

    const listener = (response: unknown) => {
      p.onMessage.removeListener(listener);
      sendResponse(response);
    };
    p.onMessage.addListener(listener);

    p.postMessage(payload);
  } catch (e) {
    sendResponse({
      ok: false,
      error:
        "Cannot connect to native host. Is pigeon-host installed? Run install.sh.",
    });
  }
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
  if (info.menuItemId === "pigeon-send" && tab?.id != null) {
    chrome.tabs.sendMessage(tab.id, { action: "pigeonSend" });
  }
});

// Relay requests from content script via Native Messaging
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "listSessions") {
    relayToNativeHost({ action: "list-sessions" }, sendResponse);
    return true;
  }

  if (msg.action === "sendToServer") {
    relayToNativeHost(msg.payload, sendResponse);
    return true;
  }
});
