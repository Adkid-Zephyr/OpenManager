// @ts-nocheck

export function openManual() {
  const manualUrl = new URL('./manual.html', window.location.href);
  window.open(manualUrl.toString(), '_blank', 'noopener,noreferrer');
}

export function showToast(message, color = '#10b981') {
  const toast = document.createElement('div');
  toast.style.cssText = `position: fixed; bottom: 20px; right: 20px; background: ${color}; color: white; padding: 12px 24px; border-radius: 8px; font-size: 14px; z-index: 10000; box-shadow: 0 10px 30px rgba(0,0,0,0.15);`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2200);
}

export function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
