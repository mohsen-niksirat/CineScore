// Headless test harness: evals the app script with a minimal DOM stub and
// exercises the pure logic (fuzzy search, fallback data, verdicts).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// strip the bootstrapping IIFE (it needs real DOM events)
script = script.replace(/\(function init\(\) \{[\s\S]*?\}\)\(\);\s*$/, '');

function el() {
  return {
    addEventListener() {}, classList: { toggle() {}, add() {}, remove() {} },
    style: {}, dataset: {}, hidden: false, value: '', innerHTML: '', textContent: '',
    querySelectorAll() { return []; }, getContext() { return {}; }, focus() {}
  };
}
const sandbox = {
  console, setTimeout, clearTimeout, URLSearchParams, AbortController, Uint8Array, TextDecoder, Promise,
  fetch() { return Promise.reject(new Error('no network in test')); },
  indexedDB: { open() { return { onupgradeneeded: null, onsuccess: null, onerror: null }; } },
  localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } },
  navigator: {},
  location: { search: '', hash: '', origin: 'http://x', pathname: '/CineScore/' },
  document: {
    createElement() { return el(); },
    getElementById() { return el(); },
    querySelectorAll() { return []; },
    documentElement: { lang: 'en', dir: 'ltr', dataset: { theme: 'dark' } },
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {}
  },
  window: {}
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox, { filename: 'cinescore-app.js' });

const s = sandbox;
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗ FAIL:', name); }
}

// --- 1. fallback dataset integrity ---
console.log('\n[1] Fallback dataset');
check('FALLBACK has 152 entries', s.FALLBACK.length === 152);
const shaw = s.FALLBACK.find(x => x.i === 'tt0111161');
check('Shawshank in fallback with r=9.3', shaw && shaw.r === 9.3);
check('Shawshank has rt=91', shaw && shaw.rt === 91);
check('GOT series has episodes', s.FALLBACK.find(x => x.i === 'tt0944947') && !!s.FALLBACK.find(x => x.i === 'tt0944947').ep);

// --- 2. fuzzy search over fallback titles ---
console.log('\n[2] Fuzzy search');
s.TITLES = s.FALLBACK.map(f => ({ i: f.i, t: f.t, y: f.y || 0, tp: f.tp, r: f.r || 0, v: f.v || 0, p: f.p || '' }));
let res = s.fuzzySearch('shawsank', 5);
check('typo "shawsank" finds Shawshank first', res.length > 0 && res[0].i === 'tt0111161');

res = s.fuzzySearch('incepchun', 5);
check('typo "incepchun" finds Inception', res.length > 0 && res[0].i === 'tt1375666');

res = s.fuzzySearch('dark knight', 5);
check('"dark knight" finds The Dark Knight', res.length > 0 && res[0].i === 'tt0468569');

res = s.fuzzySearch('godfather', 10);
check('"godfather" finds The Godfather in top 3', res.length > 0 && res.slice(0, 3).some(x => x.i === 'tt0068646'));

res = s.fuzzySearch('parasit', 5);
check('"parasit" finds Parasite', res.length > 0 && res[0].i === 'tt6751668');

res = s.fuzzySearch('stranger things', 5);
check('"stranger things" finds Stranger Things', res.length > 0 && res[0].i === 'tt4574334');

res = s.fuzzySearch('xyzzy notamovie', 5);
check('garbage query returns nothing', res.length === 0);

// --- 3. scoring sanity ---
console.log('\n[3] scoreFuzzy');
check('exact match scores ~1', s.scoreFuzzy('inception', 'Inception') > 0.9);
check('prefix match high', s.scoreFuzzy('incep', 'Inception') > 0.85);
check('near-miss above threshold', s.scoreFuzzy('incepchun', 'Inception') > 0.3);
check('unrelated low score', s.scoreFuzzy('avatar', 'Fight Club') < 0.3);

// --- 4. ratings + verdict ---
console.log('\n[4] ratings & verdict');
const rec = { r: 9.3, rt: 91, mc: 82, tm: 8.7 };
const rl = s.ratingsList(rec);
check('ratingsList returns 4 sources', rl.length === 4);
const vb = s.verdictOf(rec);
check('verdict weighted avg 89 => Excellent', vb && vb.label === 'Excellent' && vb.avg === 89);
const vb2 = s.verdictOf({ r: 6.2, rt: 50 });
check('verdict 57 => Mixed', vb2 && vb2.label === 'Mixed' && vb2.avg === 57);
check('verdict null when no ratings', s.verdictOf({}) === null);

// --- 5. episode heatmap helpers ---
console.log('\n[5] episodes');
check('epColor gradient', s.epColor(9.2) === '#1a7a3a' && s.epColor(6.5) === '#e67e22');

console.log('\n========================================');
console.log(`PASS: ${pass}  FAIL: ${fail}`);
process.exit(fail ? 1 : 0);
