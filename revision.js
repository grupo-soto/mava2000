// @ts-check
// Capa de revisión para las copias de prueba de las webs (nunca va en la web real).
// La añade herramientas/subir-mava-prueba.mjs antes de </body>:
//   <script src="revision.js" data-web="Mava 2000" data-clave="mava2000" defer></script>
//
// Quien revisa va apuntando notas mientras navega (se guardan en su navegador y siguen al cambiar de página),
// puede señalar el texto o la foto exacta, y al acabar las manda todas juntas por WhatsApp o correo, o las copia.
// No envía nada a ningún servidor: el mensaje lo manda la persona desde su WhatsApp o su correo.
(() => {
  const yo = /** @type {HTMLScriptElement | null} */ (document.currentScript);
  const WEB = yo?.dataset.web || document.title.split('|').pop()?.trim() || 'la web';
  const CLAVE = `revision:${yo?.dataset.clave || WEB}`;

  /** @typedef {{ donde: string, sobre: string, texto: string }} Nota */
  /** @type {{ nombre: string, notas: Nota[], visto: boolean }} */
  let estado = { nombre: '', notas: [], visto: false };
  try { estado = { ...estado, ...JSON.parse(localStorage.getItem(CLAVE) || '{}') }; } catch { /* sin almacenamiento: vale igual */ }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* idem */ } };

  const limpio = (/** @type {string | null | undefined} */ t, max = 90) => {
    const s = (t || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
  };
  const esc = (/** @type {string} */ t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c);

  // ---------- dónde está quien revisa ----------
  const pagina = () => {
    const etq = document.querySelector('.pag__etq')?.textContent;
    if (etq) return limpio(etq);
    const n = document.querySelector('.barra__hoja span')?.textContent;
    const p = document.body.dataset.pagina || document.title.split('|')[0];
    return limpio(`${n ? `Hoja ${n} · ` : ''}${p.charAt(0).toUpperCase()}${p.slice(1)}`);
  };
  const nombreDe = (/** @type {Element} */ s) => {
    const por = s.getAttribute('aria-labelledby');
    return limpio(s.getAttribute('aria-label') || (por && document.getElementById(por)?.textContent)
      || s.querySelector('h1, h2')?.textContent || s.querySelector('.etq')?.textContent || s.id, 60);
  };
  /** La sección más interior que cruza la línea del 45 % de la pantalla. */
  const seccion = () => {
    const y = innerHeight * 0.45;
    let mejor = /** @type {Element | null} */ (null);
    for (const s of document.querySelectorAll('main section, main header, body > section')) {
      if (s.closest('.rev')) continue;
      const r = s.getBoundingClientRect();
      if (r.height && r.top <= y && r.bottom >= y) mejor = s;
    }
    return mejor ? nombreDe(mejor) : '';
  };
  const dondeAhora = () => { const p = pagina(), s = seccion(); return s && s !== p ? `${p} › ${s}` : p; };

  // ---------- interfaz ----------
  const css = `
.rev, .rev * { box-sizing: border-box; }
.rev { --rev-m: var(--marino, #242B46); --rev-c: var(--cobalto, #2C428E); --rev-p: var(--papel-2, #F7F6F2); --rev-t2: var(--tinta-2, #525870); --rev-l: var(--linea, rgba(36,43,70,.18));
  font-family: inherit; color: var(--rev-m); line-height: 1.45; }
.rev button, .rev input, .rev textarea { font: inherit; color: inherit; }
.rev-tab { position: fixed; right: 0; top: 50%; z-index: 9000; display: flex; align-items: center; gap: 10px; padding: 14px 8px; border: 0; background: var(--rev-m); color: #fff; cursor: pointer;
  writing-mode: vertical-rl; transform: translateY(-50%) rotate(180deg); font-size: 11px; font-weight: 650; font-stretch: 112%; letter-spacing: .09em; text-transform: uppercase; }
.rev-tab:hover { background: var(--rev-c); }
.rev-tab b { writing-mode: horizontal-tb; transform: rotate(180deg); min-width: 18px; padding: 2px 0; background: #fff; color: var(--rev-m); font-size: 11px; font-weight: 700; letter-spacing: 0; text-align: center; }
.rev-tab b:empty { display: none; }
.rev--abierto .rev-tab, .rev--senalando .rev-tab { display: none; }
.rev-aviso1 { position: fixed; right: 40px; top: 50%; z-index: 9000; transform: translateY(-50%); width: min(250px, calc(100vw - 64px)); padding: 12px 14px; background: var(--rev-p); border: 1px solid var(--rev-m); font-size: 14px; cursor: pointer; }
.rev-aviso1::after { content: ''; position: absolute; right: -6px; top: 50%; width: 10px; height: 10px; margin-top: -5px; background: var(--rev-p); border: solid var(--rev-m); border-width: 1px 1px 0 0; transform: rotate(45deg); }
.rev-panel { position: fixed; left: 0; right: 0; bottom: 0; z-index: 9001; display: grid; gap: 14px; max-height: 84vh; max-height: 84dvh; overflow-y: auto; overscroll-behavior: contain;
  padding: 18px 16px max(18px, env(safe-area-inset-bottom)); background: var(--rev-p); border-top: 1px solid var(--rev-m); box-shadow: 0 -10px 30px rgba(23, 28, 48, .16); font-size: 15px; }
.rev-panel[hidden] { display: none; }
@media (min-width: 768px) { .rev-panel { left: auto; right: 16px; bottom: 16px; width: 390px; max-height: calc(100dvh - 104px); border: 1px solid var(--rev-m); } }
.rev-cab { display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 4px 12px; }
.rev-l { display: block; font-size: 11px; font-weight: 650; font-stretch: 112%; letter-spacing: .09em; text-transform: uppercase; color: var(--rev-t2); }
.rev-tit { grid-column: 1; margin: 0; font-size: 26px; font-weight: 800; font-stretch: 80%; text-transform: uppercase; line-height: .95; }
.rev-x { grid-row: 1 / span 2; grid-column: 2; width: 42px; height: 42px; border: 1px solid var(--rev-m); background: transparent; font-size: 22px; line-height: 1; cursor: pointer; }
.rev-x:hover { background: var(--rev-m); color: #fff; }
.rev-intro { margin: 0; color: var(--rev-t2); font-size: 14px; }
.rev-caja { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--rev-m); background: #fff; }
.rev-donde { display: grid; gap: 2px; }
.rev-donde span:last-child { font-weight: 600; }
.rev-sobre { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: start; padding: 8px 10px; background: var(--rev-p); border-left: 3px solid var(--rev-c); }
.rev-sobre q { grid-column: 1; font-size: 14px; }
.rev-sobre button { grid-row: 1 / span 2; grid-column: 2; border: 0; background: none; font-size: 18px; cursor: pointer; padding: 0 4px; }
.rev-texto { width: 100%; min-height: 88px; resize: vertical; padding: 10px 12px; border: 1px solid var(--rev-l); background: #fff; font-size: 16px !important; line-height: 1.4; }
.rev-texto:focus, .rev-nombre:focus { outline: 2px solid var(--rev-c); outline-offset: -1px; border-color: transparent; }
.rev-fila { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rev-b { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; padding: 0 12px; border: 1px solid var(--rev-m); background: transparent; font-weight: 650; font-size: 15px; text-decoration: none; cursor: pointer; }
.rev-b:hover { background: var(--rev-m); color: #fff; }
.rev-b--lleno { background: var(--rev-c); border-color: var(--rev-c); color: #fff; }
.rev-b--lleno:hover { background: var(--rev-m); border-color: var(--rev-m); }
.rev-lista { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; counter-reset: rev; }
.rev-lista li { counter-increment: rev; display: grid; grid-template-columns: 26px 1fr auto; gap: 2px 10px; padding: 10px 0; border-bottom: 1px solid var(--rev-l); font-size: 14px; }
.rev-lista li::before { content: counter(rev); grid-row: 1 / span 3; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--rev-c); color: #fff; font-size: 12px; font-weight: 700; }
.rev-lista small { grid-column: 2; color: var(--rev-t2); font-size: 12px; }
.rev-lista q { grid-column: 2; color: var(--rev-t2); font-style: italic; }
.rev-lista p { grid-column: 2; margin: 0; white-space: pre-wrap; }
.rev-lista button { grid-column: 3; grid-row: 1; border: 0; background: none; color: var(--rev-t2); font-size: 18px; cursor: pointer; padding: 0 4px; }
.rev-envio { display: grid; gap: 10px; }
.rev-envio[hidden] { display: none; }
.rev-nombre { width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid var(--rev-l); background: #fff; font-size: 16px !important; }
.rev-fila3 { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 6px; }
.rev-mini { justify-self: start; border: 0; background: none; padding: 0; color: var(--rev-t2); font-size: 13px; text-decoration: underline; cursor: pointer; }
.rev-guia { position: fixed; left: 10px; right: 10px; top: max(10px, env(safe-area-inset-top)); z-index: 9002; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 10px 10px 14px; background: var(--rev-m); color: #fff; font-size: 14px; font-weight: 600; }
.rev-guia button { flex: none; min-height: 38px; padding: 0 12px; border: 1px solid rgba(255, 255, 255, .5); background: none; color: #fff; cursor: pointer; }
@media (min-width: 768px) { .rev-guia { left: 50%; right: auto; width: 520px; transform: translateX(-50%); } }
.rev-marco { position: fixed; z-index: 9001; pointer-events: none; outline: 2px solid var(--rev-c, #2C428E); outline-offset: 2px; background: rgba(44, 66, 142, .08); transition: all .12s; }
.rev--senalando, .rev--senalando * { cursor: crosshair !important; }
@media (prefers-reduced-motion: no-preference) { .rev-panel:not([hidden]) { animation: rev-sube .3s cubic-bezier(.2, .8, .2, 1); } }
@keyframes rev-sube { from { transform: translateY(16px); opacity: 0; } }
`;
  const estilo = document.createElement('style');
  estilo.textContent = css;
  document.head.append(estilo);

  const raiz = document.createElement('div');
  raiz.className = 'rev';
  raiz.innerHTML = `
<button class="rev-tab" type="button" aria-expanded="false" aria-controls="rev-panel">Proponer cambios <b></b></button>
<section class="rev-panel" id="rev-panel" role="dialog" aria-labelledby="rev-tit" data-lenis-prevent hidden>
  <div class="rev-cab">
    <span class="rev-l">Versión de prueba · revisión</span>
    <h2 class="rev-tit" id="rev-tit">¿Qué cambiarías?</h2>
    <button class="rev-x" type="button" aria-label="Cerrar">×</button>
  </div>
  <p class="rev-intro">Esta es la web nueva de ${esc(WEB)} antes de publicarla. Apunta lo que esté mal o falte (cifras, nombres, años, textos, fotos) y, cuando acabes, mándalo todo junto.</p>
  <div class="rev-caja">
    <div class="rev-donde"><span class="rev-l">Dónde</span><span data-donde></span></div>
    <div class="rev-sobre" data-sobre-caja hidden><span class="rev-l">Sobre</span><q data-sobre></q><button type="button" data-sobre-quitar aria-label="Quitar">×</button></div>
    <label class="rev-l" for="rev-texto">Qué hay que cambiar</label>
    <textarea class="rev-texto" id="rev-texto" data-texto rows="3" placeholder="Ej.: este año no es 2019, la obra se acabó en 2021."></textarea>
    <div class="rev-fila">
      <button class="rev-b" type="button" data-senalar>Señalar en la web</button>
      <button class="rev-b rev-b--lleno" type="button" data-anadir>Añadir nota</button>
    </div>
  </div>
  <ol class="rev-lista" data-lista></ol>
  <div class="rev-envio" data-envio hidden>
    <span class="rev-l">Cuando acabes, envía las notas</span>
    <input class="rev-nombre" data-nombre type="text" placeholder="Tu nombre" autocomplete="name">
    <div class="rev-fila3">
      <a class="rev-b rev-b--lleno" data-wa target="_blank" rel="noopener">WhatsApp</a>
      <a class="rev-b" data-correo>Correo</a>
      <button class="rev-b" type="button" data-copiar>Copiar</button>
    </div>
    <button class="rev-mini" type="button" data-vaciar>Borrar todas las notas</button>
  </div>
</section>`;
  document.body.append(raiz);

  const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (raiz.querySelector(s));
  const tab = $('.rev-tab'), panel = $('.rev-panel'), lista = $('[data-lista]'), envio = $('[data-envio]');
  const texto = /** @type {HTMLTextAreaElement} */ ($('[data-texto]'));
  const nombre = /** @type {HTMLInputElement} */ ($('[data-nombre]'));
  const wa = /** @type {HTMLAnchorElement} */ ($('[data-wa]')), correo = /** @type {HTMLAnchorElement} */ ($('[data-correo]'));
  const copiar = $('[data-copiar]');
  let donde = '', sobre = '';

  const mensaje = () => {
    const l = [`Cambios para la web nueva de ${WEB}`];
    if (estado.nombre) l.push(`De: ${estado.nombre}`);
    l.push(location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, ''), '');
    estado.notas.forEach((n, i) => {
      l.push(`${i + 1}. ${n.donde}`);
      if (n.sobre) l.push(`   Sobre: ${n.sobre}`);
      l.push(`   ${n.texto.replace(/\n/g, '\n   ')}`, '');
    });
    return l.join('\n').trim();
  };

  const pintar = () => {
    const n = estado.notas.length;
    tab.querySelector('b').textContent = n ? String(n) : '';
    $('[data-donde]').textContent = donde;
    $('[data-sobre]').textContent = sobre;
    $('[data-sobre-caja]').hidden = !sobre;
    lista.innerHTML = estado.notas.map((x, i) => `<li><small>${esc(x.donde)}</small>${x.sobre ? `<q>${esc(x.sobre)}</q>` : ''}<p>${esc(x.texto)}</p><button type="button" data-borrar="${i}" aria-label="Borrar la nota ${i + 1}">×</button></li>`).join('');
    envio.hidden = !n;
    nombre.value = estado.nombre;
    const m = mensaje();
    wa.href = `https://wa.me/?text=${encodeURIComponent(m)}`;
    correo.href = `mailto:?subject=${encodeURIComponent(`Cambios para la web nueva de ${WEB}`)}&body=${encodeURIComponent(m)}`;
  };

  const abrir = (/** @type {boolean} */ si, mantener = false) => {
    if (si && !mantener) { donde = dondeAhora(); sobre = ''; }
    panel.hidden = !si;
    raiz.classList.toggle('rev--abierto', si);
    tab.setAttribute('aria-expanded', String(si));
    if (si) { pintar(); texto.focus({ preventScroll: true }); }
    aviso1?.remove();
  };

  tab.addEventListener('click', () => abrir(true));
  $('.rev-x').addEventListener('click', () => abrir(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) abrir(false); });
  $('[data-sobre-quitar]').addEventListener('click', () => { sobre = ''; pintar(); });
  $('[data-anadir]').addEventListener('click', () => {
    const t = texto.value.trim();
    if (!t) { texto.focus(); return; }
    estado.notas.push({ donde, sobre, texto: t });
    guardar();
    texto.value = ''; sobre = '';
    pintar();
    lista.lastElementChild?.scrollIntoView({ block: 'nearest' });
  });
  lista.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-borrar]');
    if (!b) return;
    estado.notas.splice(Number(b.getAttribute('data-borrar')), 1);
    guardar(); pintar();
  });
  nombre.addEventListener('input', () => { estado.nombre = nombre.value.trim(); guardar(); pintar(); });
  copiar.addEventListener('click', async () => {
    const m = mensaje();
    let ok = false;
    try { await navigator.clipboard.writeText(m); ok = true; } catch {
      const t = document.createElement('textarea');
      t.value = m; t.style.cssText = 'position:fixed;opacity:0';
      raiz.append(t); t.select();
      try { ok = document.execCommand('copy'); } catch { /* nada */ }
      t.remove();
    }
    copiar.textContent = ok ? 'Copiado' : 'No se pudo';
    setTimeout(() => { copiar.textContent = 'Copiar'; }, 2200);
  });
  $('[data-vaciar]').addEventListener('click', () => {
    if (!confirm('¿Borrar todas las notas? Hazlo solo si ya las has enviado.')) return;
    estado.notas = []; guardar(); pintar();
  });

  // ---------- señalar un texto o una foto de la página ----------
  const marco = document.createElement('div');
  marco.className = 'rev-marco';
  marco.hidden = true;
  const guia = document.createElement('div');
  guia.className = 'rev-guia';
  guia.innerHTML = '<span>Toca el texto o la foto que quieres cambiar</span><button type="button">Cancelar</button>';
  const BLOQUE = 'p, h1, h2, h3, h4, li, dt, dd, th, td, figcaption, blockquote, label, a, button, text';

  /** Qué hay bajo el dedo: el texto del bloque, o la foto. */
  const cita = (/** @type {Element} */ el) => {
    const foto = (/** @type {HTMLImageElement} */ i) => `Foto${i.alt ? `: ${limpio(i.alt, 80)}` : ` (${(i.currentSrc || i.src).split('/').pop()})`}`;
    const b = el.closest(BLOQUE);
    const t = limpio(b?.textContent || '', 100);
    const img = /** @type {HTMLImageElement | null} */ (el.closest('img'));
    if (img) return `${foto(img)}${t ? ` (en «${limpio(t, 60)}»)` : ''}`;
    if (t) return `«${t}»`;
    const cerca = /** @type {HTMLImageElement | null | undefined} */ (el.closest('figure, picture, [class*="foto"]')?.querySelector('img'));
    if (cerca) return foto(cerca);
    if (el.closest('canvas')) return 'El dibujo animado';
    if (el.closest('svg')) return 'El dibujo';
    // un contenedor grande no dice nada concreto: solo se cita si es pequeño
    return el.children.length <= 2 && limpio(el.textContent, 100) ? `«${limpio(el.textContent, 100)}»` : '';
  };
  /** @param {Event} e */
  const debajo = (e) => {
    const t = /** @type {Element | null} */ (e.target);
    return t && !t.closest('.rev-guia') ? t : null;
  };
  /** @param {PointerEvent} e */
  const mover = (e) => {
    const t = debajo(e);
    if (!t) { marco.hidden = true; return; }
    const r = (t.closest('img') || t.closest(BLOQUE) || t).getBoundingClientRect();
    Object.assign(marco.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    marco.hidden = false;
  };
  /** @param {Event} e */
  const elegir = (e) => {
    const t = debajo(e);
    if (!t) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (e.type !== 'click') return;
    salir();
    sobre = cita(t);
    donde = dondeAhora();
    abrir(true, true);
  };
  const tragar = (/** @type {Event} */ e) => { if (debajo(e)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
  const salir = () => {
    raiz.classList.remove('rev--senalando');
    document.documentElement.classList.remove('rev--senalando');
    marco.remove(); guia.remove();
    removeEventListener('pointermove', mover, true);
    removeEventListener('click', elegir, true);
    removeEventListener('pointerdown', tragar, true);
    removeEventListener('mousedown', tragar, true);
  };
  guia.querySelector('button')?.addEventListener('click', () => { salir(); abrir(true, true); });
  $('[data-senalar]').addEventListener('click', () => {
    abrir(false);
    raiz.classList.add('rev--senalando');
    document.documentElement.classList.add('rev--senalando');
    raiz.append(marco, guia);
    addEventListener('pointermove', mover, true);
    addEventListener('click', elegir, true);
    addEventListener('pointerdown', tragar, true);
    addEventListener('mousedown', tragar, true);
  });

  // ---------- primera visita: una pista al lado del botón ----------
  /** @type {HTMLElement | null} */
  let aviso1 = null;
  if (!estado.visto) {
    setTimeout(() => {
      if (!panel.hidden) return;
      aviso1 = document.createElement('div');
      aviso1.className = 'rev-aviso1';
      aviso1.innerHTML = '<span class="rev-l">Versión de prueba</span>Si ves algo que cambiar, pulsa «Proponer cambios» y apúntalo.';
      aviso1.addEventListener('click', () => abrir(true));
      raiz.append(aviso1);
      estado.visto = true; guardar();
      setTimeout(() => aviso1?.remove(), 9000);
    }, 2500);
  }

  pintar();
})();
