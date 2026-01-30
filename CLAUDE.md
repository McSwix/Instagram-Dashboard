# Instagram Analytics Dashboard — Project Instructions

## What This Project Is
A personal Instagram analytics dashboard for a Creator account, powered by the Instagram Graph API. Built with vanilla HTML/CSS/JS, Firebase Firestore, Chart.js, and Tailwind CSS (CDN). This replaces a previous manual-upload-only Instagram tracker.

## Context & Decisions Already Made
- **Owner**: Building this for the account owner's mum — must be simple to use, no monthly fees
- **Account type**: Instagram Creator account
- **API token**: The user already has a working Instagram Graph API access token
- **Hybrid model**: The Instagram Graph API does NOT provide follower/following username lists (only counts). So we use a hybrid approach:
  - **API** handles: post performance, reach, impressions, demographics, engagement rates, follower count tracking, best time to post — all automatic
  - **Manual ZIP upload** (optional, on Settings page): For username-based analysis (unfollowers, not-following-back, mutual followers, wasted comments) — uses Instagram's data export ZIP
- **Design**: Dark theme inspired by Flick.social — deep purple/blue layered radial gradients, glassmorphic cards with `backdrop-filter: blur(20px)`, Inter font for body, Syne for display headings, generous whitespace, subtle blue/purple box shadows, smooth 0.3s transitions
- **Firebase**: New project — use placeholder config values that the user will replace. Add a clear comment in the code showing where to paste their Firebase config.
- **No frameworks**: Vanilla HTML/CSS/JS only. Libraries via CDN: Tailwind CSS, Chart.js, JSZip (for ZIP extraction), Google Fonts (Inter, Syne)
- **Password protection**: All pages require a password stored in sessionStorage (simple client-side auth, not production-grade — this is a personal tool)

## Architecture

### File Structure
```
Instagram-Dashboard/
├── CLAUDE.md                  # This file (project instructions)
├── index.html                 # Main dashboard
├── posts.html                 # Post performance grid
├── analytics.html             # Enhanced analytics with tabs
├── history.html               # Sync + upload history timeline
├── settings.html              # Token config + sync controls + legacy upload
├── js/
│   ├── instagram-api.js       # Instagram Graph API client
│   ├── firestore-store.js     # Shared Firebase init + data access layer
│   └── components.js          # Shared UI components (toast, modal, counters, skeletons)
├── styles/
│   └── main.css               # Design system (dark theme, glassmorphism, responsive)
└── .gitignore
```

### Firestore Collections

**`config` collection, single doc `settings`:**
```javascript
{
  accessToken: "the_token_string",
  tokenExpiresAt: "2025-03-15T00:00:00Z",    // 60-day expiry
  tokenRefreshedAt: "2025-01-15T00:00:00Z",
  igUserId: "17841400123456",
  igUsername: "accountname",
  lastSyncAt: "2025-01-30T14:00:00Z",
  lastSyncStatus: "success" // or "error" or "rate_limited"
}
```

**`syncs` collection (one doc per sync event):**
```javascript
{
  timestamp: "2025-01-30T14:00:00Z",
  type: "api" | "manual_upload",
  followerCount: 1234,
  followingCount: 567,
  mediaCount: 89,
  apiCallsUsed: 55,
  status: "success" | "partial" | "error",
  errorMessage: null
}
```

**`posts` collection (one doc per media item, keyed by igMediaId):**
```javascript
{
  igMediaId: "17854360229135492",
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM",
  caption: "Working out today...",
  permalink: "https://www.instagram.com/p/ABC123/",
  thumbnailUrl: "https://...",
  mediaUrl: "https://...",
  timestamp: "2025-01-20T12:00:00Z",
  reach: 4500,
  impressions: 6200,
  likes: 320,
  comments: 45,
  saves: 67,
  shares: 12,
  plays: null,               // only for videos
  engagement: 444,           // likes + comments + saves + shares
  engagementRate: 0.036,     // engagement / reach
  lastUpdated: "2025-01-30T14:00:00Z"
}
```

**`account_insights` collection (one doc per day):**
```javascript
{
  date: "2025-01-30",
  followerCount: 1234,
  followingCount: 567,
  impressions: 2500,
  reach: 1800,
  audienceGenderAge: { "F.18-24": 120, "F.25-34": 340, "M.18-24": 80 },
  audienceCountry: { "US": 450, "GB": 120, "CA": 80 },
  audienceCity: { "Los Angeles, California": 45, "New York, New York": 38 }
}
```

**`snapshots` collection (legacy, for follower list analysis from ZIP uploads):**
```javascript
{
  followers: ["username1", "username2"],
  following: ["username1", "username4"],
  comments: [{ username: "user1", comment: "Nice!", timestamp: 1705267200 }],
  timestamp: "2025-01-16T14:30:00.000Z",
  followerCount: 1245,
  followingCount: 890,
  commentedAccounts: ["user1", "user2"],
  commentCount: 156
}
```

## Instagram Graph API Details

### Endpoints to Use
- `GET /me?fields=id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url` — Profile info (1 call)
- `GET /me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=25` — Media list, paginated (1 call per 25 items)
- `GET /{media-id}/insights?metric=reach,impressions,likes,comments,saves,shares` — Per-post insights (1 call per post). For VIDEO/REEL add `plays` metric.
- `GET /me/insights?metric=impressions,reach,follower_count&period=day&since={unix}&until={unix}` — Account-level daily insights (1 call)
- `GET /me/insights?metric=audience_gender_age,audience_country,audience_city&period=lifetime` — Audience demographics (1 call, requires 100+ followers)
- `GET /refresh_access_token?grant_type=ig_refresh_token&access_token={token}` — Token refresh (60-day tokens)

### Base URL
`https://graph.instagram.com`

All requests need `?access_token={token}` parameter.

### Rate Limits
- **200 calls per hour** per account (hard limit)
- Implement a client-side counter, cap at 180 calls (20-call safety buffer)
- Track calls in localStorage with hourly window reset

### Sync Types
| Type | Calls | When |
|------|-------|------|
| Quick Sync | ~3 | Auto on page load if >6 hours since last sync |
| Full Sync | ~55 | Manual "Sync Now" button (fetches 50 posts + insights) |
| Deep Sync | ~105 | Manual option (100 posts) |

### Token Management
- Long-lived tokens last 60 days
- Can be refreshed if >24 hours old and not expired
- Show warning banner on all pages when token expires within 7 days
- Show modal when within 3 days

### Important API Notes (Jan 2025 changes)
- `video_views` metric deprecated — use `plays` instead
- `profile_views`, `website_clicks` deprecated
- All video metrics standardized to "Views"
- Audience demographics limited to top 45 segments, 48-hour reporting delay
- Basic Display API sunset Dec 4, 2024 — must use Graph API

## Pages — Detailed Specs

### `js/instagram-api.js`
Core API client module. Export an `InstagramAPI` object with:
- `_fetch(endpoint, params)` — authenticated GET with rate limit check
- `_checkRateLimit()` — track calls in localStorage, throw RateLimitError if exceeded
- `getProfile()` — returns profile data
- `getMedia(limit, after)` — paginated media list
- `getMediaInsights(mediaId, mediaType)` — per-post insights
- `getAccountInsights(period, since, until)` — daily account metrics
- `getAudienceDemographics()` — lifetime audience data
- `getAllMedia(maxPages)` — auto-paginate media
- `fullSync(options)` — orchestrate a complete sync (profile + posts + insights + demographics)
- `quickSync()` — lightweight sync (profile + daily insights only)
- `getToken()` — read token from Firestore config
- `refreshToken()` — call the refresh endpoint
- Custom error classes: `IGApiError`, `RateLimitError`

### `js/firestore-store.js`
Shared Firebase singleton. Export a `Store` object with:
- Firebase initialization (single place, all pages import this)
- `getConfig()` / `saveConfig(data)` — config/settings doc
- `addSync(data)` / `getRecentSyncs(count)` — syncs collection
- `upsertPost(igMediaId, data)` / `getAllPosts(orderField, dir)` / `getTopPosts(metric, count)` — posts collection
- `saveAccountInsights(date, data)` / `getAccountInsightRange(start, end)` — account_insights
- `getLatestSnapshots(count)` / `getAllSnapshots()` — legacy snapshots (read-only)

### `js/components.js`
Shared UI components. Build these reusable pieces:
- **ToastManager** — success/error/warning/info notifications with auto-dismiss and progress bar
- **Modal** — generic dialog with overlay, blur backdrop, escape key support
- **PasswordModal** — authentication modal with show/hide toggle, error shake animation
- **AnimatedCounter** — smooth number animation with easeOutExpo, intersection observer trigger
- **Skeleton loaders** — shimmer placeholders for loading states
- **PageTransition** — staggered entry animations, scroll reveal

### `settings.html` (replaces upload.html)
Sections:
1. **API Connection Status** — Shows connected username, profile picture, token status (valid/expired/missing), token expiry countdown
2. **Token Setup** — Input field for pasting access token, "Save & Connect" button that tests the token via `/me` endpoint
3. **Sync Controls** — "Sync Now" button with progress indicator showing what's being fetched, last sync time, API calls remaining
4. **Advanced: Legacy Upload** — Collapsible section with ZIP/JSON upload for follower list analysis. Same logic as old upload.html: JSZip extraction, parses `followers_*.json`, `following.json`, `post_comments_*.json`. Saves to `snapshots` collection.
5. **Token Refresh** — Warning banner when near expiry, one-click refresh button

### `index.html` (main dashboard)
Layout (top to bottom):
1. **Password modal** (if not authenticated)
2. **Sticky nav** — Dashboard (active), Posts, Analytics, History, Settings (gear icon). Mobile hamburger menu.
3. **Sync status bar** — "Last sync: 2h ago" green dot, refresh button
4. **Key metrics row** (4 glassmorphic cards):
   - Followers (from latest sync) with +/- change from previous
   - Following with +/- change
   - Engagement Rate (avg from recent posts)
   - Total Reach (last 7 days)
5. **Recent posts** — Horizontal scrollable row of last 6 posts. Each card: thumbnail, likes, comments, reach. Click links to posts.html.
6. **Quick insights** (3 cards):
   - Best performing post this week (thumbnail + engagement)
   - Best time to post (day + hour)
   - Audience summary ("60% female, mostly 25-34, primarily US")
7. **Follower analysis** (only shown if legacy snapshot data exists):
   - Not Following Back, Mutual Followers, Fans, Wasted Comments cards
   - Note: "Based on data export from [date]"
   - Each card opens a drawer with the list of usernames

### `posts.html`
- Grid of post cards (3 cols desktop, 2 tablet, 1 mobile)
- Each card: thumbnail image, caption snippet (truncated), date posted
- Below thumbnail: reach, impressions, likes, comments, saves, shares, engagement rate
- Toolbar: Sort dropdown (Date, Engagement Rate, Reach, Likes) + Filter by media type (All, Photo, Video, Carousel)
- Color-coded engagement rate (green = above average, red = below)

### `analytics.html`
Tabbed layout with 4 tabs:
- **Growth tab**: Circular goal tracker (set follower goal, shows progress), follower growth line chart over time, following line chart, weekly growth bar chart (green/red bars). Uses data from `account_insights` (API) and `syncs`.
- **Posts tab**: Bar chart of engagement by post (last 20), line chart of reach trend (last 30 posts), top 5 posts by engagement rate with thumbnails. Uses `posts` collection.
- **Audience tab**: Donut chart for gender distribution, horizontal bar chart for age ranges, horizontal bar chart for top 10 countries, horizontal bar chart for top 10 cities. Uses `account_insights` demographics data.
- **Best Times tab**: 7x24 HTML table heatmap (rows = Mon-Sun, cols = 12am-11pm). Each cell colored from cold (low engagement) to hot (high engagement). Calculated client-side from `posts` collection by bucketing each post's timestamp (hour + day of week) and averaging engagement rate per bucket. Highlight top 3 recommended time slots. Minimum 3 posts per slot to be shown.

### `history.html`
- Summary stats: total syncs, first sync date, latest sync date
- Timeline (vertical, latest first):
  - API syncs: blue dot, shows timestamp, follower count, API calls used, status badge
  - Manual uploads: pink dot, shows timestamp, follower/following count, new/lost followers lists
  - Latest entry highlighted with green glow

## Design System

### Colors
```css
/* Background layers */
--bg-void: #08090c;
--bg-deep: #0c0d10;
--bg-surface: #131419;
--bg-elevated: #1a1b21;
--bg-hover: #22232b;

/* Instagram gradient */
--ig-orange: #F58529;
--ig-pink: #DD2A7B;
--ig-purple: #8134AF;
--ig-blue: #515BD4;

/* Semantic */
--color-positive: #32D74B;
--color-negative: #FF453A;
--color-warning: #FF9F0A;
--color-info: #64D2FF;
```

### Fonts
- **Body**: Inter (Google Fonts), weights 300-700
- **Display**: Syne (Google Fonts), weights 700-800

### Glass Cards
```css
.glass-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(128, 152, 213, 0.07);
}
```

### Page Background
Layered radial gradients (purple/blue) on top of --bg-void, similar to Flick.social's aesthetic.

### Responsive
- Mobile first, breakpoints: 480px, 640px, 768px, 1024px
- Hamburger nav on mobile
- Touch-friendly 44px minimum tap targets
- Safe area insets for notched phones

## Build Order

Build these phases in order. Each phase should be fully working before moving to the next.

### Phase 1: Foundation (`js/firestore-store.js`, `js/instagram-api.js`, `js/components.js`, `styles/main.css`)
Create the shared modules and design system. The Firebase store should use placeholder config with a clear `// TODO: Replace with your Firebase config` comment. Test that imports work across pages.

### Phase 2: Settings Page (`settings.html`) + navigation
Build the settings page with token input, connection test, sync button, and legacy upload. Update navigation on all pages to include: Dashboard, Posts, Analytics, History, Settings.

### Phase 3: Dashboard (`index.html`)
Build the main dashboard reading from Firestore. Show API-driven metrics, recent posts, quick insights. Include the legacy follower analysis section conditionally.

### Phase 4: Posts Page (`posts.html`)
Build the post performance grid with sorting and filtering.

### Phase 5: Analytics (`analytics.html`)
Build the tabbed analytics page with all 4 tabs: Growth, Posts, Audience, Best Times.

### Phase 6: History (`history.html`)
Build the sync history timeline showing both API syncs and manual uploads.

### Phase 7: Polish
Add auto-sync on page load (Quick Sync if >6h since last), token refresh reminders, error handling, loading states, and responsive polish.

## Firebase Setup Instructions for User
The user needs to:
1. Go to https://console.firebase.google.com
2. Click "Add project" → name it (e.g., "instagram-dashboard")
3. Enable Firestore Database (start in test mode for now)
4. Go to Project Settings → General → scroll down to "Your apps" → click web icon (</>)
5. Register app, copy the `firebaseConfig` object
6. Paste into `js/firestore-store.js` replacing the placeholder config

## Previous Project Reference
This project replaces an older Instagram tracker at https://github.com/McSwix/instagram-tracker. That project used manual ZIP uploads only, stored data in Firebase (project: instagram-tracker-fda0e), and had a dark purple/blue glassmorphic design. The new dashboard should feel like a natural evolution of that design but more polished and feature-rich, inspired by Flick.social and Iconosquare.
