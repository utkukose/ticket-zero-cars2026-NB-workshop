'use strict';
/* Ticket Zero — SUPPORTBOT, the agent under attack. One shared 28x28 renderer
   used both in the player console and as the wall's central core, so the same
   character represents the agent on both screens. Mood drives its expression. */
(function () {
  const N = 28;
  const OUT = '#0b0a1a';
  const STEEL = { lt: '#aeb8dc', base: '#6b78a6', dk: '#3f4a72' };
  const SUIT = { lt: '#3a4368', base: '#2c3350', dk: '#1c2138' };
  const SCREEN = '#0f1120';
  const MOOD = {
    calm: { c: '#37d6ff', lt: '#9ff0ff' },
    think: { c: '#ffae42', lt: '#ffd08a' },
    breach: { c: '#ff3d81', lt: '#ff8fb8' },
    held: { c: '#58f5b0', lt: '#a6ffd8' },
  };

  const X0 = 7, X1 = 20, Y0 = 5, Y1 = 18, R = 3.5;
  const inHead = (x, y) => {
    if (x < X0 || x > X1 || y < Y0 || y > Y1) return false;
    const cx = x < X0 + R ? X0 + R : x > X1 - R ? X1 - R : x;
    const cy = y < Y0 + R ? Y0 + R : y > Y1 - R ? Y1 - R : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= R * R + 0.3;
  };
  // torso spans per row
  const TORSO = { 19: [9, 18], 20: [8, 19], 21: [7, 20], 22: [7, 20], 23: [6, 21], 24: [6, 21], 25: [6, 21], 26: [7, 20] };

  function eyes(S, mood, frame) {
    const m = MOOD[mood] || MOOD.calm;
    if (mood === 'breach') {
      const M = m.c;
      [10, 15].forEach((ox) => {
        S(ox, 10, M); S(ox + 1, 11, M); S(ox + 2, 12, M);
        S(ox + 2, 10, M); S(ox + 1, 11, M); S(ox, 12, M);
      });
      if ((frame >> 3) % 3 === 0) for (let x = 9; x <= 18; x++) S(x, 13, m.lt);
      return;
    }
    if (mood === 'held') {
      const G = m.c;
      S(10, 12, G); S(11, 11, G); S(12, 12, G);
      S(15, 12, G); S(16, 11, G); S(17, 12, G);
      return;
    }
    if (mood === 'think') {
      [10, 16].forEach((ox) => { S(ox, 11, m.c); S(ox + 1, 11, m.c); });
      const sx = 9 + ((frame >> 2) % 10);
      for (let y = 9; y <= 13; y++) if (sx >= 9 && sx <= 18) S(sx, y, m.lt);
      return;
    }
    // calm, with blink
    const blink = (frame % 200) < 8;
    [10, 16].forEach((ox) => {
      if (blink) { S(ox, 12, m.c); S(ox + 1, 12, m.c); }
      else {
        S(ox, 10, m.c); S(ox + 1, 10, m.c); S(ox, 11, m.c); S(ox + 1, 11, m.c);
        S(ox, 10, '#ffffff');
      }
    });
  }

  function build(mood, frame) {
    const m = MOOD[mood] || MOOD.calm;
    const grid = Array.from({ length: N }, () => Array(N).fill(null));
    const S = (x, y, c) => { if (x >= 0 && x < N && y >= 0 && y < N && c) grid[y][x] = c; };
    const occ = (x, y) => x >= 0 && x < N && y >= 0 && y < N && grid[y][x] != null;

    // torso
    for (const y in TORSO) { const [a, b] = TORSO[y]; for (let x = a; x <= b; x++) S(x, +y, +y === 19 ? SUIT.lt : SUIT.base); }
    for (const y in TORSO) { const [a] = TORSO[y]; S(a, +y, SUIT.lt); }         // left highlight
    S(13, 20, m.c); S(14, 20, m.c);                                             // collar V accent
    S(13, 23, m.c); S(14, 23, m.c); S(13, 23, '#ffffff');                       // chest light

    // head
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inHead(x, y)) {
      const t = ((x - X0) / (X1 - X0) + (y - Y0) / (Y1 - Y0)) / 2;
      S(x, y, t < 0.32 ? STEEL.lt : t > 0.72 ? STEEL.dk : STEEL.base);
    }
    S(9, 7, STEEL.lt); S(10, 7, STEEL.lt); S(9, 8, STEEL.lt);

    // antenna
    S(14, 4, STEEL.dk); S(14, 3, STEEL.base); S(14, 1, m.c); S(14, 0, m.lt);

    // headset band + ear cups + mic
    for (let x = 8; x <= 19; x++) S(x, 4, STEEL.dk); S(8, 4, STEEL.base); S(19, 4, STEEL.base);
    [10, 11, 12, 13].forEach((y) => { S(4, y, STEEL.dk); S(5, y, STEEL.base); S(6, y, STEEL.lt); S(23, y, STEEL.dk); S(22, y, STEEL.base); S(21, y, STEEL.lt); });
    S(5, 9, STEEL.dk); S(22, 9, STEEL.dk); S(5, 14, STEEL.dk); S(22, 14, STEEL.dk);
    S(6, 14, STEEL.dk); S(7, 15, STEEL.dk); S(8, 16, STEEL.dk); S(9, 17, STEEL.base); S(10, 17, m.c); S(10, 18, m.c); // mic

    // visor screen
    for (let y = 9; y <= 13; y++) for (let x = 9; x <= 18; x++) S(x, y, SCREEN);
    for (let x = 9; x <= 18; x++) S(x, 9, '#20233a');

    eyes(S, mood, frame);

    // speaker grille
    [11, 13, 15].forEach((x) => S(x, 16, STEEL.dk));

    // outline
    const ring = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (grid[y][x] != null) continue;
      if (occ(x - 1, y) || occ(x + 1, y) || occ(x, y - 1) || occ(x, y + 1)) ring.push([x, y]);
    }
    ring.forEach(([x, y]) => (grid[y][x] = OUT));
    return grid;
  }

  function paint(ctx, mood, frame) {
    const grid = build(mood, frame || 0);
    ctx.clearRect(0, 0, N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = grid[y][x];
      if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
    }
  }

  function moodFor(integrity) { return integrity > 66 ? 'calm' : integrity > 34 ? 'think' : 'breach'; }

  window.TZBot = { SIZE: N, paint, moodFor, MOOD };
})();
