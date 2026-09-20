/* Hero-Raster als Canvas: ein angewinkeltes Liniengitter, dessen Knoten dem
   Zeiger ausweichen und elastisch zurückfedern (nach dem Muster von
   reactbits.dev DotGrid, aber mit unseren Linien statt Punkten).
   Kein Licht, keine Farbfläche — nur die Linien selbst bewegen sich. */
export function createHeroGrid({ canvas, S, angleDeg = -4, viewport = () => ({ w: innerWidth, h: innerHeight }) }) {
  const ctx = canvas.getContext('2d');
  const angle = angleDeg * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, cell = 0, nodes = [];
  let ox0 = 0, oy0 = 0;   // Ursprung des Rasters im gedrehten Rahmen
  const P = { x: -1e4, y: -1e4, lx: -1e4, ly: -1e4, lt: 0, vx: 0, vy: 0, speed: 0 };
  const K = { spring: 70, damp: 7.5, proximity: 170, speedTrigger: 60, push: 0.34,
              shockRadius: 260, shockPush: 0.9, maxOffsetCells: 1.1 };

  function build() {
    const v = viewport(); W = v.w; H = v.h;
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    cell = 45 * S();
    // Das gedrehte Raster muss die Diagonale abdecken
    const span = Math.hypot(W, H) * 1.05;
    cols = Math.ceil(span / cell) + 1; rows = Math.ceil(span / cell) + 1;
    ox0 = -(cols - 1) * cell / 2; oy0 = -(rows - 1) * cell / 2;
    nodes = new Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      nodes[r * cols + c] = { x: ox0 + c * cell, y: oy0 + r * cell, dx: 0, dy: 0, vx: 0, vy: 0 };
  }
  build();   // Neuaufbau bei Massänderung passiert im Frame-Loop (siehe update), nicht per resize-Event:
             // der Layout-Viewport wird dort erst nach uns aktualisiert, und Safaris Adressleiste soll ihn ohnehin nicht auslösen.

  /* Zeiger in den gedrehten Rahmen (Ursprung Bildmitte) umrechnen */
  function toGrid(px, py) {
    const x = px - W / 2, y = py - H / 2;
    return { x: x * cos + y * sin, y: -x * sin + y * cos };
  }

  addEventListener('pointermove', e => {
    const now = performance.now();
    const g = toGrid(e.clientX, e.clientY);
    const dt = P.lt ? Math.max(8, now - P.lt) : 16;
    const vx = (g.x - P.lx) / dt * 1000, vy = (g.y - P.ly) / dt * 1000;
    P.speed = Math.min(5000, Math.hypot(vx, vy));
    const k = P.speed > 0 ? Math.min(1, 5000 / Math.max(1, Math.hypot(vx, vy))) : 0;
    P.vx = vx * k; P.vy = vy * k;
    P.lx = P.x = g.x; P.ly = P.y = g.y; P.lt = now;
    if (!active || P.speed < K.speedTrigger) return;
    // Schub für Knoten in Zeigernähe: weg vom Zeiger, plus etwas Zeigerrichtung
    const prox = K.proximity * S();
    for (const n of nodes) {
      const ddx = n.x - g.x, ddy = n.y - g.y;
      const d = Math.hypot(ddx, ddy);
      if (d > prox || d < 1e-3) continue;
      const f = (1 - d / prox);
      const gain = K.push * f * Math.min(1, P.speed / 1500) * cell;
      n.vx += (ddx / d) * gain * 18 + P.vx * 0.004 * f;
      n.vy += (ddy / d) * gain * 18 + P.vy * 0.004 * f;
    }
  }, { passive: true });

  addEventListener('click', e => {
    if (!active) return;
    const g = toGrid(e.clientX, e.clientY);
    const R = K.shockRadius * S();
    for (const n of nodes) {
      const ddx = n.x - g.x, ddy = n.y - g.y;
      const d = Math.hypot(ddx, ddy);
      if (d > R || d < 1e-3) continue;
      const f = 1 - d / R;
      n.vx += (ddx / d) * K.shockPush * f * cell * 14;
      n.vy += (ddy / d) * K.shockPush * f * cell * 14;
    }
  });

  document.documentElement.addEventListener('mouseleave', () => { P.x = P.y = -1e4; });

  let active = false;
  function step(dt) {
    const maxOff = K.maxOffsetCells * cell;
    for (const n of nodes) {
      if (n.vx === 0 && n.vy === 0 && n.dx === 0 && n.dy === 0) continue;
      // gedämpfte Feder zurück in die Ruhelage
      n.vx += (-K.spring * n.dx - K.damp * n.vx) * dt;
      n.vy += (-K.spring * n.dy - K.damp * n.vy) * dt;
      n.dx += n.vx * dt; n.dy += n.vy * dt;
      const m = Math.hypot(n.dx, n.dy);
      if (m > maxOff) { n.dx *= maxOff / m; n.dy *= maxOff / m; }
      if (m < 0.02 && Math.hypot(n.vx, n.vy) < 0.5) { n.dx = n.dy = n.vx = n.vy = 0; }
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(angle);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(238,244,242,.055)';
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const n = nodes[r * cols + c];
        if (c === 0) ctx.moveTo(n.x + n.dx, n.y + n.dy); else ctx.lineTo(n.x + n.dx, n.y + n.dy);
      }
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const n = nodes[r * cols + c];
        if (r === 0) ctx.moveTo(n.x + n.dx, n.y + n.dy); else ctx.lineTo(n.x + n.dx, n.y + n.dy);
      }
    }
    ctx.stroke();
  }

  /* Vom Frame-Loop aufgerufen; `visible` = Deckkraft der Bühne (0 → nichts tun) */
  return {
    update(dt, visible) {
      active = visible > 0;
      if (!active) return;
      const v = viewport();
      if (v.w !== W || v.h !== H) build();
      step(Math.min(0.05, dt));
      draw();
    }
  };
}
