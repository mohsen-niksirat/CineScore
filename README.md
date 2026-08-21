# 🎬 CineScore — Movie & Series Analyzer

A sleek, single-page web app that analyzes movies and TV series using ratings from **IMDb**, **Rotten Tomatoes**, and **Metacritic** — all in one beautiful dashboard.

![CineScore Preview](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

---

## ✨ Features

- 🔍 **Smart Search** — Find any movie or series instantly
- 📊 **Multi-Platform Ratings** — IMDb, Rotten Tomatoes & Metacritic side by side
- 📈 **Visual Score Comparison** — Animated bar charts to compare ratings at a glance
- 🏆 **Overall Verdict** — Get an aggregated score with a quality verdict
- 🎨 **Dark/Light Theme** — Toggle between themes
- 📱 **Fully Responsive** — Works on desktop, tablet & mobile
- ⚡ **Zero Dependencies** — Pure HTML + CSS + JS, no frameworks needed
- 🎬 **Trending Section** — Quick access to popular titles

## 🚀 Live Demo

👉 **[View Live](https://mohsen-niksirat.github.io/CineScore/)**

## 📸 Screenshots

| Dark Theme | Light Theme |
|:---:|:---:|
| ![Dark](screenshots/dark.png) | ![Light](screenshots/light.png) |

## 🛠️ Setup

### 1. Get a Free API Key

This project uses the [OMDb API](http://www.omdbapi.com/). Get your free key:

👉 [http://www.omdbapi.com/apikey.aspx](http://www.omdbapi.com/apikey.aspx)

### 2. Add Your API Key

Open `index.html` and find this line near the bottom:

```javascript
const API_KEY = 'YOUR_API_KEY';
```

Replace `YOUR_API_KEY` with your actual OMDb API key.

### 3. Open It

That's it! Just open `index.html` in your browser. No build step, no server needed.

## 📁 Project Structure

```
CineScore/
├── index.html    ← Everything in one file (HTML + CSS + JS)
└── README.md
```

## 🎯 How It Works

1. **Search** — Type a movie or series name
2. **Browse** — See search results with posters and basic info
3. **Analyze** — Click any result to see the full analysis:
   - Rating breakdown from all platforms
   - Visual comparison bars
   - Overall weighted score & verdict
   - Full plot summary
   - Cast, director, awards & more

## 🔧 API Reference

| Parameter | Description |
|---|---|
| `s` | Search by title |
| `i` | Get by IMDb ID |
| `type` | Filter: `movie`, `series` |
| `plot` | `short` or `full` |

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## ⭐ Support

If you found this useful, give it a ⭐ on GitHub!

---

<div align="center">

**Built with ❤️ by [Mohsen Niksirat](https://github.com/mohsen-niksirat)**

</div>
