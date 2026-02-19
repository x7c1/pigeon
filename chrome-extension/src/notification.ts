// Toast notification UI

export function showNotification(message: string, isError = false): void {
  const element = document.createElement("div");
  element.textContent = message;
  element.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 99999;
    padding: 12px 20px; border-radius: 8px; font-size: 14px;
    color: white; background: ${isError ? "#d73a49" : "#2ea44f"};
    box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: opacity 0.3s;
  `;
  document.body.appendChild(element);
  setTimeout(() => {
    element.style.opacity = "0";
    setTimeout(() => element.remove(), 300);
  }, 2000);
}
