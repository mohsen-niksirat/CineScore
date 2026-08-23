/**
 * build_starter.js — Offline bootstrap data builder for CineScore v2.
 *
 * Builds the initial dataset WITHOUT any network access:
 *   1. Extracts the ~7000 title seed (imdb id, title, year, type, rating, votes)
 *      from the Cinema (Movie Finder) app's embedded ARCHIVE.
 *   2. Extracts the rich 152-entry fallback DB from the old CineScore index.html
 *      and merges its details into matching seed records.
 *   3. Writes:
 *        scripts/seed.json        — bootstrap seed for the crawler
 *        public/titles.json       — compact search index (app fetches this first)
 *        public/db.json           — full detail records (app lazy-loads + caches)
 *        scripts/fallback.json    — offline fallback DB (embedded in index.html)
 *
 * Usage:
 *   node scripts/build_starter.js [path-to-cinema-index.html] [path-to-cinescore-index.html]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function readArg(i, fallback) {
  const p = process.argv[i + 2];
  return p ? path.resolve(p) : path.join(ROOT, fallback);
}

const CINEMA_HTML = readArg(0, '../Cinema-main/index.html'); // relative to scripts/
const CINESCORE_HTML = readArg(1, 'index.html');

// ---------------------------------------------------------------- helpers
function parseCinema(html) {
  const start = html.indexOf('const ARCHIVE=');
  if (start < 0) throw new Error('const ARCHIVE= not found in Cinema index.html');
  const s = start + 'const ARCHIVE='.length;
  const end = html.indexOf('};', s) + 1;
  const arch = JSON.parse(html.slice(s, end));
  const seed = [];
  const links = [];
  const seen = new Set();
  const push = (m, tp) => {
    const i = m.i || m.id;
    if (!i || seen.has(i)) return;
    seen.add(i);
    seed.push({
      i,
      t: m.t || '',
      y: parseInt(m.y, 10) || 0,
      tp,
      r: parseFloat(m.r) || 0,
      v: parseInt(String(m.v || '0').replace(/,/g, ''), 10) || 0,
      se: tp === 's' ? (m.seasons || []).reduce((mx, x) => Math.max(mx, parseInt(x.num, 10) || 0), 0) : 0
    });
    // download links (used by the Download popup in CineScore)
    const hasLinks = (m.l && m.l.length) || (m.seasons && m.seasons.length);
    if (hasLinks) {
      const rec = { i, tp };
      if (m.l && m.l.length) rec.l = m.l;
      if (m.seasons && m.seasons.length) rec.seasons = m.seasons;
      links.push(rec);
    }
  };
  (arch.m || []).forEach(m => push(m, 'm'));
  (arch.s || []).forEach(m => push(m, 's'));
  return { seed, links };
}

function parseCineScore(html) {
  const start = html.indexOf('var DB=[');
  if (start < 0) {
    // the new CineScore index.html embeds the fallback inside its script —
    // but we still have the extracted fallback from the previous build.
    const fbFile = path.join(ROOT, 'scripts', 'fallback.json');
    if (fs.existsSync(fbFile)) {
      const mapped = JSON.parse(fs.readFileSync(fbFile, 'utf8'));
      // mapped entries are already unified records; unify keys back to old shape
      return mapped.map(r => ({
        id: r.i, t: r.t, y: r.y, tp: r.tp === 's' ? 'series' : 'movie',
        imdb: r.r, rtp: r.rt ? r.rt + '%' : 'N/A', meta: r.mc ? String(r.mc) : 'N/A',
        dir: r.dir || 'N/A', wr: r.wr || 'N/A', ac: (r.ac || []).join(', ') || 'N/A',
        pl: r.pl || 'N/A', lang: r.lo || 'N/A', co: r.co || 'N/A', aw: r.aw || 'N/A',
        bo: r.bo || 'N/A', prod: r.pr || 'N/A', poster: r.p || '',
        seasons: r.se ? String(r.se) : '', episodes: r.ep || null
      }));
    }
    console.warn('WARN: var DB=[ not found in CineScore index.html and no scripts/fallback.json; using empty fallback.');
    return [];
  }
  const s = start + 'var DB=['.length;
  const end = html.indexOf('];', s);
  const body = html.slice(s, end);
  // entries are JS object literals (unquoted keys, trailing commas) -> evaluate
  // as data (trusted file, build-time only). Each entry is pure data.
  return new Function('return [' + body + '];')();
}

// old CineScore entry -> unified detail record
function num(x) {
  const n = parseInt(String(x || '').replace('%', '').replace('/100', ''), 10);
  return isNaN(n) ? null : n;
}
function mapOld(e) {
  const rec = {
    i: e.id,
    t: e.t,
    y: parseInt(e.y, 10) || 0,
    tp: e.tp === 'series' ? 's' : 'm',
    r: parseFloat(e.imdb) || 0,
    p: e.poster || '',
    g: e.g || '',
    dir: e.dir && e.dir !== 'N/A' ? e.dir : '',
    wr: e.wr && e.wr !== 'N/A' ? e.wr : '',
    ac: e.ac && e.ac !== 'N/A' ? e.ac.split(',').map(x => x.trim()).filter(Boolean) : [],
    pl: e.pl && e.pl !== 'N/A' ? e.pl : '',
    aw: e.aw && e.aw !== 'N/A' ? e.aw : '',
    bo: e.bo && e.bo !== 'N/A' ? e.bo : '',
    lo: e.lang && e.lang !== 'N/A' ? e.lang : '',
    co: e.co && e.co !== 'N/A' ? e.co : '',
    pr: e.prod && e.prod !== 'N/A' ? e.prod : '',
    rm: 0,
    se: parseInt(e.seasons, 10) || 0,
    ep: e.episodes || null // only present in fallback data
  };
  const rt = num(e.rtp), mc = num(e.meta);
  if (rt !== null && rt > 0) rec.rt = rt;
  if (mc !== null && mc > 0) rec.mc = mc;
  const rm = parseInt(String(e.rt || '').replace(/[^0-9]/g, ''), 10);
  if (!isNaN(rm) && rm > 0) rec.rm = rm;
  return rec;
}

// ---------------------------------------------------------------- main
function main() {
  if (!fs.existsSync(PUBLIC)) fs.mkdirSync(PUBLIC, { recursive: true });

  const cinemaHtml = fs.readFileSync(CINEMA_HTML, 'utf8');
  const { seed, links } = parseCinema(cinemaHtml);
  console.log(`Seed titles from Cinema: ${seed.length}`);
  console.log(`Titles with download links: ${links.length}`);

  const csHtml = fs.readFileSync(CINESCORE_HTML, 'utf8');
  const oldDb = parseCineScore(csHtml);
  console.log(`Fallback entries from old CineScore: ${oldDb.length}`);

  const fallback = oldDb.map(mapOld);

  // merge rich fallback details into seed map (keyed by imdb id) —
  // fallback values win when present (e.g. series year is often empty in Cinema data)
  const byId = new Map(seed.map(x => [x.i, x]));
  let merged = 0;
  for (const f of fallback) {
    const target = byId.get(f.i);
    if (target) {
      for (const k of Object.keys(f)) {
        if (k === 'ep' || k === 'i') continue;
        const v = f[k];
        const has = Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && v !== '' && v !== 0);
        if (has) target[k] = v;
      }
      merged++;
    }
  }
  console.log(`Rich details merged into seed: ${merged}`);

  // seed.json — for the crawler bootstrap
  const seedOut = seed.map(x => ({ i: x.i, t: x.t, y: x.y, tp: x.tp, r: x.r, v: x.v, se: x.se || 0 }));
  fs.writeFileSync(path.join(ROOT, 'scripts', 'seed.json'), JSON.stringify(seedOut));
  console.log('scripts/seed.json written');

  // public/db.json — unified records (minus fallback-only `ep`, keep it small)
  const dbItems = seed.map(x => {
    const r = Object.assign({}, x);
    delete r.ep; // episodes stay in fallback only
    return r;
  });
  const now = new Date().toISOString();
  fs.writeFileSync(path.join(PUBLIC, 'db.json'), JSON.stringify({ updated: now, items: dbItems }));
  console.log(`public/db.json written (${dbItems.length} items)`);

  // public/titles.json — compact search index
  const titles = dbItems.map(x => ({ i: x.i, t: x.t, y: x.y, tp: x.tp, r: x.r, v: x.v || 0, p: x.p || '' }));
  fs.writeFileSync(path.join(PUBLIC, 'titles.json'), JSON.stringify({ updated: now, items: titles }));
  console.log(`public/titles.json written (${titles.length} titles)`);

  // public/links.json — download links (imdb id -> links/seasons), used by the
  // Download popup. Fetched lazily by the app, cached in IndexedDB.
  fs.writeFileSync(path.join(PUBLIC, 'links.json'), JSON.stringify({ updated: now, items: links }));
  console.log(`public/links.json written (${links.length} items)`);

  // scripts/fallback.json — full fallback (with episodes) for embedding in index.html
  fs.writeFileSync(path.join(ROOT, 'scripts', 'fallback.json'), JSON.stringify(fallback));
  console.log('scripts/fallback.json written');
  console.log('\nDone. Next: embed scripts/fallback.json into index.html as FALLBACK.');
}

main();
