// SVG 图标库 — 基于 Lucide 风格线条图标
// 所有图标 24x24 viewBox，stroke-based

const svg = (d, opts = {}) => {
  const size = opts.size || 24;
  const cls = opts.class || '';
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
};

// 底部 Tab 栏图标
export const iconHome = (opts) => svg(
  '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  opts
);

export const iconScan = (opts) => svg(
  '<path d="M3 7V5a2 2 0 012-2h2"/><path d="M17 3h2a2 2 0 012 2v2"/><path d="M21 17v2a2 2 0 01-2 2h-2"/><path d="M7 21H5a2 2 0 01-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>',
  opts
);

export const iconClipboard = (opts) => svg(
  '<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
  opts
);

export const iconClock = (opts) => svg(
  '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  opts
);

export const iconMore = (opts) => svg(
  '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  opts
);

// 操作类型图标
export const iconPlus = (opts) => svg(
  '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  opts
);

export const iconSplit = (opts) => svg(
  '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 00-1.172-2.872L3 3"/><path d="M15 9l6-6"/>',
  opts
);

export const iconMerge = (opts) => svg(
  '<path d="M8 18L5 21l-3-3"/><path d="M12 2v4"/><path d="M12 12v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="8" r="2"/><path d="M7 15l5 5 5-5"/>',
  opts
);

export const iconShelf = (opts) => svg(
  '<rect x="2" y="3" width="20" height="5" rx="1"/><rect x="2" y="10" width="20" height="5" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/>',
  opts
);

export const iconStatus = (opts) => svg(
  '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  opts
);

export const iconTransfer = (opts) => svg(
  '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
  opts
);

export const iconUndo = (opts) => svg(
  '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>',
  opts
);

export const iconPrint = (opts) => svg(
  '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  opts
);

export const iconUser = (opts) => svg(
  '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  opts
);

export const iconLogout = (opts) => svg(
  '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  opts
);

export const iconClose = (opts) => svg(
  '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  opts
);

export const iconCheck = (opts) => svg(
  '<polyline points="20 6 9 17 4 12"/>',
  opts
);

export const iconAlert = (opts) => svg(
  '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  opts
);

export const iconInfo = (opts) => svg(
  '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  opts
);

export const iconChevronLeft = (opts) => svg(
  '<polyline points="15 18 9 12 15 6"/>',
  opts
);

export const iconChevronRight = (opts) => svg(
  '<polyline points="9 18 15 12 9 6"/>',
  opts
);

export const iconFlash = (opts) => svg(
  '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  opts
);

export const iconBarChart = (opts) => svg(
  '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  opts
);

export const iconCamera = (opts) => svg(
  '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
  opts
);

export const iconSearch = (opts) => svg(
  '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  opts
);

export const iconFilter = (opts) => svg(
  '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  opts
);

export const iconTrash = (opts) => svg(
  '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>',
  opts
);

export const iconSettings = (opts) => svg(
  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>',
  opts
);
