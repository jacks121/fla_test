import { Html5Qrcode } from 'html5-qrcode';

let scannerInstance = null;
let overlayEl = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement('div');
  overlayEl.id = 'scan-overlay';
  overlayEl.innerHTML = `
    <div class="scan-container">
      <div class="scan-header">
        <span>扫描二维码</span>
        <button id="scan-close" type="button">关闭</button>
      </div>
      <div id="scan-reader"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  overlayEl.querySelector('#scan-close').addEventListener('click', () => stopScan());
  return overlayEl;
}

function removeOverlay() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

/**
 * Single scan: opens camera, calls onResult with scanned text, then closes.
 */
export async function startScan(onResult) {
  await stopScan();
  const overlay = ensureOverlay();
  overlay.classList.add('active');
  scannerInstance = new Html5Qrcode('scan-reader');
  await scannerInstance.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    async (decodedText) => {
      await stopScan();
      onResult(decodedText);
    },
    () => {}
  );
}

/**
 * Continuous scan: keeps camera open, calls onResult for each unique code.
 * Caller must call stopScan() to end.
 */
export async function startContinuousScan(onResult, opts = {}) {
  await stopScan();
  const overlay = ensureOverlay();
  overlay.classList.add('active');
  const seen = opts.seen || new Set();
  let cooldown = false;
  scannerInstance = new Html5Qrcode('scan-reader');
  await scannerInstance.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      if (cooldown) return;
      if (seen.has(decodedText)) {
        if (opts.onDuplicate) opts.onDuplicate(decodedText);
        cooldown = true;
        setTimeout(() => { cooldown = false; }, 1500);
        return;
      }
      seen.add(decodedText);
      onResult(decodedText);
      cooldown = true;
      setTimeout(() => { cooldown = false; }, 800);
      if (navigator.vibrate) navigator.vibrate(100);
    },
    () => {}
  );
}

export async function stopScan() {
  if (scannerInstance) {
    try {
      await scannerInstance.stop();
    } catch {
      // already stopped
    }
    scannerInstance.clear();
    scannerInstance = null;
  }
  if (overlayEl) {
    overlayEl.classList.remove('active');
    removeOverlay();
  }
}
