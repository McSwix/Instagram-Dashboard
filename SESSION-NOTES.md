# Instagram Dashboard — Session Notes

## Project Overview
Personal Instagram analytics dashboard for a Creator account. Vanilla HTML/CSS/JS, Firebase Firestore, Chart.js. Built for the account owner's mum — simple, no monthly fees.

- **Live site**: https://instagram-dashboard-v2.web.app
- **GitHub**: https://github.com/McSwix/Instagram-Dashboard (branch: main)
- **Firebase project**: instagram-dashboard-v2
- **Password**: `instagram2025` (client-side sessionStorage auth)

## What's Built and Working

### Pages
- **index.html** — Main dashboard: key metrics (followers, following, engagement rate, reach), performance stats with 7d/30d/All toggle, follower trend sparkline, content type breakdown, top 3 posts, quick insights, follower analysis summary
- **posts.html** — Post performance grid with sort/filter by type. Engagement rate badge and reach/impressions hidden when API doesn't return data (shows 0)
- **analytics.html** — Tabbed: Growth, Posts, Audience, Best Times (heatmap)
- **history.html** — Sync history timeline (API syncs + manual uploads)
- **settings.html** — Token setup, sync controls (Quick/Full/Deep with info tooltips), legacy upload
- **followers.html** — Follower analysis from ZIP data: not following back, mutuals, fans, one-sided engagement, wasted comments
- **upload.html** — Dedicated upload page with ZIP or Individual Files toggle

### Shared JS Modules
- **js/firestore-store.js** — Firebase singleton, all Firestore CRUD (config, syncs, posts, account_insights, post_snapshots, snapshots)
- **js/instagram-api.js** — Instagram Graph API client with rate limiting, token management, Quick/Full/Deep sync orchestration
- **js/components.js** — Nav sidebar, ToastManager, Modal, PasswordModal, AnimatedCounter, Skeleton loaders, PageTransition

### Design
- Light modern theme (Iconosquare-inspired), sidebar navigation
- Fonts: DM Sans (body on dashboard), Inter (other pages), Plus Jakarta Sans / Syne (display)
- Responsive: desktop sidebar, tablet icons, mobile hamburger drawer
- All pages work on mobile

## Current State & Known Issues

### Instagram API — Reach/Impressions Not Working
The per-post insights endpoint (`/{media-id}/insights`) fails for almost all posts. Only 1 out of ~50 posts returned reach data (411 reach on the plank challenge post). This means:
- Engagement rate shows 0% on most post cards (hidden now when 0)
- Reach and Impressions cards on dashboard show 0
- The "Total Reach" key metric card shows 0

**What we've done**: Improved error handling — the API client now retries ALL fallback metric sets on any HTTP error (not just 400). Added detailed console logging (`status`, `igCode`, `message`, `metrics`) so the next Full Sync with DevTools open will show exactly what Instagram is returning.

**Next step**: User needs to run a Full Sync with browser console open (F12) after rate limit resets, to capture the actual error messages. This will tell us if it's a permissions issue, account type issue, or Instagram API change.

### Delta Tracking System (New)
Added `post_snapshots` Firestore collection to track engagement changes over time, like Iconosquare does.

**How it works**:
- Every Full Sync saves a daily snapshot of each post's metrics (likes, comments, saves, shares, reach, impressions)
- Doc ID format: `{mediaId}_{YYYY-MM-DD}` (one per post per day)
- Dashboard performance section diffs earliest vs latest snapshots within the selected period
- Shows actual "engagement received in last N days" instead of lifetime totals

**Current state**: Just implemented. No snapshot data exists yet. The first Full Sync will create the first set of snapshots. After a second sync on a different day, delta calculations will start working. For 7d accuracy, need ~7 days of daily syncs. Until then, falls back to showing lifetime totals on recent posts with a note.

**Fallback subtitle**: "Lifetime totals on posts from the last N days — run a Full Sync to start tracking changes"

### Upload System
- ZIP upload works (fixed filename matching bug — was matching on full path including parent folder names)
- Individual file upload added (separate inputs for followers, following, comments JSON)
- Fixed Instagram's `following.json` format — uses `item.title` not `item.string_list_data[0].value`
- Removed upload section from followers.html (now only on upload.html)

### Rate Limiting
- 200 calls/hour hard limit, 180 safety buffer
- Tracked in localStorage with hourly window reset
- Deep Sync uses ~105 calls, Full ~55, Quick ~3
- User hit rate limit during this session — needs to wait for reset before next Full Sync

## What To Do Next

### Immediate (next session)
1. **Run a Full Sync** with console open — capture the actual insight API errors to diagnose why reach/impressions return 0
2. **Hide reach/impressions from dashboard** if they continue to be 0 — the "Total Reach" key metric card and the Reach/Impressions perf cards should auto-hide like posts.html does
3. **Test delta tracking** — after first sync creates snapshots, verify the loadPerfStats function correctly computes deltas on subsequent syncs

### Short-term improvements
4. **Auto-hide zero metrics on dashboard** — same pattern as posts.html: if reach is always 0, don't show the Reach key metric card or the Reach/Impressions perf stat cards
5. **Firestore indexes** — the `post_snapshots` composite index may need to be created manually in Firebase Console if the auto-created `firestore.indexes.json` doesn't deploy properly. Watch for index errors in console.
6. **Git config** — commits show as "Matthew McAllister <matt@Matthews-Air.ultrahub>", user may want to set proper name/email

### Longer-term
7. **Engagement rate without reach** — consider calculating engagement as likes+comments+saves+shares per post (absolute) rather than as a % of reach, since reach isn't available
8. **Automatic Full Sync scheduling** — currently only Quick Sync runs automatically (on page load if >6h stale). Could add a periodic Full Sync or prompt
9. **Token refresh** — token expires every 60 days, warning banners exist but token refresh flow should be tested
10. **Audience demographics** — requires 100+ followers, should work but hasn't been tested with this account

## File Changes This Session
- `index.html` — Period toggle (7d/30d/All), delta-based loadPerfStats, overflow-x fix for mobile
- `js/firestore-store.js` — Added post_snapshots methods (savePostSnapshot, getPostSnapshotsRange, getPostSnapshotsOnDate, getSnapshotBoundaries)
- `js/instagram-api.js` — Save snapshots during fullSync, retry all metric fallbacks on any HTTP error
- `styles/main.css` — Period toggle CSS (.period-toggle, .period-btn)
- `posts.html` — Hide engagement badge when 0%, hide reach/impressions when 0, show engagement rate in stats grid when available
- `followers.html` — Removed upload section, upload JS, JSZip import
- `upload.html` — ZIP/Individual Files mode toggle, separate file pickers for followers/following/comments
- `firestore.indexes.json` — New file for post_snapshots index

## Firestore Collections
| Collection | Purpose | Key fields |
|---|---|---|
| `config` (doc: `settings`) | App config | accessToken, igUsername, lastSyncAt, lastSyncStatus |
| `syncs` | Sync history | timestamp, type (api/manual_upload), status, apiCallsUsed |
| `posts` | Media items (by igMediaId) | mediaType, caption, timestamp, likes, comments, saves, shares, reach, impressions, engagementRate |
| `post_snapshots` | Daily metric snapshots (NEW) | igMediaId, date, likes, comments, saves, shares, reach, impressions |
| `account_insights` | Daily account metrics | date, followerCount, reach, impressions, audienceGenderAge |
| `snapshots` | Legacy ZIP upload data | followers[], following[], comments[], timestamp |
