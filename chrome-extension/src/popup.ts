// popup.ts - Debug mode toggle

const checkbox = document.getElementById("debug") as HTMLInputElement;

chrome.storage.local.get("debugMode", ({ debugMode }) => {
  checkbox.checked = !!debugMode;
});

checkbox.addEventListener("change", () => {
  chrome.storage.local.set({ debugMode: checkbox.checked });
});
