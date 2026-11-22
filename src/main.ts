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

// reveal blocks as they enter the viewport; the inline fallback timer is no longer needed
clearTimeout((window as unknown as { __reveal?: number }).__reveal);
const revealIO = new IntersectionObserver((es) => {
  es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    revealIO.unobserve(e.target);
  });
}, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
document.querySelectorAll('[data-reveal]').forEach((el) => revealIO.observe(el));

// mark the section in view in the nav
const navLinks = [...document.querySelectorAll<HTMLAnchorElement>('.top nav a')];
const navIO = new IntersectionObserver((es) => {
  es.forEach((e) => {
    if (!e.isIntersecting) return;
    navLinks.forEach((a) => {
      if (a.hash === `#${e.target.id}`) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  });
}, { rootMargin: '-45% 0px -50% 0px' });
navLinks.forEach((a) => { const t = document.querySelector(a.hash); if (t) navIO.observe(t); });

// crosshair that trails the pointer; over the stage it reads out a position
const cursor = $('.cursor');
if (!reduced && matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const label = cursor.querySelector('span')!;
  const stage = $('#stage');
  let tx = 0, ty = 0, cx = 0, cy = 0, moving = false;
  const follow = () => {
    cx += (tx - cx) * 0.22;
    cy += (ty - cy) * 0.22;
    cursor.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
    if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.2) requestAnimationFrame(follow);
    else moving = false;
  };
  let queued = false;
  const probe = () => {
    queued = false;
    const el = document.elementFromPoint(tx, ty);
    cursor.classList.toggle('link', !!el?.closest('a, button'));
    const r = stage.getBoundingClientRect();
    const over = ty >= r.top && ty <= r.bottom;
    cursor.classList.toggle('read', over);
    if (over) label.textContent = `X ${((tx - r.left) * 0.2).toFixed(1)}  Y ${((r.bottom - ty) * 0.2).toFixed(1)}`;
  };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    tx = e.clientX;
    ty = e.clientY;
    if (!cursor.classList.contains('on')) { cx = tx; cy = ty; cursor.classList.add('on'); }
    probe();
    if (!moving) { moving = true; requestAnimationFrame(follow); }
  }, { passive: true });
  addEventListener('scroll', () => {
    if (queued || !cursor.classList.contains('on')) return;
    queued = true;
    requestAnimationFrame(probe);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => cursor.classList.remove('on'));
}

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
