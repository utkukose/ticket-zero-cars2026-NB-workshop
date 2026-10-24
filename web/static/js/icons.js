'use strict';
(function () {
  const G = {
    eye: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
    cog: '<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>',
    bolt: '<path d="M13 3 5 13h5l-1 8 8-11h-5z" fill="currentColor" stroke="none"/>',
    shield: '<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
    check: '<path d="M5 13l4 4 10-11"/>',
    inbox: '<path d="M4 13h4l2 3h4l2-3h4M4 13 6 5h12l2 8v6H4z"/>',
    star: '<path d="M12 3 14.5 9 21 9 15.8 13 17.8 20 12 16 6.2 20 8.2 13 3 9 9.5 9z" fill="currentColor" stroke="none"/>',
    brackets: '<path d="M9 4H6v16h3M15 4h3v16h-3"/>',
    globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>',
    code: '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>',
    loop: '<path d="M6 9a7 7 0 0 1 12-2M18 15a7 7 0 0 1-12 2"/><path d="M17 4v3h-3M7 20v-3h3"/>',
    radar: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12l6-4"/>',
    key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h8M17 12v3M20 12v4"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M10 10h3a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3h3"/>',
    mail: '<path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/>',
    bug: '<ellipse cx="12" cy="13" rx="4" ry="5"/><path d="M12 8V6M9 9 6 6M15 9l3-3M8 13H4M16 13h4M9 17l-3 3M15 17l3 3"/>',
    scroll: '<path d="M7 4h10v13a3 3 0 0 1-3 3H7a3 3 0 0 0 3-3V4z"/><path d="M10 8h5M10 11h4"/>',
    drop: '<path d="M12 4c3 5 5 7 5 10a5 5 0 0 1-10 0c0-3 2-5 5-10z"/>',
    list: '<path d="M6 7h12M6 12h12M6 17h12"/>',
    book: '<path d="M6 4h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a2 2 0 0 1 0-4h11"/>',
    pencil: '<path d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M14 7l3 3"/>',
    lock: '<rect x="6" y="11" width="12" height="9"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>',
    ban: '<circle cx="12" cy="12" r="8"/><path d="M7 7l10 10"/>',
    chat: '<path d="M4 5h16v11H9l-4 3v-3H4z"/><path d="M8 9h8M8 12h5"/>',
  };

  const KIND = { recv: 'inbox', read: 'eye', tool: 'cog', act: 'bolt', block: 'shield', pending: 'clock', done: 'check', resist: 'ban', reply: 'chat' };
  const TECH = {
    direct: 'bolt', authority_roleplay: 'star', delimiter_injection: 'brackets',
    translate_wrapper: 'globe', encoded_payload: 'code', indirect_injection: 'loop',
  };
  const FLAG = {
    'RECON-TOOLS': 'radar', 'FLAG-1': 'key', 'FLAG-2': 'coin', 'FLAG-3': 'mail',
    'FLAG-4': 'bug', 'BONUS-PROMPT': 'scroll', 'BONUS-HONEYPOT': 'drop',
  };
  // Only the advertised (public) tools are mapped. The hidden tools are left
  // out on purpose so their names never appear in client source; once a player
  // actually discovers one, its trace line still renders with a generic glyph.
  const TOOL = {
    lookup_customer: 'eye', list_orders: 'list', issue_credit: 'coin', read_kb: 'book',
    update_profile: 'pencil',
  };

  function svg(name, cls) {
    const inner = G[name] || G.cog;
    return `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
  }
  const parseTool = (text) => { const m = /^([a-z_]+)\(/.exec(text || ''); return m ? m[1] : null; };

  window.TZIcons = {
    svg,
    kind: (k) => svg(KIND[k] || 'cog', 'k-' + k),
    tech: (t) => svg(TOOL_OR(TECH, t), 'tech'),
    flag: (c) => svg(FLAG[c] || 'star', 'flagic'),
    tool: (n) => svg(TOOL[n] || 'cog', 'toolic'),
    parseTool,
    names: { KIND, TECH, FLAG, TOOL },
  };
  function TOOL_OR(map, k) { return map[k] || 'bolt'; }
})();
