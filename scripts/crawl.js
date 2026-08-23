/**
 * crawl.js — nightly crawler for CineScore v2.
 *
 * Aggregates live data from three free sources and commits it into the repo,
 * so every app user fetches the SAME pre-built dataset (no per-user API quota):
 *
 *   TMDB        — bulk enrichment: tmdb id, poster/backdrop, rating/votes,
 *                 genres, runtime, overview, top cast, trailer (YouTube key)
 *   OMDb        — Rotten Tomatoes + Metacritic + IMDb votes/awards/box-office.
 *                 Free tier = 1000 req/day -> processed incrementally across
 *                 runs (budget per run, resume via crawl_state.json).
 *   Wikipedia   — lead-section extract + page link (interesting info).
 *
 * Outputs:
 *   public/db.json      — full unified detail records (app lazy-loads, caches in IndexedDB)
 *   public/titles.json  — compact search index (app loads first, caches in localStorage)
 *   public/crawl_state.json — resume state (done-sets, timestamps)
 *
 * Run:   node scripts/crawl.js
 * Env:   OMDB_KEY, TMDB_KEY, OMDB_BUDGET (default 800), WIKI_BUDGET (default 2000),
 *        TMDB_NEW_MAX (default 250), SKIP_TMDB=1
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const SEED_FILE = path.join(__dirname, 'seed.json');
const DB_FILE = path.join(PUBLIC, 'db.json');
const TITLES_FILE = path.join(PUBLIC, 'titles.json');
const STATE_FILE = path.join(PUBLIC, 'crawl_state.json');

const OMDB_KEY = process.env.OMDB_KEY || 'a6a22901';
const TMDB_KEY = process.env.TMDB_KEY || '3ecc5636799c19193a8d5be489096f30';
const OMDB_BUDGET = parseInt(process.env.OMDB_BUDGET || '800', 10);
const WIKI_BUDGET = parseInt(process.env.WIKI_BUDGET || '2000', 10);
const TMDB_NEW_MAX = parseInt(process.env.TMDB_NEW_MAX || '250', 10);
const SKIP_TMDB = process.env.SKIP_TMDB === '1';

const IMG = 'https://image.tmdb.org/t/p/';

// ------------------------------------------------------------------ http
function fetch(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'CineScoreCrawler/2.0 (movie data aggregator; https://github.com/mohsen-niksirat/CineScore)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetch(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} ${url}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`Timeout: ${url}`)));
  });
}

async function fetchJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const body = await fetch(url);
      return JSON.parse(body);
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ TMDB
function tmdb(pathname, params = {}) {
  const qs = new URLSearchParams({ api_key: TMDB_KEY, ...params });
  return fetchJSON(`https://api.themoviedb.org/3${pathname}?${qs}`);
}

const ytKey = (videos) => {
  if (!videos || !videos.results) return '';
  const v = videos.results.find((x) => x.site === 'YouTube' && x.type === 'Trailer')
    || videos.results.find((x) => x.site === 'YouTube');
  return v ? v.key : '';
};

async function tmdbEnrich(rec) {
  // map imdb -> tmdb
  const found = await tmdb(`/find/${encodeURIComponent(rec.i)}`, { external_source: 'imdb_id' });
  const isMovie = rec.tp === 'm';
  const hit = isMovie
    ? (found.movie_results || [])[0]
    : (found.tv_results || [])[0];
  if (!hit) return false;

  const tmid = hit.id;
  const kind = isMovie ? 'movie' : 'tv';
  const [detail, credits, videos] = await Promise.all([
    tmdb(`/${kind}/${tmid}`),
    tmdb(`/${kind}/${tmid}/credits`),
    tmdb(`/${kind}/${tmid}/videos`).catch(() => null)
  ]);

  rec.tmid = tmid;
  rec.tm = detail.vote_average || 0;
  rec.tv = detail.vote_count || 0;
  if (detail.backdrop_path) rec.b = IMG + 'w1280' + detail.backdrop_path;
  if (detail.poster_path && !rec.p) rec.p = IMG + 'w500' + detail.poster_path;
  if (detail.genres && detail.genres.length && !rec.g) {
    rec.g = detail.genres.map((x) => x.name).join(', ');
  }
  if (detail.runtime && !rec.rm) rec.rm = detail.runtime;
  if (isMovie && detail.release_date && !rec.y) rec.y = parseInt(detail.release_date.slice(0, 4), 10) || 0;
  if (!isMovie && detail.first_air_date && !rec.y) rec.y = parseInt(detail.first_air_date.slice(0, 4), 10) || 0;
  if (detail.overview && !rec.pl) rec.pl = detail.overview.slice(0, 900);
  if (!isMovie && detail.number_of_seasons && !rec.se) rec.se = detail.number_of_seasons;
  if (credits && credits.cast && !rec.ac) {
    rec.ac = credits.cast.slice(0, 8).map((c) => c.name);
  }
  const yt = ytKey(videos);
  if (yt && !rec.yt) rec.yt = yt;
  return true;
}

// pull fresh titles from TMDB lists (popular / top_rated / trending)
async function tmdbNewTitles(existingIds) {
  const out = [];
  const pages = [
    ['/movie/popular', 'm'],
    ['/movie/top_rated', 'm'],
    ['/tv/popular', 's'],
    ['/tv/top_rated', 's'],
    ['/trending/movie/week', 'm'],
    ['/trending/tv/week', 's']
  ];
  for (const [endpoint, tp] of pages) {
    for (let page = 1; page <= 2; page++) {
      let j;
      try {
        j = await tmdb(endpoint, { page });
      } catch { break; }
      for (const item of j.results || []) {
        const tmid = item.id;
        // resolve imdb id lazily; TMDB lists don't include it
        if (out.some((x) => x.tmid === tmid)) continue;
        const rec = {
          i: '', t: item.title || item.name || '', y: parseInt((item.release_date || item.first_air_date || '').slice(0, 4), 10) || 0,
          tp, r: 0, v: 0, se: 0, tmid
        };
        if (rec.t && !existingIds.has(tmid) && out.length < TMDB_NEW_MAX) out.push(rec);
      }
      await sleep(150);
    }
  }
  return out;
}

// ------------------------------------------------------------------ OMDb
function parseOmdbRatings(ratings) {
  const out = {};
  for (const x of ratings || []) {
    if (x.Source === 'Rotten Tomatoes') {
      const n = parseInt(x.Value, 10);
      if (!isNaN(n)) out.rt = n;
    } else if (x.Source === 'Metacritic') {
      const n = parseInt(x.Value, 10);
      if (!isNaN(n)) out.mc = n;
    }
  }
  return out;
}

async function omdbEnrich(rec) {
  const j = await fetchJSON(
    `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${encodeURIComponent(rec.i)}&plot=short`
  );
  if (!j || j.Response === 'False') return false;
  const { rt, mc } = parseOmdbRatings(j.Ratings);
  if (rt) rec.rt = rt;
  if (mc) rec.mc = mc;
  const r = parseFloat(j.imdbRating);
  if (!isNaN(r) && r > 0) rec.r = r;
  const v = parseInt(String(j.imdbVotes || '').replace(/,/g, ''), 10);
  if (!isNaN(v) && v > 0) rec.v = v;
  if (j.Director && j.Director !== 'N/A' && !rec.dir) rec.dir = j.Director;
  if (j.Writer && j.Writer !== 'N/A' && !rec.wr) rec.wr = j.Writer;
  if (j.Actors && j.Actors !== 'N/A' && !rec.ac) {
    rec.ac = j.Actors.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8);
  }
  if (j.Plot && j.Plot !== 'N/A' && !rec.pl) rec.pl = j.Plot.slice(0, 900);
  if (j.Genre && j.Genre !== 'N/A' && !rec.g) rec.g = j.Genre;
  if (j.Awards && j.Awards !== 'N/A' && !rec.aw) rec.aw = j.Awards;
  if (j.BoxOffice && j.BoxOffice !== 'N/A' && j.BoxOffice !== '$0' && !rec.bo) rec.bo = j.BoxOffice;
  if (j.Language && j.Language !== 'N/A' && !rec.lo) rec.lo = j.Language;
  if (j.Country && j.Country !== 'N/A' && !rec.co) rec.co = j.Country;
  if (j.Production && j.Production !== 'N/A' && !rec.pr) rec.pr = j.Production;
  const rm = parseInt(String(j.Runtime || '').replace(/[^0-9]/g, ''), 10);
  if (!isNaN(rm) && rm > 0 && !rec.rm) rec.rm = rm;
  if (j.totalSeasons && !rec.se) rec.se = parseInt(j.totalSeasons, 10) || 0;
  return true;
}

// ------------------------------------------------------------------ Wikipedia
async function wikiEnrich(rec) {
  const title = rec.t.replace(/\(.*?\)/g, '').trim();
  const tryTitle = async (t) => {
    const j = await fetchJSON(
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts%7Cpageimages&exintro&explaintext&exlimit=1&redirects=1&format=json&origin=*&titles=${encodeURIComponent(t)}`,
      1
    );
    const pages = j && j.query && j.query.pages ? Object.values(j.query.pages) : [];
    const p = pages[0];
    if (!p || !p.extract) return null;
    return {
      we: p.extract.length > 800 ? p.extract.slice(0, 800) + '…' : p.extract,
      wl: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
      wimg: p.thumbnail && p.thumbnail.source ? p.thumbnail.source : ''
    };
  };
  let r = await tryTitle(title);
  if (!r && rec.y) r = await tryTitle(`${title} (${rec.tp === 's' ? 'TV series' : 'film'})`);
  if (!r) r = await tryTitle(`${title} (film)`);
  if (r) {
    rec.we = r.we;
    rec.wl = r.wl;
    if (r.wimg) rec.wimg = r.wimg;
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ state
function loadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn('WARN: could not read', file, e.message);
  }
  return fallback;
}

function main() {
  if (!fs.existsSync(PUBLIC)) fs.mkdirSync(PUBLIC, { recursive: true });
  const seed = loadJSON(SEED_FILE, []);
  const db = loadJSON(DB_FILE, { updated: null, items: [] });
  const state = loadJSON(STATE_FILE, { omdbDone: [], wikiDone: [], lastRun: null });

  const byId = new Map();
  for (const it of db.items) byId.set(it.i, it);
  for (const s of seed) {
    if (!s.i || byId.has(s.i)) continue;
    byId.set(s.i, { i: s.i, t: s.t, y: s.y || 0, tp: s.tp, r: s.r || 0, v: s.v || 0, se: s.se || 0 });
  }
  console.log(`Titles in dataset: ${byId.size}`);

  (async () => {
    const tmdbDone = new Set(state.tmdbDone || []);
    const omdbDone = new Set(state.omdbDone || []);
    const wikiDone = new Set(state.wikiDone || []);

    // ---- 0) new titles from TMDB lists (freshness) -------------------
    if (!SKIP_TMDB) {
      const existingTmdb = new Set([...byId.values()].map((x) => x.tmid).filter(Boolean));
      const fresh = await tmdbNewTitles(existingTmdb);
      let added = 0;
      for (const rec of fresh) {
        if (!rec.i) {
          // resolve imdb id via external_ids
          try {
            const ext = await tmdb(`/${rec.tp === 'm' ? 'movie' : 'tv'}/${rec.tmid}/external_ids`);
            if (ext.imdb_id) rec.i = ext.imdb_id;
          } catch { /* skip */ }
          await sleep(120);
        }
        if (!rec.i || byId.has(rec.i)) continue;
        byId.set(rec.i, rec);
        added++;
      }
      console.log(`TMDB lists: ${added} new titles`);
    }

    const items = [...byId.values()];

    // ---- 1) TMDB enrichment (bulk, cheap quota) ----------------------
    if (!SKIP_TMDB) {
      const need = items.filter((x) => !x.tmid && !tmdbDone.has(x.i));
      console.log(`TMDB enrich queue: ${need.length}`);
      let ok = 0, skip = 0;
      for (let k = 0; k < need.length; k++) {
        const rec = need[k];
        try {
          const done = await tmdbEnrich(rec);
          if (done) ok++; else skip++;
          tmdbDone.add(rec.i);
        } catch (e) {
          skip++;
          console.warn('TMDB fail', rec.i, rec.t, e.message);
        }
        if (k % 25 === 0) console.log(`  TMDB ${k + 1}/${need.length} (ok=${ok})`);
        await sleep(130); // ~7.7 req/s, well under TMDB's 50/s
      }
      console.log(`TMDB enrich done: ok=${ok} skip=${skip}`);
    }

    // ---- 2) OMDb enrichment (quota-limited, resume across runs) ------
    const pendingOmdb = items
      .filter((x) => !x.rt && !x.mc && !omdbDone.has(x.i))
      .sort((a, b) => (b.v || 0) - (a.v || 0));
    console.log(`OMDb pending: ${pendingOmdb.length}, budget: ${OMDB_BUDGET}`);
    let omdbOk = 0;
    for (let k = 0; k < Math.min(OMDB_BUDGET, pendingOmdb.length); k++) {
      const rec = pendingOmdb[k];
      try {
        if (await omdbEnrich(rec)) omdbOk++;
        else omdbDone.add(rec.i); // not found in OMDb -> don't retry
      } catch (e) {
        if (e.message.indexOf('401') !== -1) {
          console.error('OMDb key rejected (HTTP 401). Set a valid OMDB_KEY (GitHub Actions secret or env var) — current key will not work.');
        }
        console.warn('OMDb fail', rec.i, rec.t, e.message);
        break; // likely rate limit / network / bad key — stop for this run
      }
      omdbDone.add(rec.i);
      await sleep(1150); // stay under the ~60/min OMDb limit
    }
    console.log(`OMDb enriched this run: ${omdbOk}`);

    // ---- 3) Wikipedia enrichment (polite 1 rps) -----------------------
    const pendingWiki = items.filter((x) => !x.we && !wikiDone.has(x.i));
    console.log(`Wikipedia pending: ${pendingWiki.length}, budget: ${WIKI_BUDGET}`);
    let wikiOk = 0;
    let wikiBlocked = 0;
    for (let k = 0; k < Math.min(WIKI_BUDGET, pendingWiki.length); k++) {
      const rec = pendingWiki[k];
      try {
        if (await wikiEnrich(rec)) wikiOk++;
        wikiBlocked = 0;
      } catch (e) {
        console.warn('Wiki fail', rec.i, rec.t, e.message);
        if (e.message.indexOf('403') !== -1 || e.message.indexOf('429') !== -1) wikiBlocked++;
        else wikiBlocked = 0;
        if (wikiBlocked >= 8) {
          console.error('Wikipedia is blocking us (HTTP 403/429 x8). Stopping this phase — will resume next run.');
          break;
        }
      }
      wikiDone.add(rec.i);
      await sleep(1050);
    }
    console.log(`Wikipedia enriched this run: ${wikiOk}`);

    // ---- 4) write outputs ---------------------------------------------
    const sorted = items.sort((a, b) => (b.v || 0) - (a.v || 0));
    const now = new Date().toISOString();
    const out = { updated: now, items: sorted };
    fs.writeFileSync(DB_FILE, JSON.stringify(out));
    const titles = sorted.map((x) => ({ i: x.i, t: x.t, y: x.y || 0, tp: x.tp, r: x.r || 0, v: x.v || 0, p: x.p || '' }));
    fs.writeFileSync(TITLES_FILE, JSON.stringify({ updated: now, items: titles }));
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      omdbDone: [...omdbDone],
      wikiDone: [...wikiDone],
      tmdbDone: [...tmdbDone],
      lastRun: now
    }));
    console.log(`Wrote ${sorted.length} titles -> public/db.json, public/titles.json`);
  })().catch((e) => {
    console.error('Crawl failed:', e);
    process.exit(1);
  });
}

main();
