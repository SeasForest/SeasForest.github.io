import '@fontsource/archivo-black/latin-400.css';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import '@fontsource-variable/martian-mono/wdth.css';
import './style.css';
import { mountDiagrams } from './diagrams';

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

mountDiagrams(reduced);

// top bar + z ruler: scrolling the page is moving through its layers
const top = $('.top');
const zmark = $('#zmark');
const zval = $('#zval');
const ruler = $('.zruler');
function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const f = max > 0 ? scrollY / max : 0;
  top.classList.toggle('scrolled', scrollY > 8);
  const y = f * ruler.clientHeight;
  zmark.style.transform = `translateY(${y}px)`;
  zval.style.top = `${y}px`;
  zval.textContent = `Z ${(scrollY * 0.02).toFixed(1)}`;
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
onScroll();

// hero
const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tabs button')];
const consoleEl = $('.console');
const rx = $('#rx'), ry = $('#ry'), rz = $('#rz'), rstatus = $('#rstatus'), rbar = $('#rbar'), gcode = $('#gcode');
const setTab = (m: number) => {
  tabs.forEach((t, i) => t.setAttribute('aria-selected', String(i === m)));
  consoleEl.dataset.mode = String(m);
  gcode.textContent = '';
};

function webgl2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

if (!webgl2()) {
  document.documentElement.classList.add('no-gl');
} else {
  import('./hero').then(async ({ Hero }) => {
    const hero = new Hero($<HTMLCanvasElement>('#hero-canvas'), $('#stage'), reduced);
    hero.onMode = setTab;
    let lastStatus = '';
    hero.onHud = (s) => {
      rx.textContent = s.x.toFixed(2);
      ry.textContent = s.y.toFixed(2);
      rz.textContent = s.z.toFixed(2);
      rbar.style.transform = `scaleX(${s.progress})`;
      if (s.status !== lastStatus) rstatus.textContent = lastStatus = s.status;
      if (s.line) {
        const el = document.createElement('span');
        el.textContent = s.line;
        gcode.append(el);
        while (gcode.childElementCount > 5) gcode.firstElementChild!.remove();
      }
    };
    tabs.forEach((t, i) => t.addEventListener('click', () => hero.setMode(i, true)));
    $('.tabs').addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
      if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      const n = (i + (e.key === 'ArrowRight' ? 1 : 3)) % 4;
      tabs[n].focus();
      hero.setMode(n, true);
    });
    try {
      await hero.init();
    } catch (err) {
      console.error(err);
      document.documentElement.classList.add('no-gl');
    }
  });
}
