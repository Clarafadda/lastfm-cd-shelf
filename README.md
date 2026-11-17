# My Albums

A web app that transforms recently played tracks from [Last.fm](https://www.last.fm/) into a **3D row of CD cases**, displayed in perspective. Each case represents an album: the most recent ones are at the front, while older ones recede into the distance. The currently playing track is slightly offset forward.

## The Concept

Rather than displaying a list of album covers, depth represents time: the longer ago an album was played, the further back it appears in the row. You can navigate through time as if browsing a CD shelf, using the previous / next buttons, mouse wheel, touch gestures, or keyboard arrow keys.

## Getting Started

**Prerequisites**

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- A Last.fm account with listening history and a (free) API key: <https://www.last.fm/api/account/create>

**Steps**

```bash
git clone https://github.com/Clarafadda/lastfm-cd-shelf.git
cd lastfm-cd-shelf
docker compose up
```

Open <http://localhost:8000>. The application starts even without a `.env` file: the page will display a message prompting you to configure your API key.

To display your listening history, copy the example configuration file and enter your API key and Last.fm username:

```bash
cp .env.example .env
```

```env
LASTFM_API_KEY=your_api_key_here
LASTFM_USER=your_lastfm_username
CACHE_TTL_SECONDS=120
```

Then restart the application using `docker compose up` (or `docker compose up -d --force-recreate` if the container is already running).

**After modifying the code or files in `static/`, rebuild the image using `docker compose up -d --build`**: simply running `docker compose up` would reuse the previous image, and your changes would not be reflected.

To stop the application: `Ctrl+C`, then `docker compose down`.

## Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `LASTFM_API_KEY` | Last.fm API key (**secret**, required to display listening history) | — |
| `LASTFM_USER` | Last.fm username whose listening history is displayed (required) | — |
| `CACHE_TTL_SECONDS` | How long Last.fm responses are cached | `120` |
| `HISTORY_SECONDS` | Listening history time window | `86400` (24 h) |

## How It Works

```text
Browser  ──►  FastAPI Server  ──►  Last.fm
               (API key, cache)
```

- **The browser only communicates with our server.** No requests are sent directly to Last.fm from the page (check the Network tab to verify).
- **The API key stays on the server**, stored in an environment variable loaded from `.env`. This file is ignored by Git and excluded from the Docker image.
- **Caching:** the server stores Last.fm responses for `CACHE_TTL_SECONDS` seconds. Reloading the page multiple times triggers only one request to Last.fm. A lock prevents simultaneous visitors from triggering duplicate requests.
- **Album covers:** they are downloaded and cached by our server (`/api/cover` endpoint), which only accepts Last.fm image domains. The browser therefore never contacts Last.fm's CDN directly.
- **If Last.fm is unavailable:** the server returns the latest known data (indicated on the page), or a clear error message if the cache is empty. The page never remains blank.
- **Display:** the frontend uses plain HTML, CSS, and JavaScript, with no external libraries. The 3D effect relies on CSS transforms (`perspective`, `rotateX/Y`, `translateZ`). Listening history is grouped by album. Text is inserted using `textContent` to prevent track titles from injecting HTML.
- **Responsive design:** the layout adapts to both laptops and phones, with larger CD cases and a steeper row perspective in portrait mode.

## Project Structure

```text
app/main.py            FastAPI server: /api/recent, /api/cover, caching, error handling
static/index.html      Page
static/style.css       3D scene and layout
static/app.js          CD shelf rendering, navigation, server requests
Dockerfile             Server image
docker-compose.yml     Application startup: `docker compose up`
.env.example           Configuration template (no secrets)
```

## Verifying the Requirements

- **No requests to Last.fm from the browser:** open the developer tools, go to the Network tab, and reload the page. Only requests to `localhost` should appear.
- **One API call for two page reloads:** reload the page twice, then run `docker compose logs web`. Only one "Calling Last.fm" log entry should appear.
- **Last.fm unavailable:** enter an invalid API key in `.env`, then restart using `docker compose up -d --force-recreate`. The page should display an error message.
- **API key absent from Git history:** running the following command should return no results:

```bash
git log --all --oneline -S"$(grep '^LASTFM_API_KEY=' .env | cut -d= -f2)"
```