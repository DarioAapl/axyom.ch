// Spatial continuity pass. Scroll-derived values make every reveal reversible.
export function createContinuity({ secs, fit, ease, S, phaseFor }) {
  const all = s => [...document.querySelectorAll(s)];
  const grid = all('#ha-grid > div');
  function reveal(el, p, edge = 'top') {
    p = Math.max(0, Math.min(1,p));
    const cut = (100*(1-p)).toFixed(3);
    el.style.clipPath = p >= 1 ? 'none' : edge === 'bottom'
      ? `inset(${cut}% 0 0 0)` : `inset(0 0 ${cut}% 0)`;
  }
  return function update(y) {
    const ha = phaseFor('ha');
    if (ha > .5 && ha < 6.73) grid.forEach((el,i)=>{
      const p = ease.cubicOut(fit(ha,3.4+i*.06,4.1+i*.06,0,1));
      el.style.transform = 'none'; reveal(el,p);
    });
  };
}
