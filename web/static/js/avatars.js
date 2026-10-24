'use strict';
/* Ticket Zero — attacker avatars. Twenty distinct human busts on a 24x24 grid:
   varied skin tones, hairstyles, facial hair, ages and accessories, drawn with
   an edge-detected outline so each reads as a different person. */
(function () {
  const N = 24;
  const OUT = '#0b0a1a', W = '#eef0f5', PUP = '#20181f';

  const SKIN = {
    pale:  { lt: '#ffe6d0', base: '#f4c9a4', dk: '#cf9d76' },
    light: { lt: '#ffd7ac', base: '#eaad7e', dk: '#bd8256' },
    med:   { lt: '#eab98e', base: '#d09566', dk: '#9e693e' },
    tan:   { lt: '#d8a06e', base: '#b67a46', dk: '#87542c' },
    brown: { lt: '#b07a46', base: '#875230', dk: '#5e371c' },
    dark:  { lt: '#7f4f30', base: '#5c381d', dk: '#3c2212' },
  };
  const HAIRC = {
    black:  { lt: '#33334a', base: '#1b1b2a', dk: '#101019' },
    dbrown: { lt: '#57392a', base: '#3a2418', dk: '#241206' },
    brown:  { lt: '#8a6440', base: '#634226', dk: '#412a15' },
    blond:  { lt: '#f2d98a', base: '#d8b45a', dk: '#a9822f' },
    gray:   { lt: '#dadae6', base: '#a8a8ba', dk: '#7a7a8c' },
    white:  { lt: '#ffffff', base: '#d6d6e2', dk: '#a2a2b4' },
    ginger: { lt: '#e07a4a', base: '#c0562c', dk: '#8f3c1c' },
    pink:   { lt: '#ffc6e0', base: '#ff8fbf', dk: '#c76f9c' },
    teal:   { lt: '#8ff5ec', base: '#3ff0e0', dk: '#1fae9f' },
    blue:   { lt: '#9fb8ff', base: '#5a8cff', dk: '#3f5fc7' },
  };
  const CLOTH = {
    gray:   { lt: '#565a72', base: '#3b3f54', dk: '#282b3c' },
    red:    { lt: '#e8564e', base: '#c23a33', dk: '#8f2823' },
    blue:   { lt: '#4f7fd8', base: '#345fb0', dk: '#22417e' },
    green:  { lt: '#57b06a', base: '#3a8a4c', dk: '#256234' },
    navy:   { lt: '#3a4368', base: '#242b48', dk: '#161c30' },
    purple: { lt: '#a06fd0', base: '#7d4fb0', dk: '#573480' },
    teal:   { lt: '#3fd0c0', base: '#26a89a', dk: '#177a70' },
    denim:  { lt: '#6a86b0', base: '#496286', dk: '#31445e' },
    black:  { lt: '#2c2c3c', base: '#1b1b28', dk: '#101019' },
    tan:    { lt: '#c8a878', base: '#a3824f', dk: '#755a34' },
    pink:   { lt: '#ff9ecb', base: '#e06f9c', dk: '#a3496c' },
    yellow: { lt: '#ffdf7a', base: '#e8b93f', dk: '#b78a1f' },
  };

  const FACE = { 4: [9, 14], 5: [8, 15], 6: [7, 16], 7: [7, 16], 8: [6, 17], 9: [6, 17], 10: [6, 17], 11: [6, 17], 12: [7, 16], 13: [7, 16], 14: [8, 15], 15: [9, 14], 16: [10, 13] };
  const CLOTHROWS = { 18: [8, 15], 19: [7, 16], 20: [6, 17], 21: [5, 18], 22: [5, 18], 23: [6, 17] };

  function make() {
    const g = Array.from({ length: N }, () => Array(N).fill(null));
    const S = (x, y, c) => { if (x >= 0 && x < N && y >= 0 && y < N && c) g[y][x] = c; };
    const occ = (x, y) => x >= 0 && x < N && y >= 0 && y < N && g[y][x] != null;
    return { g, S, occ };
  }
  const box = (S, x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) S(x, y, c); };

  function head(S, sk) {
    for (const y in FACE) {
      const [a, b] = FACE[y]; const yy = +y;
      for (let x = a; x <= b; x++) {
        let c = sk.base;
        if (x <= a + 1 || yy <= 5) c = sk.lt;
        if (x >= b - 1 || yy >= 14) c = sk.dk;
        S(x, yy, c);
      }
    }
    S(11, 12, sk.dk); S(11, 13, sk.dk);           // nose
    S(9, 13, sk.lt); S(14, 13, sk.lt);            // cheeks
  }
  function ears(S, sk) { S(6, 11, sk.base); S(6, 12, sk.dk); S(17, 11, sk.base); S(17, 12, sk.dk); }
  function neck(S, sk) { box(S, 10, 16, 13, 18, sk.base); S(10, 16, sk.dk); S(13, 16, sk.dk); }
  function clothing(S, cl) {
    for (const y in CLOTHROWS) { const [a, b] = CLOTHROWS[y]; for (let x = a; x <= b; x++) S(x, +y, +y === 18 ? cl.lt : cl.base); }
    S(11, 18, cl.dk); S(12, 18, cl.dk);           // neckline
  }
  function eyes(S, sk, brow) {
    [9, 14].forEach((ex) => {
      S(ex - 1, 10, W); S(ex, 10, W); S(ex, 10, PUP);
      S(ex - 1, 11, sk.dk);
      if (brow) { S(ex - 1, 8, brow); S(ex, 8, brow); }
    });
  }
  function mouth(S, sk, smile) {
    S(10, 14, sk.dk); S(11, 14, sk.dk); S(12, 14, sk.dk);
    if (smile) { S(9, 14, sk.dk); S(13, 14, sk.dk); S(10, 15, sk.dk); S(12, 15, sk.dk); }
  }

  // ---- hair ----
  const capTop = (S, H, y0, y1) => { for (let y = y0; y <= y1; y++) { const f = FACE[y] || FACE[4]; for (let x = f[0]; x <= f[1]; x++) S(x, y, y === y0 ? H.lt : H.base); } };
  const HAIR = {
    short(S, H) { capTop(S, H, 3, 6); for (let x = 7; x <= 16; x++) S(x, 7, x < 9 || x > 14 ? H.base : null); S(7, 8, H.dk); S(16, 8, H.dk); S(7, 9, H.dk); S(16, 9, H.dk); },
    buzz(S, H) { for (let y = 4; y <= 6; y++) { const f = FACE[y]; for (let x = f[0]; x <= f[1]; x++) S(x, y, H.dk); } S(7, 7, H.dk); S(16, 7, H.dk); },
    bald(S, H, sk) { S(10, 4, sk.lt); S(13, 4, sk.lt); },
    horseshoe(S, H) { for (let y = 8; y <= 12; y++) { S(6, y, H.base); S(7, y, H.dk); S(16, y, H.dk); S(17, y, H.base); } S(6, 8, H.lt); S(17, 8, H.lt); },
    sidepart(S, H) { capTop(S, H, 3, 6); for (let x = 9; x <= 15; x++) S(x, 7, H.base); S(9, 7, H.lt); S(7, 7, H.dk); S(16, 7, H.dk); S(7, 8, H.dk); S(16, 8, H.dk); },
    spiky(S, H) { capTop(S, H, 4, 6); [[8, 2], [10, 1], [12, 2], [14, 3]].forEach(([x, y]) => { S(x, y, H.lt); S(x, y + 1, H.base); }); S(7, 7, H.dk); S(16, 7, H.dk); },
    receding(S, H) { for (let x = 9; x <= 14; x++) S(x, 4, H.base); for (let x = 8; x <= 15; x++) S(x, 5, H.base); for (let x = 7; x <= 16; x++) S(x, 6, x < 10 || x > 13 ? H.base : null); S(7, 7, H.dk); S(16, 7, H.dk); S(7, 8, H.dk); S(16, 8, H.dk); },
    pixie(S, H) { capTop(S, H, 3, 6); S(6, 7, H.base); S(7, 7, H.base); S(16, 7, H.base); S(17, 7, H.base); S(6, 8, H.dk); S(17, 8, H.dk); S(9, 7, H.lt); },
    bob(S, H) { capTop(S, H, 3, 6); for (let y = 7; y <= 13; y++) { S(6, y, H.base); S(7, y, H.dk); S(16, y, H.dk); S(17, y, H.base); } S(6, 13, H.dk); S(17, 13, H.dk); },
    long(S, H) { capTop(S, H, 3, 6); for (let y = 6; y <= 16; y++) { S(5, y, H.base); S(6, y, H.dk); S(17, y, H.dk); S(18, y, H.base); } for (let y = 16; y <= 18; y++) { S(4, y, H.base); S(5, y, H.base); S(18, y, H.base); S(19, y, H.base); } S(5, 6, H.lt); S(18, 6, H.lt); },
    longstraight(S, H) { capTop(S, H, 2, 6); for (let y = 6; y <= 17; y++) { S(4, y, H.dk); S(5, y, H.base); S(6, y, H.lt); S(17, y, H.lt); S(18, y, H.base); S(19, y, H.dk); } for (let x = 5; x <= 18; x++) S(x, 18, H.base); },
    pony(S, H) { capTop(S, H, 3, 6); S(7, 7, H.dk); S(16, 7, H.dk); S(17, 5, H.base); S(18, 6, H.base); S(18, 7, H.dk); S(18, 8, H.base); S(19, 9, H.base); S(18, 10, H.dk); },
    bun(S, H) { capTop(S, H, 4, 6); S(11, 2, H.base); S(12, 2, H.base); S(11, 3, H.lt); S(12, 3, H.dk); S(7, 7, H.dk); S(16, 7, H.dk); },
    afro(S, H) { for (let y = 2; y <= 9; y++) { const f = FACE[y < 4 ? 4 : y]; for (let x = f[0] - 2; x <= f[1] + 2; x++) { const dx = x - 12, dy = y - 5; if (dx * dx * 0.6 + dy * dy <= 30) S(x, y, (dx + dy) % 3 === 0 ? H.lt : H.base); } } S(5, 9, H.dk); S(18, 9, H.dk); },
    quiff(S, H) { capTop(S, H, 4, 6); for (let x = 9; x <= 13; x++) S(x, 3, H.lt); S(10, 2, H.base); S(11, 2, H.base); S(7, 7, H.dk); S(16, 7, H.dk); },
  };

  // ---- facial hair ----
  const BEARD = {
    none() {},
    stubble(S, sk) { for (let y = 13; y <= 15; y++) { const f = FACE[y]; for (let x = f[0]; x <= f[1]; x++) if ((x + y) % 2 === 0) S(x, y, sk.dk); } },
    mustache(S, H) { S(10, 13, H.base); S(11, 13, H.base); S(12, 13, H.base); },
    goatee(S, H) { S(10, 13, H.base); S(12, 13, H.base); S(11, 15, H.base); S(11, 16, H.base); S(10, 16, H.dk); S(12, 16, H.dk); },
    full(S, H) { for (let y = 12; y <= 16; y++) { const f = FACE[y]; for (let x = f[0]; x <= f[1]; x++) S(x, y, (x + y) % 5 === 0 ? H.lt : H.base); } S(10, 14, null); S(11, 14, null); S(12, 14, null); S(10, 13, H.base); S(12, 13, H.base); box(S, 6, 9, 7, 12, H.base); box(S, 16, 9, 17, 12, H.base); },
    longwhite(S, H) { for (let y = 12; y <= 19; y++) { const a = Math.max(7, 7 + (y - 14)); const b = Math.min(16, 16 - (y - 14)); for (let x = a > 16 ? 9 : a; x <= (b < 9 ? 14 : b); x++) S(x, y, (x + y) % 4 === 0 ? H.lt : H.base); } S(10, 13, H.base); S(12, 13, H.base); },
  };

  // ---- accessories ----
  const glasses = (S, kind) => {
    const c = kind === 'sun' ? '#111119' : '#20202e';
    [8, 9].forEach((x) => S(x, 10, c)); [14, 15].forEach((x) => S(x, 10, c));
    if (kind !== 'sun') { S(8, 11, c); S(9, 9, c); S(14, 11, c); S(15, 9, c); }
    S(11, 10, c); S(12, 10, c);                    // bridge
    if (kind === 'sun') { S(8, 11, c); S(9, 11, c); S(14, 11, c); S(15, 11, c); }
  };
  function hood(S, cl, sk) {
    for (let y = 2; y <= 12; y++) { const f = FACE[y] || FACE[4]; S(f[0] - 2, y, cl.dk); S(f[0] - 1, y, cl.base); S(f[1] + 1, y, cl.base); S(f[1] + 2, y, cl.dk); }
    for (let x = 5; x <= 18; x++) S(x, 2, cl.base); for (let x = 5; x <= 18; x++) S(x, 3, x < 8 || x > 15 ? cl.base : null);
    S(7, 3, cl.lt); box(S, 4, 12, 6, 15, cl.base); box(S, 17, 12, 19, 15, cl.base);
  }
  function cap(S, cl) { for (let y = 3; y <= 6; y++) { const f = FACE[y] || FACE[4]; for (let x = f[0]; x <= f[1]; x++) S(x, y, y === 3 ? cl.lt : cl.base); } for (let x = 5; x <= 9; x++) S(x, 6, cl.dk); S(4, 6, cl.dk); S(11, 3, cl.lt); }
  function beanie(S, cl) { for (let y = 2; y <= 6; y++) { const f = FACE[y] || FACE[4]; for (let x = f[0]; x <= f[1]; x++) S(x, y, cl.base); } for (let x = 7; x <= 16; x++) S(x, 6, cl.dk); for (let x = 7; x <= 16; x++) S(x, 2, cl.lt); }
  function bandana(S, cl) { for (let x = 7; x <= 16; x++) { S(x, 6, cl.base); S(x, 7, cl.base); } S(7, 6, cl.lt); S(16, 7, cl.dk); S(5, 7, cl.base); S(4, 8, cl.dk); }
  function headphones(S) { const m = { lt: '#b4bee0', base: '#6b78a6', dk: '#3f4a72' }; for (let x = 7; x <= 16; x++) S(x, 3, m.base); S(7, 3, m.lt); [9, 10, 11, 12].forEach((y) => { S(5, y, m.dk); S(6, y, m.base); S(17, y, m.dk); S(18, y, m.base); }); S(6, 8, m.dk); S(17, 8, m.dk); }
  const earring = (S, c) => { S(6, 13, c); S(17, 13, c); };

  const P = (skin, hair, hairColor, opts = {}) => ({ skin, hair, hairColor, ...opts });
  const PERSONAS = [
    P('med', 'hood', 'black', { hood: 'gray' }),                                  // 0 hooded mystery
    P('light', 'short', 'brown', { cloth: 'blue', brow: 1 }),                      // 1 young man
    P('light', 'longstraight', 'black', { cloth: 'red', ear: '#ffcf3f' }),         // 2 young woman
    P('pale', 'horseshoe', 'gray', { beard: 'full', glasses: 'clear', cloth: 'tan', brow: 1, old: 1 }), // 3 older man
    P('dark', 'bald', 'black', { beard: 'goatee', cloth: 'black', brow: 1 }),      // 4 bald man
    P('light', 'bob', 'blond', { glasses: 'clear', cloth: 'green', smile: 1 }),    // 5 woman glasses
    P('med', 'sidepart', 'black', { beard: 'mustache', cloth: 'navy', brow: 1 }),  // 6 suited man
    P('pale', 'long', 'pink', { cloth: 'black', ear: '#ff8fbf' }),                 // 7 pink-hair woman
    P('light', 'short', 'ginger', { beard: 'full', cloth: 'denim', brow: 1 }),     // 8 ginger beard
    P('tan', 'pony', 'brown', { cloth: 'purple', smile: 1 }),                      // 9 ponytail woman
    P('pale', 'bun', 'gray', { glasses: 'clear', cloth: 'teal', old: 1 }),         // 10 older woman
    P('tan', 'buzz', 'black', { beard: 'stubble', cloth: 'gray', brow: 1 }),       // 11 buzz cut
    P('dark', 'afro', 'black', { cloth: 'yellow', smile: 1 }),                     // 12 afro
    P('light', 'long', 'brown', { cloth: 'blue', smile: 1 }),                      // 13 long brown woman
    P('med', 'beanie', 'brown', { beard: 'stubble', cloth: 'gray', beanieC: 'red', brow: 1 }), // 14 beanie hipster
    P('light', 'cap', 'brown', { cloth: 'green', capC: 'navy', brow: 1 }),         // 15 cap gamer
    P('brown', 'pixie', 'black', { cloth: 'red', ear: '#ffcf3f', smile: 1 }),      // 16 pixie woman
    P('light', 'short', 'dbrown', { headphones: 1, cloth: 'teal', brow: 1 }),      // 17 headphones gamer
    P('pale', 'receding', 'white', { beard: 'longwhite', glasses: 'clear', cloth: 'navy', old: 1 }), // 18 professor
    P('tan', 'longstraight', 'brown', { bandana: 'red', cloth: 'green' }),         // 19 bandana adventurer
  ];
  const COUNT = PERSONAS.length;

  function build(id) {
    id = ((id % COUNT) + COUNT) % COUNT;
    const p = PERSONAS[id];
    const { g, S, occ } = make();
    const sk = SKIN[p.skin], H = HAIRC[p.hairColor], cl = CLOTH[p.cloth || 'gray'];
    const brow = p.brow ? H.dk : null;

    // back hair for long styles
    if (p.hair === 'long' || p.hair === 'longstraight') HAIR[p.hair](S, H);

    clothing(S, cl);
    neck(S, sk);
    const covered = ['afro', 'long', 'longstraight', 'bob'].includes(p.hair) || p.hood || p.beanieC || p.bandana;
    head(S, sk);
    if (!covered) ears(S, sk);
    eyes(S, sk, brow);
    mouth(S, sk, p.smile);
    if (p.glasses) glasses(S, p.glasses === 'sun' ? 'sun' : 'clear');

    if (p.beard) BEARD[p.beard](S, p.beard === 'stubble' ? sk : (p.hair === 'longwhite' || p.hairColor === 'white' ? HAIRC.white : H));

    // hair / headwear on top
    if (p.hood) hood(S, CLOTH[p.hood], sk);
    else if (p.beanieC) beanie(S, CLOTH[p.beanieC]);
    else if (p.capC) { cap(S, CLOTH[p.capC]); }
    else if (p.bandana) { HAIR.longstraight(S, H); bandana(S, CLOTH[p.bandana]); }
    else HAIR[p.hair](S, H, sk);
    if (p.headphones) headphones(S);
    if (p.ear) earring(S, p.ear);

    // outline
    const ring = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (g[y][x] != null) continue;
      if (occ(x - 1, y) || occ(x + 1, y) || occ(x, y - 1) || occ(x, y + 1)) ring.push([x, y]);
    }
    ring.forEach(([x, y]) => (g[y][x] = OUT));
    return g;
  }

  function paint(ctx, id) {
    const g = build(id);
    ctx.clearRect(0, 0, N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = g[y][x]; if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); } }
  }
  const cache = {};
  function sprite(id) { if (cache[id]) return cache[id]; const cv = document.createElement('canvas'); cv.width = N; cv.height = N; paint(cv.getContext('2d'), id); cache[id] = cv; return cv; }
  function mount(canvas, id) { canvas.width = N; canvas.height = N; paint(canvas.getContext('2d'), id); }
  function chip(id, px) { const cv = document.createElement('canvas'); cv.width = N; cv.height = N; cv.style.width = (px || 20) + 'px'; cv.style.height = (px || 20) + 'px'; cv.style.imageRendering = 'pixelated'; cv.className = 'av'; paint(cv.getContext('2d'), id); return cv; }
  const baseColor = (id) => CLOTH[PERSONAS[((id % COUNT) + COUNT) % COUNT].cloth || 'gray'].base;

  window.TZAvatars = { COUNT, SIZE: N, paint, sprite, mount, chip, baseColor };
})();
