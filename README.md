# Khatmah

![App Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

A Quran reading companion for the **CMU-Q Muslim Student Association**. Plan your khatmah with daily juz' and page targets for the standard 604-page Madani Mushaf—during Ramadan or on your own schedule.

## Features

* **Dual schedule modes:** **Ramadan plan** (30-day Ramadan schedule with Hijri detection) or **My schedule** (custom start date and any plan length from 1–365 days).
* **Dynamic scheduling:** Enter how many khatmahs you want to complete; the app distributes juz' and page ranges evenly across your plan length.
* **Hijri date detection:** Uses `Intl.DateTimeFormat` (islamic-umalqura) to detect the current Ramadan day and show a year-round countdown to the next Ramadan.
* **Plan day preview:** Outside Ramadan, browse and track progress against the 30-day Ramadan plan with a manual plan-day highlight.
* **Hijri offset:** During Ramadan, adjust +/- for local moon sighting differences.
* **Mark as done:** Tap a day card to mark it complete. Progress persists in `localStorage` (separate keys per Ramadan year and per custom plan).
* **Horizontal carousel:** Swipe or drag through days; auto-scrolls to the current day on load.
* **Installable:** Add to home screen as a web app (PWA). Works offline after first visit.

## Tech Stack

* **Frontend:** HTML5, Tailwind CSS (CDN), Vanilla JavaScript
* **No build step:** Static files only
* **PWA:** Web app manifest, service worker, offline caching

## How to Run

1. Clone the repository.
2. Open `index.html` in a browser, or serve the folder with a local server:

```bash
python -m http.server 8085
# or
docker compose up
```

Then visit [http://localhost:8085](http://localhost:8085).

**VS Code:** Use the "Live Server" extension and open with Live Server.

## Production

This app is intended to run at **khatmah.cmuqmsa.org**.

Build the production container:

```bash
docker build -t cmuqmsa-khatmah .
```

The container serves static files on internal port `80`. In production, the central `cmuqmsa-infra` Caddy router sends `khatmah.cmuqmsa.org` traffic to this container.

## Install as Web App

1. Serve over **HTTPS** (or localhost for testing).
2. Visit the app in Chrome, Edge, or Safari.
3. Use **Add to Home Screen** (mobile) or the install icon in the address bar (desktop).

## Project Structure

```
├── index.html    # Semantic HTML + Tailwind
├── styles.css    # Custom overrides, glassmorphism, mode toggle
├── app.js        # State management, Hijri logic, dual modes, render
├── sw.js         # Service worker (offline caching)
├── manifest.json # Web app manifest
├── icon-192.png    # PWA icon (192×192)
├── icon-512.png    # PWA icon (512×512)
├── khatmah_logo.png # App icon / header logo
└── README.md
```

## Acknowledgments

* CMU-Q Muslim Student Association
* Standard Madani Mushaf (604 pages) for juz'–page mapping
