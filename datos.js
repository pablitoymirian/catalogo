/* Datos compartidos del catálogo (página pública y panel de administrador).
   CONFIG: completar con el Project URL y la clave anon/publishable de Supabase.
   Si quedan vacíos, todo funciona en "modo prueba": los cambios se guardan solo en este navegador. */
const CONFIG = {
  SUPABASE_URL: 'https://merikwzhdfcutkiotiya.supabase.co',
  SUPABASE_KEY: 'sb_publishable_lR6vhQ3Y2azQA4XlbDMYlg_vZJFFyxn',
  BUCKET: 'catalogo',
};
const MODO_PRUEBA = !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY;

/* ¿El catálogo está publicado para los clientes? (interruptor del panel) */
async function leerPublicado() {
  if (MODO_PRUEBA) return true;
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/catalogo_config?select=publicado&id=eq.1`, { headers: { apikey: CONFIG.SUPABASE_KEY }, cache: 'no-cache' });
    if (!r.ok) return false;
    const d = await r.json();
    return !!(d[0] && d[0].publicado);
  } catch (e) { return false; }
}
/* ¿Quien mira tiene la sesión de administrador abierta en este navegador? */
async function hayAdminConectado() {
  if (MODO_PRUEBA) return false;
  try {
    const ref = new URL(CONFIG.SUPABASE_URL).hostname.split('.')[0];
    const s = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) || 'null');
    const tok = s && (s.access_token || (s.currentSession && s.currentSession.access_token));
    if (!tok) return false;
    const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/catalogo_admins?select=user_id`, { headers: { apikey: CONFIG.SUPABASE_KEY, Authorization: 'Bearer ' + tok }, cache: 'no-cache' });
    if (!r.ok) return false;
    return (await r.json()).length > 0;
  } catch (e) { return false; }
}

const SUC = [
  { id: 'oviedo', n: 'Coronel Oviedo', t: '0982200814' },
  { id: 'caaguazu', n: 'Caaguazú', t: '0986440028' },
  { id: 'villarrica', n: 'Villarrica', t: '0981890082' },
  { id: 'campo9', n: 'Campo 9', t: '0981898387' },
];
const SORDER = ['Peluquería profesional', 'Maquillaje', 'Skincare', 'Uñas', 'Cuidado del cabello', 'Perfumes y desodorantes', 'Cuidado corporal', 'Higiene personal', 'Bebés y niños', 'Accesorios y bijou', 'Almacén y hogar', 'Otros productos'];
const RORDER = { 'Peluquería profesional': ['Coloración', 'Oxidantes', 'Decolorantes', 'Matizadores y tonalizantes', 'Alisados y keratinas', 'Tratamientos y máscaras', 'Ampollas', 'Shampoo y acondicionador tamaño salón', 'Finalizadores', 'Permanentes', 'Herramientas eléctricas', 'Artículos de peluquería', 'Barbería'] };

const $ = (id) => document.getElementById(id);
const gs = (n) => 'Gs. ' + String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const nz = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = (s) => nz(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }

let D = null;            // productos.json tal como viene
let ORIG = new Map();    // id -> producto original (sin cambios)

/* Saca el número entre paréntesis que el sistema agrega al final del nombre */
const limpiarNombre = (s) => String(s).replace(/\s*\(\s*\d+\s*\)\s*$/, '').trim();

async function cargarBase() {
  const r = await fetch('productos.json', { cache: 'no-cache' });
  D = await r.json();
  ORIG = new Map();
  D.prods.forEach((a) => {
    const o = { id: String(a[9] || a[1]), n: limpiarNombre(a[0]), p: a[2], s: D.sec[a[3]], r: D.rub[a[4]], m: D.mk[a[5]] || '', l: D.lin[a[6]] || '', i: a[7], il: !!a[8], f: '', oc: false, nuevo: false };
    ORIG.set(o.id, o);
  });
  return D;
}

/* ---- Cambios guardados por el administrador ---- */
async function leerCambios() {
  if (MODO_PRUEBA) return Object.values(load('pym_cat_cambios_prueba', {}));
  let out = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/catalogo_cambios?select=*&order=cod`, {
      headers: { apikey: CONFIG.SUPABASE_KEY, Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY, Range: `${desde}-${desde + 999}` },
      cache: 'no-cache',
    });
    if (!r.ok) throw new Error('cambios ' + r.status);
    const d = await r.json();
    out = out.concat(d);
    if (d.length < 1000) break;
  }
  return out;
}

/* Une la lista original con los cambios. Devuelve la lista final (incluye ocultos, marcados con oc). */
function aplicarCambios(cambios) {
  const map = new Map();
  ORIG.forEach((o, id) => map.set(id, { ...o }));
  (cambios || []).forEach((c) => {
    const id = String(c.cod);
    let p = map.get(id);
    if (!p) {
      if (!c.nuevo) return;
      p = { id, n: '', p: 0, s: 'Otros productos', r: 'Otros', m: '', l: '', i: -1, il: false, f: '', oc: false, nuevo: true };
      map.set(id, p);
    }
    if (c.nombre) p.n = c.nombre;
    if (c.precio != null && c.precio !== '') p.p = Number(c.precio);
    if (c.seccion) p.s = c.seccion;
    if (c.rubro) p.r = c.rubro;
    if (c.marca != null && c.marca !== '') p.m = c.marca;
    if (c.foto_url) { p.f = c.foto_url; p.il = false; }
    p.oc = !!c.oculto;
    p.cambio = c;
  });
  const out = [...map.values()];
  out.forEach((p) => { p.q = nz([p.n, p.id, p.m, p.l].join(' ')); });
  return out;
}

/* Pone la foto del producto como fondo de un elemento */
function pic(el, p) {
  el.style.backgroundImage = ''; el.style.backgroundSize = ''; el.style.backgroundPosition = '';
  if (p.f) {
    el.style.backgroundImage = `url("${p.f}")`;
    el.style.backgroundSize = 'contain'; el.style.backgroundPosition = 'center';
    return;
  }
  if (p.i == null || p.i < 0) { el.classList.add('sinfoto'); return; }
  el.classList.remove('sinfoto');
  const N = D.n, h = Math.floor(p.i / (N * N)), k = p.i % (N * N), c = k % N, r = Math.floor(k / N);
  el.style.backgroundImage = `url(img/h${String(h).padStart(2, '0')}.webp)`;
  el.style.backgroundSize = `${N * 100}% ${N * 100}%`;
  el.style.backgroundPosition = `${(c / (N - 1)) * 100}% ${(r / (N - 1)) * 100}%`;
}

function ordenarSecciones(lista) {
  const extra = [...new Set(lista.map((p) => p.s))].filter((s) => !SORDER.includes(s)).sort();
  const todas = [...SORDER.slice(0, -1), ...extra, SORDER[SORDER.length - 1]];
  return todas.filter((s) => lista.some((p) => p.s === s));
}
