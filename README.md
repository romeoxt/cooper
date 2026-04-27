# YouTube Mentions Feed (WordPress Frontend + Scheduled Backend)

This project is split into two parts:

1. **Frontend** (`index.html`, `styles.css`, `app.js`)  
   Renders videos from a JSON feed. No API key is exposed in the browser.
2. **Backend updater** (`backend/fetch-youtube-feed.mjs`)  
   Runs on a schedule (daily at midnight), fetches YouTube results, filters by name variants, and writes `data/videos.json`.

---

## 1) Configure once

Create a `.env` file in the project root (you can copy `.env.example`) and set:

- `YOUTUBE_API_KEY`
- `PERSON_NAME`
- `SEARCH_QUERY` (optional; defaults to `PERSON_NAME`)
- `PERSON_NAME_VARIANTS` (comma-separated, optional)
- `MAX_RESULTS` (final videos to output, e.g. 100)
- `SEARCH_PAGE_SIZE` (YouTube page size, 5-50)
- `MAX_PAGES` (how many YouTube pages to scan each run)
- `PUBLISHED_AFTER` (optional ISO date or datetime, e.g. `2022-01-01`)
- `PUBLISHED_BEFORE` (optional ISO date or datetime)
- `OUTPUT_PATH` (default: `./data/videos.json`)

The updater script loads values in this order:
1. System environment variables
2. `.env`
3. `.env.example` (fallback)

Tip: if older videos are missing, increase `MAX_PAGES` and consider a broader `SEARCH_QUERY` while keeping strict name variant filtering enabled.

---

## 2) Run locally

### Update feed data

```bash
npm run update-feed
```

### One-time deep backfill

```bash
npm run bootstrap-feed
```

Use `bootstrap-feed` once to build a deep historical list. Then schedule `update-feed` daily so only newer matching uploads are fetched and merged.

### Start static frontend

```bash
npm run serve
```

Open `http://localhost:8000`.

---

## 3) Schedule daily refresh at 12:00 AM

Run this command on your server with cron/scheduler:

```bash
cd /path/to/cooper && node backend/fetch-youtube-feed.mjs
```

Crontab example (midnight every day):

```cron
0 0 * * * cd /path/to/cooper && /usr/bin/node backend/fetch-youtube-feed.mjs >> /var/log/cooper-feed.log 2>&1
```

---

## 4) Use inside WordPress

You can host these files anywhere public (same domain preferred):

- `styles.css`
- `app.js`
- `data/videos.json`

Then in a WordPress Custom HTML block, add:

```html
<link rel="stylesheet" href="https://YOUR-DOMAIN.com/path/styles.css" />
<main class="page">
  <header class="page-header">
    <h1>Latest Videos</h1>
    <p>Recent YouTube uploads matching the selected person name across all channels.</p>
  </header>
  <section class="feed-meta" id="feed-meta">
    <span class="meta-pill">Loading feed metadata...</span>
  </section>
  <section class="results">
    <div class="status" id="status"></div>
    <div id="video-list" class="video-list"></div>
  </section>
</main>
<script>
  window.VIDEO_FEED_URL = "https://YOUR-DOMAIN.com/path/data/videos.json";
</script>
<script src="https://YOUR-DOMAIN.com/path/app.js" defer></script>
```

This keeps the page custom-built in HTML/CSS/JS while WordPress serves it.
