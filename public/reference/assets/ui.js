'use strict';

const glyphs = {
  bolt: '<path d="M13.8 2.7 4.7 13h5.6l-1 8.3 10-11.9h-6l.5-6.7Z" fill="currentColor" stroke="none"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
  chart: '<path d="M4 4v16h16M9 16v-4m5 4V8m5 8V5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pulse: '<path d="M2 12h5l3-7 4 14 3-7h5"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m19 0v-2a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"/><circle cx="9.5" cy="7" r="4"/>',
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1 0-4h13M8 7h7m-7 4h5"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5Zm10 10-10 5-10-5m20 5-10 5-10-5"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.1"/><path d="M11 18.5h2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M10.3 4.4 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0ZM12 9v4m0 3.5h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  inbox: '<path d="M3 13 6 5h12l3 8v6H3v-6Zm0 0h5l2 3h4l2-3h5"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.2"/><path d="m16 16 4 4"/>',
  filter: '<path d="M4 7h16M4 17h16m-9-13v6m4 4v6"/>',
  sort: '<path d="m8 8 4-4 4 4m-8 8 4 4 4-4"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  spark: '<path d="M10 3c.9 4.5 2.5 6.1 7 7-4.5.9-6.1 2.5-7 7-.9-4.5-2.5-6.1-7-7 4.5-.9 6.1-2.5 7-7Zm8 10c.5 2.5 1.5 3.5 4 4-2.5.5-3.5 1.5-4 4-.5-2.5-1.5-3.5-4-4 2.5-.5 3.5-1.5 4-4Z"/>',
  dotMenu: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  flask: '<path d="M9 3h6m-5 0v7l-6 8a2 2 0 0 0 1.6 3h12.8a2 2 0 0 0 1.6-3l-6-8V3M7 14h10"/>',
  pin: '<path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  userPlus: '<circle cx="9" cy="7" r="3.5"/><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2m4-13v6m-3-3h6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  monitor: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M12 17v4m-4 0h8"/>'
};

function icon(name, className = '') {
  return `<svg class="icon ${className}" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${glyphs[name] || ''}</svg>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function brand() {
  return '<a class="brand" href="index.html" aria-label="Ctrl Ops, инциденты"><img src="assets/mark.svg" width="38" height="38" alt=""><span>Ctrl<span class="brand-accent">Ops</span><small>Координация IT</small></span></a>';
}

function heroEmblem() {
  return `<span class="hero-emblem" aria-hidden="true"><span class="hero-orbit"></span><span class="hero-sphere"></span><span class="hero-key">${icon('bolt')}</span></span>`;
}

document.querySelectorAll('[data-icon]').forEach(element => {
  element.innerHTML = icon(element.dataset.icon);
});
document.querySelectorAll('[data-hero-emblem]').forEach(element => {
  element.innerHTML = heroEmblem();
});
