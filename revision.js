// @ts-check
// Capa de revisión para las copias de prueba de las webs (nunca va en la web real).
// La añade herramientas/subir-mava-prueba.mjs antes de </body>:
//   <script src="revision.js" data-web="Mava 2000" data-clave="mava2000" data-api="https://…workers.dev" defer></script>
//
// Pensada para que la use cualquiera, también alguien mayor, desde el móvil:
//   1. botón grande «Corregir» (abajo a la derecha);
//   2. «Toca lo que está mal»: la persona toca el texto, la cifra o la foto;
//   3. escribe cómo debería ser y pulsa «Guardar corrección».
// Cada corrección se guarda en el servidor de notas (herramientas/notas-web, Cloudflare) con la página, la sección y
// lo que se señaló; el responsable las gestiona en su panel y las baja al repo con «npm run notas-web».
// Si no hay conexión, se guardan en el navegador y se envían solas en cuanto se pueda.
(() => {
  const yo = /** @type {HTMLScriptElement | null} */ (document.currentScript);
  const WEB = yo?.dataset.web || document.title.split('|').pop()?.trim() || 'la web';
  const CLAVE = yo?.dataset.clave || 'web';
  const API = (yo?.dataset.api || '').replace(/\/$/, '');

  // ---------- memoria del navegador (nombre, id de autor y lo que falta por enviar) ----------
  const leer = (/** @type {string} */ k, /** @type {any} */ d) => { try { const v = localStorage.getItem(`revision:${CLAVE}:${k}`); return v ? JSON.parse(v) : d; } catch { return d; } };
  const escribir = (/** @type {string} */ k, /** @type {any} */ v) => { try { localStorage.setItem(`revision:${CLAVE}:${k}`, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
  let autor = leer('autor', '');
  if (!/^[\w-]{8,64}$/.test(autor)) {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    autor = [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 20);
    escribir('autor', autor);
  }
  let nombre = leer('nombre', '');
  /** @type {object[]} */
  let cola = leer('cola', []);

  const limpio = (/** @type {string | null | undefined} */ t, max = 90) => {
    const s = (t || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
  };
  const esc = (/** @type {string} */ t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c);

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
      || s.querySelector('h1, h2')?.textContent || s.querySelector('.etq')?.textContent || s.id, 60).replace(/\.$/, '');
  };
  /** La sección más interior que contiene el elemento o, sin él, la que cruza la línea del 45 % de la pantalla. */
  const seccionDe = (/** @type {Element | null} */ el) => {
    const SEL = 'main section, main header, body > section';
    if (el) { const s = el.closest(SEL); if (s && !s.closest('.rev')) return s; }
    const y = innerHeight * 0.45;
    let mejor = /** @type {Element | null} */ (null);
    for (const s of document.querySelectorAll(SEL)) {
      if (s.closest('.rev')) continue;
      const r = s.getBoundingClientRect();
      if (r.height && r.top <= y && r.bottom >= y) mejor = s;
    }
    return mejor;
  };
  /** @param {Element | null} el */
  const lugar = (el) => {
    const s = seccionDe(el);
    const archivo = location.pathname.split('/').pop() || 'index.html';
    const conId = s && (s.id ? s : s.closest('[id]'));
    return { pagina: pagina(), seccion: s ? nombreDe(s) : '', url: `${archivo}${conId?.id ? `#${conId.id}` : ''}` };
  };

  // ---------- qué se ha señalado ----------
  const BLOQUE = 'p, h1, h2, h3, h4, li, dt, dd, th, td, figcaption, blockquote, label, a, button, text';
  const cita = (/** @type {Element} */ el) => {
    const foto = (/** @type {HTMLImageElement} */ i) => `Foto${i.alt ? `: ${limpio(i.alt, 80)}` : ` (${(i.currentSrc || i.src).split('/').pop()})`}`;
    const b = el.closest(BLOQUE);
    // innerText respeta los saltos de línea de lo que se ve (textContent pegaría «2024Estado»)
    const t = limpio(b ? (b instanceof HTMLElement ? b.innerText.replace(/\s*\n+\s*/g, ' · ') : b.textContent) : '', 100);
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
  const recuadroDe = (/** @type {Element} */ t) => (t.closest('img') || t.closest(BLOQUE) || t).getBoundingClientRect();

  // ---------- servidor ----------
  const enviar = async (/** @type {object} */ nota) => {
    if (!API) throw new Error('sin servidor');
    const r = await fetch(`${API}/api/notas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nota) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { const e = new Error(j.error || 'No se ha podido guardar'); /** @type {any} */ (e).definitivo = r.status >= 400 && r.status < 500 && r.status !== 429; throw e; }
    return j.nota;
  };
  const vaciarCola = async () => {
    if (!cola.length || !API) return;
    const quedan = [];
    for (const n of cola) { try { await enviar(n); } catch (e) { if (!/** @type {any} */ (e).definitivo) quedan.push(n); } }
    cola = quedan;
    escribir('cola', cola);
  };
  const misNotas = async () => {
    if (!API) return [];
    const r = await fetch(`${API}/api/notas?web=${encodeURIComponent(CLAVE)}&autor=${encodeURIComponent(autor)}`);
    const j = await r.json().catch(() => ({}));
    return j.ok ? j.notas : [];
  };
  const borrarMia = async (/** @type {number} */ id) => {
    const r = await fetch(`${API}/api/notas/${id}?autor=${encodeURIComponent(autor)}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || 'No se ha podido borrar');
  };

  // ---------- interfaz ----------
  const css = `
.rev, .rev * { box-sizing: border-box; }
.rev { --rev-m: var(--marino, #242B46); --rev-c: var(--cobalto, #2C428E); --rev-p: var(--papel-2, #F7F6F2); --rev-t2: var(--tinta-2, #525870); --rev-l: rgba(36, 43, 70, .22); --rev-ok: #2E6B3F;
  font-family: inherit; color: var(--rev-m); line-height: 1.45; -webkit-text-size-adjust: 100%; }
.rev :where(button, input, textarea) { font: inherit; color: inherit; }
.rev [hidden] { display: none !important; }
.rev-ico { width: 22px; height: 22px; flex: none; }
.rev-fab { position: fixed; right: 10px; bottom: calc(max(10px, env(safe-area-inset-bottom)) + 60px); z-index: 9000; display: inline-flex; align-items: center; gap: 10px;
  min-height: 54px; padding: 0 20px 0 16px; border: 2px solid #fff; background: var(--rev-m); color: #fff; font-size: 17px; font-weight: 700; cursor: pointer;
  box-shadow: 0 6px 18px rgba(23, 28, 48, .28); }
.rev-fab:hover, .rev-fab:focus-visible { background: var(--rev-c); }
@media (min-width: 1024px) { .rev-fab { right: 24px; bottom: 24px; } }
.rev--abierto .rev-fab, .rev--senalando .rev-fab { display: none; }
.rev-pista { position: fixed; right: 10px; bottom: calc(max(10px, env(safe-area-inset-bottom)) + 124px); z-index: 9000; width: min(300px, calc(100vw - 20px)); padding: 14px 16px;
  background: #fff; border: 2px solid var(--rev-m); font-size: 16px; cursor: pointer; box-shadow: 0 6px 18px rgba(23, 28, 48, .18); }
.rev-pista b { display: block; font-size: 17px; margin-bottom: 2px; }
.rev-pista::after { content: ''; position: absolute; right: 40px; bottom: -9px; width: 14px; height: 14px; background: #fff; border: solid var(--rev-m); border-width: 0 2px 2px 0; transform: rotate(45deg); }
@media (min-width: 1024px) { .rev-pista { right: 24px; bottom: 92px; } }
.rev-hoja { position: fixed; left: 0; right: 0; bottom: 0; z-index: 9001; max-height: 88vh; max-height: 88dvh; overflow-y: auto; overscroll-behavior: contain;
  padding: 20px 18px max(20px, env(safe-area-inset-bottom)); background: var(--rev-p); border-top: 2px solid var(--rev-m); box-shadow: 0 -10px 30px rgba(23, 28, 48, .2); font-size: 17px; }
.rev-hoja[hidden] { display: none; }
@media (min-width: 768px) { .rev-hoja { left: auto; right: 24px; bottom: 24px; width: 440px; max-height: calc(100dvh - 110px); border: 2px solid var(--rev-m); } }
.rev-cab { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.rev-tit { margin: 0; font-size: 28px; font-weight: 800; font-stretch: 85%; line-height: 1.05; }
.rev-x { flex: none; display: grid; place-items: center; width: 50px; height: 50px; border: 2px solid var(--rev-m); background: #fff; cursor: pointer; }
.rev-x:hover { background: var(--rev-m); color: #fff; }
.rev-cuerpo { display: grid; gap: 16px; }
.rev-donde { margin: 0; font-size: 15px; color: var(--rev-t2); }
.rev-donde b { color: var(--rev-m); font-weight: 650; }
.rev-senal { display: grid; gap: 6px; padding: 12px 14px; background: #fff; border: 2px solid var(--rev-c); }
.rev-senal[hidden] { display: none; }
.rev-senal span { font-size: 14px; font-weight: 700; color: var(--rev-c); text-transform: uppercase; letter-spacing: .06em; }
.rev-senal q { quotes: none; font-size: 17px; font-weight: 600; }
.rev-campo { display: grid; gap: 6px; }
.rev-campo[hidden] { display: none; }
.rev-campo label { font-size: 18px; font-weight: 700; }
.rev-campo small { font-size: 15px; color: var(--rev-t2); }
.rev-texto, .rev-nombre { width: 100%; padding: 12px 14px; border: 2px solid var(--rev-l); background: #fff; font-size: 18px !important; line-height: 1.4; }
.rev-texto { min-height: 130px; resize: vertical; }
.rev-nombre { min-height: 54px; }
.rev-texto:focus, .rev-nombre:focus { outline: 3px solid var(--rev-c); outline-offset: 0; border-color: var(--rev-c); }
.rev-b { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 58px; padding: 0 16px; border: 2px solid var(--rev-m); background: #fff;
  font-size: 18px; font-weight: 700; text-align: center; cursor: pointer; }
.rev-b:hover { background: var(--rev-m); color: #fff; }
.rev-b--lleno { background: var(--rev-c); border-color: var(--rev-c); color: #fff; }
.rev-b--lleno:hover { background: var(--rev-m); border-color: var(--rev-m); }
.rev-b[disabled] { opacity: .6; cursor: wait; }
.rev-enlace { justify-self: start; border: 0; background: none; padding: 6px 0; font-size: 16px; font-weight: 600; color: var(--rev-c); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.rev-error { margin: 0; padding: 10px 12px; background: #FBEAEA; border-left: 4px solid #B3261E; font-size: 16px; }
.rev-error[hidden] { display: none; }
.rev-hecho { display: grid; gap: 16px; text-align: center; padding: 8px 0 4px; }
.rev-hecho svg { justify-self: center; width: 64px; height: 64px; color: var(--rev-ok); }
.rev-hecho h3 { margin: 0; font-size: 26px; font-weight: 800; }
.rev-hecho p { margin: 0; color: var(--rev-t2); }
.rev-lista { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.rev-lista li { display: grid; gap: 4px; padding: 14px 0; border-bottom: 1px solid var(--rev-l); font-size: 16px; }
.rev-lista small { font-size: 14px; color: var(--rev-t2); }
.rev-lista q { quotes: none; font-style: italic; color: var(--rev-t2); }
.rev-lista p { margin: 0; white-space: pre-wrap; }
.rev-estado { justify-self: start; padding: 2px 10px; font-size: 14px; font-weight: 700; border: 1.5px solid currentColor; }
.rev-estado--hecha { color: var(--rev-ok); }
.rev-estado--descartada { color: var(--rev-t2); }
.rev-estado--pendiente { color: var(--rev-c); }
.rev-resp { padding: 8px 10px; background: #fff; border-left: 3px solid var(--rev-ok); font-size: 15px; }
.rev-guia { position: fixed; left: 10px; right: 10px; top: max(10px, env(safe-area-inset-top)); z-index: 9002; display: grid; gap: 12px; padding: 16px; background: var(--rev-m); color: #fff;
  box-shadow: 0 8px 24px rgba(23, 28, 48, .3); }
.rev-guia p { margin: 0; font-size: 19px; font-weight: 700; line-height: 1.3; }
.rev-guia small { display: block; margin-top: 4px; font-size: 15px; font-weight: 450; opacity: .85; }
.rev-guia div { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rev-guia button { min-height: 50px; padding: 0 10px; border: 2px solid rgba(255, 255, 255, .7); background: none; color: #fff; font-size: 16px; font-weight: 650; cursor: pointer; }
.rev-guia button:hover { background: #fff; color: var(--rev-m); }
@media (min-width: 768px) { .rev-guia { left: 50%; right: auto; width: 560px; transform: translateX(-50%); } }
.rev-marco { position: fixed; z-index: 9001; pointer-events: none; outline: 3px solid var(--rev-c); outline-offset: 3px; background: rgba(44, 66, 142, .1); }
.rev-marco[hidden] { display: none; }
.rev--senalando, .rev--senalando * { cursor: pointer !important; }
@media (prefers-reduced-motion: no-preference) { .rev-hoja:not([hidden]) { animation: rev-sube .28s cubic-bezier(.2, .8, .2, 1); } }
@keyframes rev-sube { from { transform: translateY(16px); opacity: 0; } }
`;
  const estilo = document.createElement('style');
  estilo.textContent = css;
  document.head.append(estilo);

  const LAPIZ = '<svg class="rev-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  const CRUZ = '<svg class="rev-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const raiz = document.createElement('div');
  raiz.className = 'rev';
  raiz.innerHTML = `
<button class="rev-fab" type="button" aria-haspopup="dialog">${LAPIZ}Corregir</button>
<section class="rev-hoja" role="dialog" aria-labelledby="rev-tit" data-lenis-prevent hidden>
  <div class="rev-cab"><h2 class="rev-tit" id="rev-tit">Corregir la web</h2><button class="rev-x" type="button" aria-label="Cerrar">${CRUZ}</button></div>
  <div class="rev-cuerpo" data-paso="escribir">
    <p class="rev-donde">Estás en <b data-donde></b></p>
    <div class="rev-senal" data-senal hidden><span>Lo que has tocado</span><q data-cita></q></div>
    <div class="rev-campo" data-campo-nombre>
      <label for="rev-nombre">Tu nombre</label>
      <input class="rev-nombre" id="rev-nombre" data-nombre type="text" autocomplete="name" placeholder="Por ejemplo: Ana">
    </div>
    <div class="rev-campo">
      <label for="rev-texto">¿Qué está mal y cómo debería ser?</label>
      <textarea class="rev-texto" id="rev-texto" data-texto rows="4" placeholder="Por ejemplo: no son 47 personas, somos 52."></textarea>
    </div>
    <p class="rev-error" data-error role="alert" hidden></p>
    <button class="rev-b rev-b--lleno" type="button" data-guardar>Guardar corrección</button>
    <button class="rev-b" type="button" data-otra-vez>Tocar otra cosa de la página</button>
    <button class="rev-enlace" type="button" data-ver-mias>Ver mis correcciones</button>
  </div>
  <div class="rev-cuerpo" data-paso="hecho" hidden>
    <div class="rev-hecho">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <h3>Guardada. ¡Gracias!</h3>
      <p data-hecho-texto>Queda apuntada para corregirla.</p>
    </div>
    <button class="rev-b rev-b--lleno" type="button" data-otra>Corregir otra cosa</button>
    <button class="rev-b" type="button" data-cerrar>Seguir mirando la web</button>
  </div>
  <div class="rev-cuerpo" data-paso="mias" hidden>
    <p class="rev-donde" data-mias-resumen></p>
    <ol class="rev-lista" data-lista></ol>
    <button class="rev-b" type="button" data-volver>Volver</button>
  </div>
</section>`;
  document.body.append(raiz);

  const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (raiz.querySelector(s));
  const fab = $('.rev-fab'), hoja = $('.rev-hoja');
  const texto = /** @type {HTMLTextAreaElement} */ ($('[data-texto]'));
  const campoNombre = $('[data-campo-nombre]'), inNombre = /** @type {HTMLInputElement} */ ($('[data-nombre]'));
  const error = $('[data-error]'), guardar = /** @type {HTMLButtonElement} */ ($('[data-guardar]'));
  /** @type {{ pagina: string, seccion: string, url: string }} */
  let donde = lugar(null);
  let sobre = '';

  const paso = (/** @type {string} */ p) => raiz.querySelectorAll('[data-paso]').forEach((d) => { /** @type {HTMLElement} */ (d).hidden = d.getAttribute('data-paso') !== p; });
  const pintar = () => {
    $('[data-donde]').textContent = donde.seccion ? `${donde.pagina} › ${donde.seccion}` : donde.pagina;
    $('[data-cita]').textContent = sobre;
    $('[data-senal]').hidden = !sobre;
    campoNombre.hidden = !!nombre;
    inNombre.value = nombre;
    error.hidden = true;
  };
  const abrir = (/** @type {boolean} */ si) => {
    hoja.hidden = !si;
    raiz.classList.toggle('rev--abierto', si);
    pista?.remove();
    if (si) { pintar(); paso('escribir'); setTimeout(() => (nombre ? texto : inNombre).focus({ preventScroll: true }), 50); }
  };

  // ---------- señalar: lo primero al pulsar «Corregir» ----------
  const marco = document.createElement('div');
  marco.className = 'rev-marco';
  marco.hidden = true;
  const guia = document.createElement('div');
  guia.className = 'rev-guia';
  guia.innerHTML = '<p>Toca lo que está mal<small>Un texto, una cifra, un nombre o una foto.</small></p><div><button type="button" data-solo>Escribir sin tocar</button><button type="button" data-cancelar>Cancelar</button></div>';
  const debajo = (/** @type {Event} */ e) => { const t = /** @type {Element | null} */ (e.target); return t && !t.closest('.rev-guia') ? t : null; };
  const mover = (/** @type {PointerEvent} */ e) => {
    const t = debajo(e);
    if (!t || e.pointerType === 'touch') { marco.hidden = true; return; }
    const r = recuadroDe(t);
    Object.assign(marco.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    marco.hidden = false;
  };
  const tragar = (/** @type {Event} */ e) => { if (debajo(e)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
  const elegir = (/** @type {Event} */ e) => {
    const t = debajo(e);
    if (!t) return;
    tragar(e);
    salir();
    sobre = cita(t);
    donde = lugar(t);
    abrir(true);
  };
  const salir = () => {
    raiz.classList.remove('rev--senalando');
    document.documentElement.classList.remove('rev--senalando');
    marco.remove(); guia.remove();
    removeEventListener('pointermove', mover, true);
    removeEventListener('click', elegir, true);
    removeEventListener('pointerdown', tragar, true);
    removeEventListener('mousedown', tragar, true);
  };
  const senalar = () => {
    abrir(false);
    raiz.classList.add('rev--senalando');
    document.documentElement.classList.add('rev--senalando');
    raiz.append(marco, guia);
    addEventListener('pointermove', mover, true);
    addEventListener('click', elegir, true);
    addEventListener('pointerdown', tragar, true);
    addEventListener('mousedown', tragar, true);
  };
  guia.querySelector('[data-cancelar]')?.addEventListener('click', salir);
  guia.querySelector('[data-solo]')?.addEventListener('click', () => { salir(); sobre = ''; donde = lugar(null); abrir(true); });

  // ---------- guardar ----------
  guardar.addEventListener('click', async () => {
    const t = texto.value.trim();
    if (!nombre) {
      const n = inNombre.value.trim();
      if (!n) { error.textContent = 'Escribe tu nombre, así sabremos de quién es la corrección.'; error.hidden = false; inNombre.focus(); return; }
      nombre = n.slice(0, 80); escribir('nombre', nombre);
    }
    if (!t) { error.textContent = 'Escribe qué hay que cambiar.'; error.hidden = false; texto.focus(); return; }
    const nota = { web: CLAVE, ...donde, sobre, texto: t, nombre, autor };
    guardar.disabled = true; guardar.textContent = 'Guardando…'; error.hidden = true;
    let msg = 'Queda apuntada para corregirla.';
    try { await enviar(nota); } catch (e) {
      if (/** @type {any} */ (e).definitivo) { error.textContent = /** @type {Error} */ (e).message; error.hidden = false; guardar.disabled = false; guardar.textContent = 'Guardar corrección'; return; }
      cola.push(nota); escribir('cola', cola);
      msg = 'Ahora mismo no hay conexión: está guardada en este móvil y se enviará sola la próxima vez que abras la web.';
    }
    guardar.disabled = false; guardar.textContent = 'Guardar corrección';
    texto.value = ''; sobre = '';
    $('[data-hecho-texto]').textContent = msg;
    paso('hecho');
    vaciarCola();
  });
  $('[data-otra]').addEventListener('click', senalar);
  $('[data-otra-vez]').addEventListener('click', senalar);
  $('[data-cerrar]').addEventListener('click', () => abrir(false));
  $('.rev-x').addEventListener('click', () => { abrir(false); });
  addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (raiz.classList.contains('rev--senalando')) salir(); else if (!hoja.hidden) abrir(false); });
  fab.addEventListener('click', senalar);

  // ---------- mis correcciones ----------
  const ESTADOS = { pendiente: 'Pendiente', hecha: 'Corregida', descartada: 'No se cambia' };
  const lista = $('[data-lista]');
  const verMias = async () => {
    paso('mias');
    const resumen = $('[data-mias-resumen]');
    resumen.textContent = 'Cargando…';
    lista.innerHTML = '';
    let notas = [];
    try { notas = await misNotas(); } catch { resumen.textContent = 'No se han podido cargar ahora. Prueba dentro de un rato.'; return; }
    const sinEnviar = cola.length ? ` ${cola.length} esperando conexión.` : '';
    resumen.textContent = notas.length ? `Has guardado ${notas.length} ${notas.length === 1 ? 'corrección' : 'correcciones'}.${sinEnviar}` : `Todavía no has guardado ninguna.${sinEnviar}`;
    lista.innerHTML = notas.map((n) => `<li>
      <span class="rev-estado rev-estado--${esc(n.estado)}">${esc(ESTADOS[/** @type {keyof typeof ESTADOS} */ (n.estado)] || n.estado)}</span>
      <small>${esc(n.pagina)}${n.seccion ? ` › ${esc(n.seccion)}` : ''}</small>
      ${n.sobre ? `<q>${esc(n.sobre)}</q>` : ''}
      <p>${esc(n.texto)}</p>
      ${n.respuesta ? `<div class="rev-resp">${esc(n.respuesta)}</div>` : ''}
      ${n.estado === 'pendiente' ? `<button class="rev-enlace" type="button" data-borrar="${Number(n.id)}">Borrar esta corrección</button>` : ''}
    </li>`).join('');
  };
  $('[data-ver-mias]').addEventListener('click', verMias);
  $('[data-volver]').addEventListener('click', () => { pintar(); paso('escribir'); });
  lista.addEventListener('click', async (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-borrar]');
    if (!b || !confirm('¿Borrar esta corrección?')) return;
    try { await borrarMia(Number(b.getAttribute('data-borrar'))); verMias(); } catch (err) { alert(/** @type {Error} */ (err).message); }
  });

  // ---------- primera visita: una pista encima del botón ----------
  /** @type {HTMLElement | null} */
  let pista = null;
  if (!leer('visto', false)) {
    setTimeout(() => {
      if (!hoja.hidden || raiz.classList.contains('rev--senalando')) return;
      pista = document.createElement('div');
      pista.className = 'rev-pista';
      pista.innerHTML = `<b>Esta web es una prueba</b>Si ves algo que no está bien, pulsa «Corregir» y tócalo.`;
      pista.addEventListener('click', () => { pista?.remove(); senalar(); });
      raiz.append(pista);
      escribir('visto', true);
      setTimeout(() => pista?.remove(), 12000);
    }, 2500);
  }

  vaciarCola();
})();
