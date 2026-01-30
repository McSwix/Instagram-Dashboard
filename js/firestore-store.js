// ============================================
// Firestore Data Store — Firebase singleton + data access layer
// ============================================

// ---------- Firebase Configuration ----------
const firebaseConfig = {
  apiKey: "AIzaSyBIg6RfXbVdS26XbZzzzsoHlBM2xrXPb5Y",
  authDomain: "instagram-dashboard-v2.firebaseapp.com",
  projectId: "instagram-dashboard-v2",
  storageBucket: "instagram-dashboard-v2.firebasestorage.app",
  messagingSenderId: "620439111732",
  appId: "1:620439111732:web:5d9390431b7d91ec9aa261"
};

// ---------- Firebase Init (CDN compat mode) ----------
// These are loaded from CDN script tags in each HTML page:
//   <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
//   <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>

let _app = null;
let _db = null;

function initFirebase() {
  if (_db) return _db;

  if (typeof firebase === 'undefined') {
    throw new Error('Firebase SDK not loaded. Include the Firebase CDN scripts before this module.');
  }

  if (!firebase.apps.length) {
    _app = firebase.initializeApp(firebaseConfig);
  } else {
    _app = firebase.apps[0];
  }

  _db = firebase.firestore();
  return _db;
}

function getDb() {
  if (!_db) initFirebase();
  return _db;
}

// ---------- Store API ----------
const Store = {

  // --- Init ---
  init() {
    return initFirebase();
  },

  // --- Config / Settings ---
  async getConfig() {
    const doc = await getDb().collection('config').doc('settings').get();
    return doc.exists ? doc.data() : null;
  },

  async saveConfig(data) {
    await getDb().collection('config').doc('settings').set(data, { merge: true });
  },

  // --- Syncs ---
  async addSync(data) {
    const ref = await getDb().collection('syncs').add({
      ...data,
      timestamp: data.timestamp || new Date().toISOString()
    });
    return ref.id;
  },

  async getRecentSyncs(count = 20) {
    const snapshot = await getDb()
      .collection('syncs')
      .orderBy('timestamp', 'desc')
      .limit(count)
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // --- Posts ---
  async upsertPost(igMediaId, data) {
    await getDb().collection('posts').doc(igMediaId).set({
      ...data,
      igMediaId,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  },

  async getPost(igMediaId) {
    const doc = await getDb().collection('posts').doc(igMediaId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async getAllPosts(orderField = 'timestamp', dir = 'desc') {
    const snapshot = await getDb()
      .collection('posts')
      .orderBy(orderField, dir)
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getTopPosts(metric = 'engagementRate', count = 5) {
    const snapshot = await getDb()
      .collection('posts')
      .orderBy(metric, 'desc')
      .limit(count)
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getPostCount() {
    const snapshot = await getDb().collection('posts').get();
    return snapshot.size;
  },

  // --- Account Insights ---
  async saveAccountInsights(date, data) {
    await getDb().collection('account_insights').doc(date).set({
      ...data,
      date
    }, { merge: true });
  },

  async getAccountInsight(date) {
    const doc = await getDb().collection('account_insights').doc(date).get();
    return doc.exists ? doc.data() : null;
  },

  async getAccountInsightRange(startDate, endDate) {
    const snapshot = await getDb()
      .collection('account_insights')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .orderBy('date', 'asc')
      .get();
    return snapshot.docs.map(d => d.data());
  },

  async getLatestAccountInsight() {
    const snapshot = await getDb()
      .collection('account_insights')
      .orderBy('date', 'desc')
      .limit(1)
      .get();
    return snapshot.empty ? null : snapshot.docs[0].data();
  },

  // --- Post Metric Snapshots (for delta tracking) ---
  // Stores a snapshot of each post's metrics on every sync, so we can
  // compute "engagement received in the last N days" by diffing snapshots.
  async savePostSnapshot(igMediaId, metrics) {
    const ts = new Date().toISOString();
    const docId = igMediaId + '_' + ts.split('T')[0]; // one snapshot per post per day
    await getDb().collection('post_snapshots').doc(docId).set({
      igMediaId,
      date: ts.split('T')[0],
      timestamp: ts,
      likes: metrics.likes || 0,
      comments: metrics.comments || 0,
      saves: metrics.saves || 0,
      shares: metrics.shares || 0,
      reach: metrics.reach || 0,
      impressions: metrics.impressions || 0,
      engagement: metrics.engagement || 0
    });
  },

  // Get all snapshots within a date range
  async getPostSnapshotsRange(startDate, endDate) {
    const snapshot = await getDb()
      .collection('post_snapshots')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .orderBy('date', 'asc')
      .get();
    return snapshot.docs.map(d => d.data());
  },

  // Get the latest snapshot for each post on or before a given date
  async getPostSnapshotsOnDate(date) {
    const snapshot = await getDb()
      .collection('post_snapshots')
      .where('date', '==', date)
      .get();
    return snapshot.docs.map(d => d.data());
  },

  // Get earliest and latest snapshots for delta calculation
  async getSnapshotBoundaries(startDate, endDate) {
    // Get earliest snapshots (one per post at start of period)
    const startSnaps = await getDb()
      .collection('post_snapshots')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .orderBy('date', 'asc')
      .get();

    if (startSnaps.empty) return { start: {}, end: {} };

    const allSnaps = startSnaps.docs.map(d => d.data());

    // Group by igMediaId, take earliest and latest per post
    const byPost = {};
    for (const snap of allSnaps) {
      if (!byPost[snap.igMediaId]) {
        byPost[snap.igMediaId] = { earliest: snap, latest: snap };
      } else {
        if (snap.date < byPost[snap.igMediaId].earliest.date) {
          byPost[snap.igMediaId].earliest = snap;
        }
        if (snap.date > byPost[snap.igMediaId].latest.date) {
          byPost[snap.igMediaId].latest = snap;
        }
      }
    }

    return byPost;
  },

  // --- Snapshots (Legacy) ---
  async addSnapshot(data) {
    const ref = await getDb().collection('snapshots').add({
      ...data,
      timestamp: data.timestamp || new Date().toISOString()
    });
    return ref.id;
  },

  async getLatestSnapshots(count = 2) {
    const snapshot = await getDb()
      .collection('snapshots')
      .orderBy('timestamp', 'desc')
      .limit(count)
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getAllSnapshots() {
    const snapshot = await getDb()
      .collection('snapshots')
      .orderBy('timestamp', 'desc')
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  }
};

// Export for use as module or global
if (typeof window !== 'undefined') {
  window.Store = Store;
}
