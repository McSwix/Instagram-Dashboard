// ============================================
// Instagram Graph API Client
// ============================================

const API_BASE = 'https://graph.instagram.com';
const RATE_LIMIT = 180; // 200 max, 20 safety buffer
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms

// ---------- Custom Errors ----------
class IGApiError extends Error {
  constructor(message, statusCode = null, igErrorCode = null) {
    super(message);
    this.name = 'IGApiError';
    this.statusCode = statusCode;
    this.igErrorCode = igErrorCode;
  }
}

class RateLimitError extends Error {
  constructor(callsUsed, resetAt) {
    super(`Rate limit reached (${callsUsed}/${RATE_LIMIT} calls). Resets at ${new Date(resetAt).toLocaleTimeString()}.`);
    this.name = 'RateLimitError';
    this.callsUsed = callsUsed;
    this.resetAt = resetAt;
  }
}

// ---------- Rate Limit Tracker ----------
function getRateState() {
  const raw = localStorage.getItem('ig_rate_limit');
  if (!raw) return { calls: 0, windowStart: Date.now() };
  const state = JSON.parse(raw);
  // Reset if window expired
  if (Date.now() - state.windowStart > RATE_WINDOW) {
    return { calls: 0, windowStart: Date.now() };
  }
  return state;
}

function incrementRate() {
  const state = getRateState();
  state.calls += 1;
  localStorage.setItem('ig_rate_limit', JSON.stringify(state));
  return state;
}

function checkRateLimit() {
  const state = getRateState();
  if (state.calls >= RATE_LIMIT) {
    throw new RateLimitError(state.calls, state.windowStart + RATE_WINDOW);
  }
  return state;
}

// ---------- API Client ----------
const InstagramAPI = {

  _callCount: 0, // Track calls within current sync session

  get callsUsed() {
    return this._callCount;
  },

  get callsRemaining() {
    const state = getRateState();
    return RATE_LIMIT - state.calls;
  },

  resetSessionCount() {
    this._callCount = 0;
  },

  // --- Core Fetch ---
  async _fetch(endpoint, params = {}) {
    checkRateLimit();

    const token = await this.getToken();
    if (!token) throw new IGApiError('No access token configured. Go to Settings to add your token.');

    params.access_token = token;
    const query = new URLSearchParams(params).toString();
    const url = `${API_BASE}${endpoint}?${query}`;

    const res = await fetch(url);
    incrementRate();
    this._callCount++;

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const igErr = body?.error;
      throw new IGApiError(
        igErr?.message || `API request failed (${res.status})`,
        res.status,
        igErr?.code
      );
    }

    return res.json();
  },

  // --- Token Management ---
  async getToken() {
    const config = await Store.getConfig();
    return config?.accessToken || null;
  },

  async refreshToken() {
    const token = await this.getToken();
    if (!token) throw new IGApiError('No token to refresh.');

    const url = `${API_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new IGApiError(body?.error?.message || 'Token refresh failed', res.status);
    }

    const data = await res.json();
    await Store.saveConfig({
      accessToken: data.access_token,
      tokenRefreshedAt: new Date().toISOString(),
      tokenExpiresAt: new Date(Date.now() + (data.expires_in * 1000)).toISOString()
    });

    return data;
  },

  // --- Profile ---
  async getProfile() {
    return this._fetch('/me', {
      fields: 'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url'
    });
  },

  // --- Media ---
  async getMedia(limit = 25, after = null) {
    const params = {
      fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
      limit: Math.min(limit, 25)
    };
    if (after) params.after = after;
    return this._fetch('/me/media', params);
  },

  async getAllMedia(maxPages = 4) {
    const allMedia = [];
    let after = null;

    for (let page = 0; page < maxPages; page++) {
      const result = await this.getMedia(25, after);
      if (result.data) allMedia.push(...result.data);

      after = result.paging?.cursors?.after;
      if (!after || !result.paging?.next) break;
    }

    return allMedia;
  },

  // --- Media Insights ---
  async getMediaInsights(mediaId, mediaType) {
    // Instagram API (2025+) uses different metrics per media type:
    // - IMAGE/CAROUSEL_ALBUM: reach, impressions, likes, comments, saved, shares, total_interactions
    // - VIDEO/REEL: reach, likes, comments, saved, shares, plays, total_interactions
    //   (no 'impressions' for Reels; 'saves' is now 'saved')
    const isVideo = mediaType === 'VIDEO' || mediaType === 'REEL';

    // Try the preferred metric set first, fall back if needed
    const metricSets = isVideo
      ? [
          'reach,likes,comments,saved,shares,plays,total_interactions',
          'reach,likes,saved,shares,plays',
          'reach,plays'
        ]
      : [
          'reach,impressions,likes,comments,saved,shares,total_interactions',
          'reach,likes,saved,shares,total_interactions',
          'reach,saved,shares'
        ];

    for (const metrics of metricSets) {
      try {
        const result = await this._fetch(`/${mediaId}/insights`, { metric: metrics });
        const insights = {};
        if (result.data) {
          result.data.forEach(m => {
            // Normalize 'saved' back to 'saves' for our data model
            const name = m.name === 'saved' ? 'saves' : m.name;
            insights[name] = m.values?.[0]?.value ?? 0;
          });
        }
        return insights;
      } catch (err) {
        if (err.statusCode === 400) {
          // Try next metric set
          continue;
        }
        throw err;
      }
    }

    // All metric sets failed — return null
    console.warn(`Insights unavailable for media ${mediaId} (${mediaType})`);
    return null;
  },

  // --- Account Insights ---
  async getAccountInsights(since, until) {
    const result = await this._fetch('/me/insights', {
      metric: 'impressions,reach,follower_count',
      period: 'day',
      since: Math.floor(new Date(since).getTime() / 1000),
      until: Math.floor(new Date(until).getTime() / 1000)
    });

    const insights = {};
    if (result.data) {
      result.data.forEach(metric => {
        insights[metric.name] = metric.values || [];
      });
    }
    return insights;
  },

  // --- Audience Demographics ---
  async getAudienceDemographics() {
    try {
      const result = await this._fetch('/me/insights', {
        metric: 'audience_gender_age,audience_country,audience_city',
        period: 'lifetime'
      });

      const demographics = {};
      if (result.data) {
        result.data.forEach(metric => {
          demographics[metric.name] = metric.values?.[0]?.value || {};
        });
      }
      return demographics;
    } catch (err) {
      // Demographics require 100+ followers
      if (err.statusCode === 400) {
        return null;
      }
      throw err;
    }
  },

  // --- Sync Orchestrators ---

  async quickSync() {
    this.resetSessionCount();

    try {
      // 1. Fetch profile (~1 call)
      const profile = await this.getProfile();

      // 2. Save config with latest profile info
      await Store.saveConfig({
        igUserId: profile.id,
        igUsername: profile.username,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'success'
      });

      // 3. Save today's account insight
      const today = new Date().toISOString().split('T')[0];
      await Store.saveAccountInsights(today, {
        followerCount: profile.followers_count,
        followingCount: profile.follows_count,
        mediaCount: profile.media_count
      });

      // 4. Log sync
      await Store.addSync({
        type: 'api',
        followerCount: profile.followers_count,
        followingCount: profile.follows_count,
        mediaCount: profile.media_count,
        apiCallsUsed: this._callCount,
        status: 'success'
      });

      return { profile, callsUsed: this._callCount };

    } catch (err) {
      await Store.saveConfig({ lastSyncStatus: 'error' });
      await Store.addSync({
        type: 'api',
        apiCallsUsed: this._callCount,
        status: 'error',
        errorMessage: err.message
      });
      throw err;
    }
  },

  async fullSync(options = {}) {
    const maxPages = options.deep ? 4 : 2; // 100 posts deep, or 50
    this.resetSessionCount();

    const onProgress = options.onProgress || (() => {});

    try {
      // 1. Profile
      onProgress('Fetching profile...');
      const profile = await this.getProfile();

      await Store.saveConfig({
        igUserId: profile.id,
        igUsername: profile.username,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'success'
      });

      // 2. Media list
      onProgress('Fetching posts...');
      const media = await this.getAllMedia(maxPages);

      // 3. Per-post insights
      let insightsCount = 0;
      for (const item of media) {
        onProgress(`Fetching insights (${++insightsCount}/${media.length})...`);

        const insights = await this.getMediaInsights(item.id, item.media_type);

        const postData = {
          mediaType: item.media_type,
          caption: item.caption || '',
          permalink: item.permalink,
          thumbnailUrl: item.thumbnail_url || item.media_url,
          mediaUrl: item.media_url,
          timestamp: item.timestamp,
          likes: item.like_count || 0,
          comments: item.comments_count || 0
        };

        if (insights) {
          postData.reach = insights.reach || 0;
          postData.impressions = insights.impressions || 0;
          postData.saves = insights.saves || 0;
          postData.shares = insights.shares || 0;
          postData.plays = insights.plays || null;
          if (insights.likes) postData.likes = insights.likes;
          if (insights.comments) postData.comments = insights.comments;

          // Use total_interactions if available, otherwise sum individual metrics
          const engagement = insights.total_interactions
            || (postData.likes + postData.comments + (postData.saves || 0) + (postData.shares || 0));
          postData.engagement = engagement;
          postData.engagementRate = postData.reach > 0 ? engagement / postData.reach : 0;
        }

        await Store.upsertPost(item.id, postData);
      }

      // 4. Account insights (last 7 days)
      onProgress('Fetching account insights...');
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);

      try {
        const accountInsights = await this.getAccountInsights(
          weekAgo.toISOString(),
          now.toISOString()
        );

        // Save daily breakdown
        if (accountInsights.impressions) {
          for (const val of accountInsights.impressions) {
            const date = val.end_time.split('T')[0];
            await Store.saveAccountInsights(date, {
              impressions: val.value
            });
          }
        }
        if (accountInsights.reach) {
          for (const val of accountInsights.reach) {
            const date = val.end_time.split('T')[0];
            await Store.saveAccountInsights(date, {
              reach: val.value
            });
          }
        }
      } catch (e) {
        // Account insights may fail for some accounts, continue
        console.warn('Account insights fetch failed:', e.message);
      }

      // 5. Demographics
      onProgress('Fetching audience data...');
      try {
        const demographics = await this.getAudienceDemographics();
        if (demographics) {
          const today = new Date().toISOString().split('T')[0];
          await Store.saveAccountInsights(today, {
            followerCount: profile.followers_count,
            followingCount: profile.follows_count,
            audienceGenderAge: demographics.audience_gender_age || {},
            audienceCountry: demographics.audience_country || {},
            audienceCity: demographics.audience_city || {}
          });
        }
      } catch (e) {
        console.warn('Demographics fetch failed:', e.message);
      }

      // 6. Log sync
      onProgress('Saving sync data...');
      await Store.addSync({
        type: 'api',
        followerCount: profile.followers_count,
        followingCount: profile.follows_count,
        mediaCount: profile.media_count,
        postsProcessed: media.length,
        apiCallsUsed: this._callCount,
        status: 'success'
      });

      return {
        profile,
        postsProcessed: media.length,
        callsUsed: this._callCount
      };

    } catch (err) {
      await Store.saveConfig({ lastSyncStatus: 'error' }).catch(() => {});
      await Store.addSync({
        type: 'api',
        apiCallsUsed: this._callCount,
        status: 'error',
        errorMessage: err.message
      }).catch(() => {});
      throw err;
    }
  }
};

// Export
if (typeof window !== 'undefined') {
  window.InstagramAPI = InstagramAPI;
  window.IGApiError = IGApiError;
  window.RateLimitError = RateLimitError;
}
