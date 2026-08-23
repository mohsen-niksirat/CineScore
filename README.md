<div align="center">

# 🎬 CineScore — سینما اسکور

**Movie & Series Analyzer — IMDb · Rotten Tomatoes · Metacritic · TMDB · Wikipedia**

[![Version](https://img.shields.io/badge/version-2.0-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()
[![HTML](https://img.shields.io/badge/single--file-HTML-orange.svg)]()
[![Search](https://img.shields.io/badge/fuzzy--search-brightgreen.svg)]()

🌐 **Live** → [CineScore](https://mohsen-niksirat.github.io/CineScore/)

</div>

---

## 🌍 Languages / زبان‌ها

| | Language |
|---|---|
| 🇬🇧 | [English](#english) |
| 🇮🇷 | [فارسی](#فارسی) |

---

## English

### ✨ What is CineScore v2?

A **live, multi-source** movie & series analyzer that runs as a **single HTML file** on GitHub Pages. No server, no install — open the link and search.

### 🧠 Key Features

| Feature | Description |
|---|---|
| 🔍 **Fuzzy Search** | Typo-tolerant, instant search over **7,000+ titles** with live suggestions |
| 📊 **Live Ratings** | IMDb, Rotten Tomatoes, Metacritic & TMDB scores side by side with animated bars |
| 🏆 **Overall Verdict** | Weighted aggregate score (computed live — no hardcoded texts) |
| 📚 **Interesting Info** | Wikipedia summary, keywords & trailer for each title |
| 📺 **Series Heatmap** | Per-season episode ratings grid |
| 🔗 **Deep Links** | One-click buttons to IMDb, Letterboxd, TMDB, Rotten Tomatoes & Wikipedia via IMDb ID |
| ⬇️ **Download Popup** | Direct download links for 7,000+ movies & series (SoftSub / Dubbed, per season) |
| ⚖️ **Compare Mode** | Side-by-side comparison of any two titles |
| 🌐 **Bilingual** | فارسی / English with RTL support |
| 💾 **Offline-friendly** | Embedded fallback DB + IndexedDB/localStorage caching |

### 🏗️ How It Works (crawled dataset)

Instead of every visitor hitting the APIs (which would burn the free quota), a **GitHub Actions crawler** (`scripts/crawl.js`) runs nightly and commits the aggregated dataset into this repo:

```
GitHub Actions (nightly)
  ├─ TMDB     → poster, backdrop, rating, cast, trailer (bulk, cheap)
  ├─ OMDb     → Rotten Tomatoes + Metacritic + awards (quota-limited, resumes daily)
  ├─ Wikipedia→ interesting lead-section summary
  └─ commits  → public/db.json (details) + public/titles.json (search index)
        │
        ▼
Every user fetches the SAME pre-built dataset once → cached in IndexedDB
Search & details are instant and offline — zero API calls per visitor.
```

### 🔑 API Keys

Keys are embedded in `index.html` (normal for a static GitHub Pages app — they are visible to visitors, so quotas are protected by the crawler architecture):

```javascript
var OMDB_KEY = 'your_omdb_key';     // https://www.omdbapi.com/  (free, 1000 req/day)
var TMDB_KEY = 'your_tmdb_key';     // https://www.themoviedb.org/ (free, API → v3)
```

For the crawler workflow you can also set repository secrets `OMDB_KEY` / `TMDB_KEY` (`.github/workflows/crawl.yml`); if unset it falls back to the embedded keys.

### 🚀 Local Run

```bash
# serve the folder (any static server works)
python -m http.server 8080
# or: npx serve .
```

Then open `http://localhost:8080`.

### 🧱 Project Structure

```
CineScore/
├── index.html              ← the whole app (single file)
├── public/
│   ├── titles.json         ← search index (fetched first, cached)
│   ├── db.json             ← full details (lazy-loaded, cached in IndexedDB)
│   └── links.json          ← download links (loaded on demand)
├── scripts/
│   ├── crawl.js            ← nightly crawler (TMDB + OMDb + Wikipedia)
│   ├── build_starter.js    ← offline bootstrap builder (seed/fallback/links)
│   ├── seed.json           ← bootstrap title list (7,000 titles)
│   └── test.js             ← headless logic tests (node scripts/test.js)
└── .github/workflows/crawl.yml
```

### ⚖️ License

MIT

---

## فارسی

### ✨ سینما اسکور v2 چیه؟

یه **تحلیلگر زنده و چندمنبعی** برای فیلم و سریال که به صورت **یک فایل HTML** روی GitHub Pages اجرا میشه. بدون سرور و بدون نصب — فقط لینک رو باز کنید و جستجو کنید.

### 🧠 امکانات اصلی

| ویژگی | توضیح |
|---|---|
| 🔍 **جستجوی فازی** | جستجوی آنی روی **بیش از ۷۰۰۰ عنوان** با تشخیص غلط تایپی و پیشنهاد زنده |
| 📊 **امتیاز زنده** | امتیاز IMDb، Rotten Tomatoes، Metacritic و TMDB کنار هم با نوار انیمیشنی |
| 🏆 **حکم کلی** | امتیاز وزنی محاسبه‌شده — نه متن از پیش نوشته |
| 📚 **اطلاعات جذاب** | خلاصه ویکی‌پدیا، کلمات کلیدی و تریلر برای هر عنوان |
| 📺 **هیتمپ سریال** | امتیاز اپیزودها به تفکیک فصل |
| 🔗 **لینک‌های عمیق** | دکمه‌های IMDb، Letterboxd، TMDB، Rotten Tomatoes و ویکی‌پدیا با IMDb ID |
| ⬇️ **پاپ‌آپ دانلود** | لینک دانلود مستقیم برای ۷۰۰۰+ فیلم و سریال (زیرنویس/دوبله، به تفکیک فصل) |
| ⚖️ **حالت مقایسه** | مقایسه هر دو عنوان کنار هم |
| 🌐 **دوزبانه** | فارسی / انگلیسی با پشتیبانی RTL |
| 💾 **آفلاین** | دیتابیس fallback داخلی + کش IndexedDB/localStorage |

### 🏗️ طرز کار (دیتای کرال‌شده)

به جای اینکه هر بازدیدکننده مستقیم به API ها بزنه (و سهمیه رایگان تموم شه)، یک **کرالر GitHub Actions** (`scripts/crawl.js`) هر شب اجرا میشه و دیتای تجمیعی رو توی همین ریپو کامیت می‌کنه:

```
GitHub Actions (شبانه)
  ├─ TMDB      → پوستر، بک‌دراپ، امتیاز، بازیگران، تریلر (سهمیه ارزان)
  ├─ OMDb      → Rotten Tomatoes + Metacritic + جوایز (محدود، ادامه‌دار روزانه)
  ├─ ویکی‌پدیا → خلاصه بخش مقدمه
  └─ کامیت    → public/db.json (جزئیات) + public/titles.json (ایندکس جستجو)
        │
        ▼
هر کاربر فقط یک بار همین فایل‌ها رو می‌گیره → کش در IndexedDB
جستجو و جزئیات آنی و آفلاین — صفر درخواست API برای هر بازدیدکننده.
```

### 🔑 کلیدهای API

کلیدها داخل `index.html` قرار دارن (برای اپ استاتیک GitHub Pages طبیعی‌ست — چون کلید دیده میشه، معماری کرالر از سهمیه محافظت می‌کنه):

```javascript
var OMDB_KEY = 'کلید_شما';      // https://www.omdbapi.com/  (رایگان، ۱۰۰۰ درخواست/روز)
var TMDB_KEY = 'کلید_شما';      // https://www.themoviedb.org/ (رایگان، API → v3)
```

برای workflow کرالر می‌تونید secret های `OMDB_KEY` / `TMDB_KEY` رو هم تنظیم کنید؛ اگه نباشن از کلیدهای داخل کد استفاده میشه.

### 🚀 اجرای محلی

```bash
python -m http.server 8080
# یا: npx serve .
```

سپس `http://localhost:8080` رو باز کنید.

### 🧱 ساختار پروژه

```
CineScore/
├── index.html              ← کل اپ (تک‌فایل)
├── public/
│   ├── titles.json         ← ایندکس جستجو (اول بارگذاری و کش می‌شه)
│   ├── db.json             ← جزئیات کامل (به‌صورت lazy بارگذاری و کش در IndexedDB)
│   └── links.json          ← لینک‌های دانلود (در صورت نیاز)
├── scripts/
│   ├── crawl.js            ← کرالر شبانه (TMDB + OMDb + ویکی‌پدیا)
│   ├── build_starter.js    ← ساخت داده اولیه آفلاین (seed/fallback/links)
│   ├── seed.json           ← لیست اولیه ۷۰۰۰ عنوان
│   └── test.js             ← تست منطق (node scripts/test.js)
└── .github/workflows/crawl.yml
```

### ⚖️ مجوز

MIT

---

<div align="center">

**Made with ❤ by [Mohsen Niksirat](https://github.com/mohsen-niksirat)**

</div>
