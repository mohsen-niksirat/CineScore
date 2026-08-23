// Generate professional PWA icons (PNG) with pure Node - no dependencies.
// Renders an SVG-like scene into an RGBA buffer via a tiny rasterizer,
// supersamples 4x for anti-aliasing, and encodes PNG with zlib.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---------- tiny PNG encoder ----------
const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- tiny software rasterizer ----------
const SS = 4;
class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Float32Array(w * h * 4); }
  blend(x, y, r, g, b, a) {
    if (a <= 0) return;
    const i = (y * this.w + x) * 4;
    const da = this.d[i + 3];
    const oa = a + da * (1 - a);
    if (oa === 0) return;
    this.d[i] = (r * a + this.d[i] * da * (1 - a)) / oa;
    this.d[i + 1] = (g * a + this.d[i + 1] * da * (1 - a)) / oa;
    this.d[i + 2] = (b * a + this.d[i + 2] * da * (1 - a)) / oa;
    this.d[i + 3] = oa;
  }
  fillRect(x0, y0, x1, y1, r, g, b, a) {
    for (let y = Math.max(0, y0 | 0); y < Math.min(this.h, y1 | 0); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(this.w, x1 | 0); x++)
        this.blend(x, y, r, g, b, a);
  }
  roundRect(x0, y0, x1, y1, rr, r, g, b, a) {
    for (let y = Math.max(0, y0 | 0); y < Math.min(this.h, y1 | 0); y++) {
      for (let x = Math.max(0, x0 | 0); x < Math.min(this.w, x1 | 0); x++) {
        const cx = x < x0 + rr ? x0 + rr : (x > x1 - rr ? x1 - rr : x);
        const cy = y < y0 + rr ? y0 + rr : (y > y1 - rr ? y1 - rr : y);
        const dx = x - cx, dy = y - cy;
        const inR = (x >= x0 + rr && x <= x1 - rr) || (y >= y0 + rr && y <= y1 - rr);
        if (inR || dx * dx + dy * dy <= rr * rr) this.blend(x, y, r, g, b, a);
      }
    }
  }
  circle(cx, cy, rad, r, g, b, a) {
    const r2 = rad * rad;
    for (let y = Math.max(0, (cy - rad) | 0); y < Math.min(this.h, (cy + rad + 1) | 0); y++)
      for (let x = Math.max(0, (cx - rad) | 0); x < Math.min(this.w, (cx + rad + 1) | 0); x++) {
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 <= r2) this.blend(x, y, r, g, b, a);
      }
  }
  ring(cx, cy, rad, width, r, g, b, a) {
    const r0 = rad - width / 2, r1 = rad + width / 2;
    for (let y = Math.max(0, (cy - r1) | 0); y < Math.min(this.h, (cy + r1 + 1) | 0); y++)
      for (let x = Math.max(0, (cx - r1) | 0); x < Math.min(this.w, (cx + r1 + 1) | 0); x++) {
        const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
        if (d >= r0 && d <= r1) this.blend(x, y, r, g, b, a);
      }
  }
  tri(cx, cy, rad, r, g, b, a) {
    const h = rad * 1.6, w2 = rad * 1.05;
    for (let y = Math.max(0, (cy - h / 2) | 0); y < Math.min(this.h, (cy + h / 2 + 1) | 0); y++) {
      const t = (y - (cy - h / 2)) / h;
      const xOff = w2 * (1 - Math.abs(t - 0.5) * 2);
      for (let x = Math.max(0, (cx - w2) | 0); x < Math.min(this.w, (cx + xOff + 1) | 0); x++)
        this.blend(x, y, r, g, b, a);
    }
  }
  downscale(factor) {
    const nw = this.w / factor, nh = this.h / factor;
    const out = new Float32Array(nw * nh * 4);
    const f2 = factor * factor;
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < factor; dy++) for (let dx = 0; dx < factor; dx++) {
        const i = ((y * factor + dy) * this.w + (x * factor + dx)) * 4;
        r += this.d[i]; g += this.d[i + 1]; b += this.d[i + 2]; a += this.d[i + 3];
      }
      const o = (y * nw + x) * 4;
      out[o] = r / f2; out[o + 1] = g / f2; out[o + 2] = b / f2; out[o + 3] = a / f2;
    }
    return out;
  }
}
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

// ---------- scene ----------
// Design: dark rounded backdrop, red glow, white film reel ring with
// perforation holes, red core with white play triangle.
function render(size, opts) {
  const S = size * SS;
  const c = new Canvas(S, S);
  const m = S / 512;
  const [d1, d2] = [hex('#151527'), hex('#0a0a15')];
  for (let y = 0; y < S; y++) {
    const t = y / S;
    c.fillRect(0, y, S, y + 1,
      d1[0] + (d2[0] - d1[0]) * t, d1[1] + (d2[1] - d1[1]) * t, d1[2] + (d2[2] - d1[2]) * t, 1);
  }
  const glow = hex('#e50914');
  for (let gx = 0; gx < S; gx += 2) for (let gy = 0; gy < S; gy += 2) {
    const dx = (gx - 256 * m) / (215 * m), dy = (gy - 262 * m) / (215 * m);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1.6) { const a = Math.max(0, 1 - d / 1.6) * 0.38; c.blend(gx, gy, glow[0], glow[1], glow[2], a); }
  }
  const inset = opts.maskable ? 0 : 40 * m;
  const rr = opts.maskable ? 0 : 108 * m;
  const grd = hex('#1c1c36');
  c.roundRect(inset, inset, S - inset, S - inset, rr, grd[0], grd[1], grd[2], 0.97);

  const cx = 256 * m, cy = 262 * m;
  const white = hex('#f5f5f7');
  c.ring(cx, cy, 168 * m, 30 * m, white[0], white[1], white[2], 0.95);
  c.ring(cx, cy, 118 * m, 10 * m, white[0], white[1], white[2], 0.85);
  const red = hex('#e50914');
  c.circle(cx, cy, 96 * m, red[0], red[1], red[2], 1);
  const rim = hex('#b20710');
  c.ring(cx, cy, 96 * m, 8 * m, rim[0], rim[1], rim[2], 0.8);
  c.tri(cx + 10 * m, cy, 52 * m, white[0], white[1], white[2], 1);
  const holes = 12;
  const holeCol = hex('#0d0d1a');
  for (let i = 0; i < holes; i++) {
    const a = (i / holes) * Math.PI * 2 - Math.PI / 2;
    c.circle(cx + Math.cos(a) * 168 * m, cy + Math.sin(a) * 168 * m, 16 * m, holeCol[0], holeCol[1], holeCol[2], 0.95);
  }

  const out = c.downscale(SS);
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = Math.round(out[i * 4]);
    buf[i * 4 + 1] = Math.round(out[i * 4 + 1]);
    buf[i * 4 + 2] = Math.round(out[i * 4 + 2]);
    buf[i * 4 + 3] = Math.round(out[i * 4 + 3] * 255);
  }
  return buf;
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), encodePNG(192, 192, render(192, { maskable: false })));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), encodePNG(512, 512, render(512, { maskable: false })));
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), encodePNG(512, 512, render(512, { maskable: true })));
console.log('icons written:', fs.readdirSync(outDir).join(', '));
