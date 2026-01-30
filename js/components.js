// ============================================
// Shared UI Components
// Toast, Modal, Password, Animated Counter, Skeleton, Page Transition
// ============================================

// ---------- Toast Manager ----------
const ToastManager = {
  _container: null,

  _getContainer() {
    if (this._container) return this._container;
    this._container = document.createElement('div');
    this._container.className = 'toast-container';
    document.body.appendChild(this._container);
    return this._container;
  },

  _icons: {
    success: '\u2713',
    error: '\u2717',
    warning: '\u26A0',
    info: '\u2139'
  },

  show(type, title, message, duration = 4000) {
    const container = this._getContainer();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${this._icons[type] || ''}</span>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <div class="toast-progress" style="width: 100%"></div>
    `;

    container.appendChild(toast);

    // Trigger show animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Animate progress bar
    const progress = toast.querySelector('.toast-progress');
    progress.style.transitionDuration = duration + 'ms';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        progress.style.width = '0%';
      });
    });

    // Auto dismiss
    const timer = setTimeout(() => this._dismiss(toast), duration);

    // Click to dismiss
    toast.addEventListener('click', () => {
      clearTimeout(timer);
      this._dismiss(toast);
    });

    return toast;
  },

  _dismiss(toast) {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  },

  success(title, message) { return this.show('success', title, message); },
  error(title, message) { return this.show('error', title, message, 6000); },
  warning(title, message) { return this.show('warning', title, message, 5000); },
  info(title, message) { return this.show('info', title, message); }
};

// ---------- Modal ----------
const Modal = {
  create(options = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal ${options.className || ''}">
        ${options.content || ''}
      </div>
    `;

    // Close on overlay click (if dismissible)
    if (options.dismissible !== false) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) Modal.close(overlay);
      });
    }

    // Close on Escape
    const escHandler = (e) => {
      if (e.key === 'Escape' && options.dismissible !== false) {
        Modal.close(overlay);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(overlay);

    // Trigger open animation
    requestAnimationFrame(() => overlay.classList.add('open'));

    return overlay;
  },

  close(overlay) {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 300);
  }
};

// ---------- Password Modal ----------
const PasswordModal = {
  PASSWORD: 'instagram2025',

  check() {
    return sessionStorage.getItem('ig_authenticated') === 'true';
  },

  show() {
    if (this.check()) return Promise.resolve(true);

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay open';
      overlay.innerHTML = `
        <div class="modal password-modal">
          <div class="modal-title">Instagram Dashboard</div>
          <div class="modal-subtitle">Enter password to continue</div>
          <div class="password-input-wrap">
            <input type="password" class="input" id="pw-input" placeholder="Password" autocomplete="off" />
            <button class="password-toggle" type="button" aria-label="Show password">
              <span class="eye-icon">\u{1F441}</span>
            </button>
          </div>
          <div class="password-error" id="pw-error">Incorrect password</div>
          <button class="btn btn-primary w-full" id="pw-submit">Unlock</button>
        </div>
      `;

      document.body.appendChild(overlay);

      const input = overlay.querySelector('#pw-input');
      const error = overlay.querySelector('#pw-error');
      const submit = overlay.querySelector('#pw-submit');
      const toggle = overlay.querySelector('.password-toggle');
      const modal = overlay.querySelector('.modal');

      input.focus();

      const attempt = () => {
        if (input.value === this.PASSWORD) {
          sessionStorage.setItem('ig_authenticated', 'true');
          overlay.classList.remove('open');
          setTimeout(() => overlay.remove(), 300);
          resolve(true);
        } else {
          error.classList.add('show');
          modal.classList.add('shake');
          setTimeout(() => modal.classList.remove('shake'), 500);
          input.value = '';
          input.focus();
        }
      };

      submit.addEventListener('click', attempt);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') attempt();
        error.classList.remove('show');
      });

      toggle.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
      });
    });
  }
};

// ---------- Animated Counter ----------
const AnimatedCounter = {
  animate(element, target, duration = 1200) {
    const start = parseInt(element.textContent.replace(/[^0-9-]/g, '')) || 0;
    const startTime = performance.now();

    const format = (n) => {
      if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + 'K';
      return n.toLocaleString();
    };

    const easeOutExpo = (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);
      const current = Math.round(start + (target - start) * easedProgress);

      element.textContent = format(current);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  },

  observeAll(selector = '[data-counter]') {
    const elements = document.querySelectorAll(selector);
    if (!elements.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.dataset.counter, 10);
          if (!isNaN(target)) {
            this.animate(el, target);
          }
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.3 });

    elements.forEach(el => observer.observe(el));
  }
};

// ---------- Skeleton Loaders ----------
const Skeleton = {
  card(count = 1) {
    return Array(count).fill(0).map(() =>
      `<div class="glass-card-static skeleton-card skeleton" style="padding:1.25rem">
        <div class="skeleton skeleton-text sm"></div>
        <div class="skeleton skeleton-heading"></div>
        <div class="skeleton skeleton-text md"></div>
      </div>`
    ).join('');
  },

  metricCards() {
    return `<div class="metric-grid">
      ${Array(4).fill(0).map(() =>
        `<div class="glass-card-static metric-card">
          <div class="skeleton skeleton-text sm" style="margin-bottom:0.75rem"></div>
          <div class="skeleton skeleton-heading" style="width:60%"></div>
        </div>`
      ).join('')}
    </div>`;
  },

  postRow() {
    return `<div class="scroll-row">
      ${Array(6).fill(0).map(() =>
        `<div class="glass-card-static" style="min-width:200px;padding:0.75rem">
          <div class="skeleton skeleton-thumbnail" style="margin-bottom:0.75rem"></div>
          <div class="skeleton skeleton-text md"></div>
          <div class="skeleton skeleton-text sm"></div>
        </div>`
      ).join('')}
    </div>`;
  },

  timeline(count = 5) {
    return `<div class="timeline">
      ${Array(count).fill(0).map(() =>
        `<div class="timeline-item">
          <div class="skeleton" style="width:16px;height:16px;border-radius:50%;position:absolute;left:-2rem"></div>
          <div class="glass-card-static" style="padding:1rem">
            <div class="skeleton skeleton-text sm"></div>
            <div class="skeleton skeleton-text lg"></div>
          </div>
        </div>`
      ).join('')}
    </div>`;
  }
};

// ---------- Page Transition ----------
const PageTransition = {
  init() {
    // Staggered entry for elements with .animate-in
    const elements = document.querySelectorAll('.animate-in');
    elements.forEach((el, i) => {
      el.style.animationDelay = `${i * 0.05}s`;
    });

    // Scroll reveal
    this._setupScrollReveal();
  },

  _setupScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.scroll-reveal').forEach(el => {
      observer.observe(el);
    });
  }
};

// ---------- Navigation Builder (Sidebar) ----------
const Nav = {
  _icons: {
    dashboard: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>',
    posts: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/></svg>',
    analytics: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>',
    followers: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>',
    history: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>',
    settings: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>'
  },

  build(activePage) {
    const mainPages = [
      { name: 'Dashboard', href: 'index.html', id: 'dashboard' },
      { name: 'Followers', href: 'followers.html', id: 'followers' },
      { name: 'Analytics', href: 'analytics.html', id: 'analytics' },
      { name: 'Posts', href: 'posts.html', id: 'posts' },
      { name: 'History', href: 'history.html', id: 'history' }
    ];

    const bottomPages = [
      { name: 'Settings', href: 'settings.html', id: 'settings' }
    ];

    const buildLink = (p) => `
      <a href="${p.href}" class="sidebar-link ${p.id === activePage ? 'active' : ''}">
        <span class="sidebar-link-icon">${this._icons[p.id] || ''}</span>
        <span>${p.name}</span>
      </a>`;

    const mainLinks = mainPages.map(buildLink).join('');
    const bottomLinks = bottomPages.map(buildLink).join('');

    return `
      <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Open menu">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>
      </button>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <nav class="sidebar" id="sidebar">
        <a href="index.html" class="sidebar-brand">
          <div class="sidebar-brand-icon">
            <svg viewBox="0 0 20 20" fill="white" width="20" height="20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
          </div>
          <span class="sidebar-brand-text">Insights</span>
        </a>
        <div class="sidebar-nav">
          ${mainLinks}
          <div class="sidebar-section">
            ${bottomLinks}
          </div>
        </div>
      </nav>
    `;
  },

  inject(activePage) {
    document.body.insertAdjacentHTML('afterbegin', this.build(activePage));

    // Wrap existing page content in page-wrap div
    const pageContent = document.getElementById('page');
    if (pageContent && !pageContent.closest('.page-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'page-wrap';
      pageContent.parentNode.insertBefore(wrap, pageContent);
      wrap.appendChild(pageContent);
    }

    // Mobile sidebar toggle
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (toggle && sidebar && overlay) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
      });
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      });
    }
  }
};

// ---------- Token Warning ----------
const TokenWarning = {
  async check() {
    try {
      const config = await Store.getConfig();
      if (!config?.tokenExpiresAt) return;

      const expiresAt = new Date(config.tokenExpiresAt);
      const now = new Date();
      const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

      if (daysLeft <= 0) {
        this._showBanner('danger', 'Token expired! Go to Settings to add a new token.');
      } else if (daysLeft <= 3) {
        this._showBanner('danger', `Token expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}! Refresh it in Settings.`);
      } else if (daysLeft <= 7) {
        this._showBanner('warning', `Token expires in ${daysLeft} days. Consider refreshing it in Settings.`);
      }
    } catch (e) {
      // Silent fail — config may not exist yet
    }
  },

  _showBanner(type, message) {
    const container = document.querySelector('.page-content') || document.querySelector('.page-container') || document.getElementById('page');
    if (!container) return;

    const banner = document.createElement('div');
    banner.className = `token-banner ${type}`;
    banner.innerHTML = `<span>\u26A0</span> <span>${message}</span> <a href="settings.html" style="margin-left:auto;text-decoration:underline;font-weight:600;color:inherit;">Settings &rarr;</a>`;
    container.prepend(banner);
  }
};

// ---------- Auto Sync Helper ----------
const AutoSync = {
  async run() {
    try {
      if (typeof Store === 'undefined' || typeof InstagramAPI === 'undefined') return;
      const config = await Store.getConfig();
      if (!config?.accessToken || !config.lastSyncAt) return;

      const hoursSince = (Date.now() - new Date(config.lastSyncAt).getTime()) / (1000 * 60 * 60);
      if (hoursSince >= 6) {
        await InstagramAPI.quickSync();
        ToastManager.info('Auto-Sync', 'Data refreshed in background.');
        return true;
      }
      return false;
    } catch (e) {
      console.warn('Auto-sync failed:', e.message);
      return false;
    }
  }
};

// ---------- Utility Helpers ----------
const Utils = {
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  timeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  },

  formatNumber(n) {
    if (n == null) return '—';
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
  },

  formatPercent(n) {
    if (n == null) return '—';
    return (n * 100).toFixed(2) + '%';
  },

  formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  },

  formatDateTime(dateStr) {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  },

  engagementClass(rate, avgRate) {
    if (rate > avgRate * 1.2) return 'engagement-high';
    if (rate < avgRate * 0.8) return 'engagement-low';
    return 'engagement-avg';
  },

  truncate(str, len = 80) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  }
};

// ---------- Exports ----------
if (typeof window !== 'undefined') {
  window.ToastManager = ToastManager;
  window.Modal = Modal;
  window.PasswordModal = PasswordModal;
  window.AnimatedCounter = AnimatedCounter;
  window.Skeleton = Skeleton;
  window.PageTransition = PageTransition;
  window.Nav = Nav;
  window.TokenWarning = TokenWarning;
  window.AutoSync = AutoSync;
  window.Utils = Utils;
}
