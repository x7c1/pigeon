const checkbox = document.getElementById("debug");

chrome.storage.local.get("debugMode", ({ debugMode }) => {
  checkbox.checked = !!debugMode;
});

checkbox.addEventListener("change", () => {
  chrome.storage.local.set({ debugMode: checkbox.checked });
});
