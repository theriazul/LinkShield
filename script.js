const STORAGE_KEYS = {
  theme: 'linkshield-theme-preference',
  history: 'linkshield-report-history',
  analyticsEnabled: 'linkshield-analytics-enabled',
  analyticsVisitor: 'linkshield-analytics-visitor-id',
  analyticsSession: 'linkshield-analytics-session-id'
};

const state = {
  activeView: '',
  lastUrlReport: null,
  lastMessageReport: null,
  selectedHistoryId: null,
  lastUrlReportSource: 'local',
  lastTrackedPage: null,
  analyticsRange: '7d',
  analyticsRequestId: 0,
  analyticsTrackingFailed: false
};

const analyticsCounterAnimations = new WeakMap();
let mobileBottomNotchAnimationFrame = 0;
let mobileBottomNotchCenter = null;
const API_BASE_URL = document.querySelector('meta[name="linkshield-api-base"]')?.content || 'http://localhost:8001';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

async function fetchScanApi(url) {
  const response = await fetch(`${API_BASE_URL}/api/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ url })
  });

  if (!response.ok) {
    let detail = 'The backend rejected the scan request.';
    try {
      const data = await response.json();
      detail = Array.isArray(data?.detail) ? data.detail[0]?.msg || 'The backend rejected the scan request.' : data?.detail || detail;
    } catch {
      const text = await response.text();
      if (text) detail = text;
    }
    throw new Error(detail);
  }

  return response.json();
}

function normalizeScanPayload(result) {
  if (!result || typeof result !== 'object') return null;
  const findings = Array.isArray(result.findings)
    ? result.findings.map((finding) => ({
        title: finding.title || 'Finding',
        detail: finding.detail || 'No additional information provided.',
        severity: finding.severity === 'bad' ? 'bad' : finding.severity === 'warn' ? 'warn' : 'good'
      }))
    : [];

  return {
    url: result.url || '',
    score: Number(result.score) || 0,
    level: result.level || 'low',
    flags: findings,
    note: result.note || 'Heuristic analysis only; this does not prove a domain is safe.'
  };
}

function showToast(message) {
  const toast = $('#toast');
  const toastMessage = $('#toastMessage');
  if (!toast || !toastMessage) return;
  toastMessage.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function applyTheme(theme) {
  const selectedTheme = theme === 'light' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', selectedTheme);
  const themeInput = $('#themePreference');
  if (themeInput) themeInput.checked = selectedTheme === 'light';
  localStorage.setItem(STORAGE_KEYS.theme, selectedTheme);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', selectedTheme === 'light' ? '#f4f5f5' : '#090909');
}

function toggleTheme() {
  const nextTheme = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  showToast(nextTheme === 'light' ? 'Light theme enabled' : 'Dark theme enabled');
}

function closeMobileNavigation() {
  const navigation = $('#mainNavigation');
  const menuButton = $('#mobileMenu');
  if (!navigation || !menuButton) return;

  navigation.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation menu');
  if (navigation.contains(document.activeElement)) menuButton.focus();
}

function updateMobileBottomIndicator(viewName = state.activeView, animate = true) {
  const navigation = $('.mobile-bottom-nav');
  const shape = $('.mobile-bottom-shape');
  const path = $('.mobile-bottom-shape-path');
  if (!navigation || !shape || !path) return;

  const activeItem = $$('.mobile-bottom-item').find((item) => item.dataset.view === viewName);
  if (!activeItem) return;

  const navRect = navigation.getBoundingClientRect();
  const itemRect = activeItem.getBoundingClientRect();
  if (!navRect.width || !navRect.height || !itemRect.width) return;

  const width = navRect.width;
  const height = navRect.height;
  const center = itemRect.left + itemRect.width / 2 - navRect.left;
  shape.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const drawShapeAt = (notchCenter) => {
    const leftSpace = notchCenter;
    const rightSpace = width - notchCenter;
    const notchHalf = Math.min(28, Math.max(0, leftSpace - 14), Math.max(0, rightSpace - 14));
    const topLeftRadius = Math.min(14, leftSpace - notchHalf);
    const topRightRadius = Math.min(14, rightSpace - notchHalf);
    const bottomRadius = Math.min(26, width / 2, height / 2);
    const notchLeft = notchCenter - notchHalf;
    const notchRight = notchCenter + notchHalf;
    const notchDepth = Math.min(26, height - 48);

    navigation.style.setProperty('--mobile-notch-center', `${notchCenter}px`);
    path.setAttribute(
      'd',
      [
        `M ${topLeftRadius} 8`,
        `H ${notchLeft}`,
        `C ${notchLeft + notchHalf * 0.48} 8 ${notchCenter - notchHalf * 0.58} ${notchDepth} ${notchCenter} ${notchDepth}`,
        `C ${notchCenter + notchHalf * 0.58} ${notchDepth} ${notchRight - notchHalf * 0.48} 8 ${notchRight} 8`,
        `H ${width - topRightRadius}`,
        `Q ${width} 8 ${width} ${8 + topRightRadius}`,
        `V ${height - bottomRadius}`,
        `Q ${width} ${height} ${width - bottomRadius} ${height}`,
        `H ${bottomRadius}`,
        `Q 0 ${height} 0 ${height - bottomRadius}`,
        `V ${8 + topLeftRadius}`,
        `Q 0 8 ${topLeftRadius} 8`,
        'Z'
      ].join(' ')
    );
  };

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (mobileBottomNotchAnimationFrame) {
    window.cancelAnimationFrame(mobileBottomNotchAnimationFrame);
    mobileBottomNotchAnimationFrame = 0;
  }

  if (!animate || prefersReducedMotion || mobileBottomNotchCenter === null || !path.getAttribute('d')) {
    mobileBottomNotchCenter = center;
    drawShapeAt(center);
    return;
  }

  const from = mobileBottomNotchCenter;
  const startTime = performance.now();
  const duration = 380;
  const animatePosition = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - ((1 - progress) ** 3);
    mobileBottomNotchCenter = from + (center - from) * eased;
    drawShapeAt(mobileBottomNotchCenter);

    if (progress < 1) {
      mobileBottomNotchAnimationFrame = window.requestAnimationFrame(animatePosition);
    } else {
      mobileBottomNotchAnimationFrame = 0;
      mobileBottomNotchCenter = center;
    }
  };

  mobileBottomNotchAnimationFrame = window.requestAnimationFrame(animatePosition);
}

function setActiveView(viewName) {
  const validViews = ['overview', 'scanner', 'scam', 'qr', 'password', 'utilities', 'history', 'analytics', 'learning', 'settings'];
  if (!validViews.includes(viewName)) return;

  const changedView = state.activeView !== viewName;
  state.activeView = viewName;
  document.body.classList.toggle('overview-active', viewName === 'overview');
  $$('.view-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `view-${viewName}`);
  });

  $$('.nav-item').forEach((button) => {
    const isActive = button.dataset.view === viewName;
    button.classList.toggle('active', isActive);
    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });
  updateMobileBottomIndicator(viewName);

  const labels = {
    overview: ['Overview', 'Stay One Step Ahead.'],
    scanner: ['Link scanner', 'Inspect a URL before you click'],
    scam: ['Scam analyzer', 'Review suspicious text'],
    qr: ['QR inspector', 'Decode and review QR codes'],
    password: ['Password checker', 'Check password strength'],
    utilities: ['URL utilities', 'Encode, decode, hash, and normalize'],
    history: ['Reports & history', 'Saved analysis history'],
    analytics: ['Website analytics', 'Real, aggregated visitor activity'],
    learning: ['Security learning', 'Learn how to spot scams'],
    settings: ['Settings', 'Theme and privacy preferences']
  };

  const [kicker, title] = labels[viewName] || labels.overview;
  const pageKicker = $('#pageKicker');
  const pageTitle = $('#pageTitle');
  if (pageKicker) pageKicker.textContent = kicker;
  if (pageTitle) pageTitle.textContent = title;

  if (changedView) {
    trackPageView(viewName);
    if (viewName === 'analytics') loadVisitorAnalytics();
  }

  if (window.location.hash !== `#${viewName}`) {
    window.history.pushState(null, '', `#${viewName}`);
  }

  if (changedView) window.scrollTo(0, 0);
  closeMobileNavigation();
}

function bindRouteButtons() {
  $$('.nav-item, [data-view]').forEach((button) => {
    if (!button.dataset.view) return;
    button.addEventListener('click', () => setActiveView(button.dataset.view));
  });
}

function restoreHashView() {
  const hash = (window.location.hash || '#overview').replace('#', '').trim();
  const valid = ['overview', 'scanner', 'scam', 'qr', 'password', 'utilities', 'history', 'analytics', 'learning', 'settings'];
  setActiveView(valid.includes(hash) ? hash : 'overview');
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  const history = loadHistory();
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
}

function addHistoryEntry(entry) {
  const history = loadHistory();
  const sanitizedEntry = JSON.parse(JSON.stringify({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...entry
  }));

  if (sanitizedEntry.details && typeof sanitizedEntry.details === 'object') {
    delete sanitizedEntry.details.password;
    delete sanitizedEntry.details.passwordValue;
  }
  if (sanitizedEntry.password) delete sanitizedEntry.password;

  history.push(sanitizedEntry);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  return sanitizedEntry;
}

function formatDate(dateString) {
  if (!dateString) return 'Unknown date';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function renderOverview() {
  const history = loadHistory();
  const totalUrls = history.filter((record) => record.type === 'url').length;
  const highRisk = history.filter((record) => record.riskLevel === 'high').length;
  const messages = history.filter((record) => record.type === 'message').length;
  const savedReports = history.length;

  const statTotalUrls = $('#statTotalUrls');
  const statHighRisk = $('#statHighRisk');
  const statMessages = $('#statMessages');
  const statSavedReports = $('#statSavedReports');

  if (statTotalUrls) statTotalUrls.textContent = String(totalUrls);
  if (statHighRisk) statHighRisk.textContent = String(highRisk);
  if (statMessages) statMessages.textContent = String(messages);
  if (statSavedReports) statSavedReports.textContent = String(savedReports);

  const latestRecord = [...history].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0];
  const updatedAt = $('#overviewLastUpdated');
  if (updatedAt) updatedAt.textContent = latestRecord
    ? `Latest saved check: ${formatDate(latestRecord.createdAt)}`
    : 'No saved checks yet';
  renderSecurityActivityChart(history);

  const recentList = $('#recentActivityList');
  if (!recentList) return;
  const recent = [...history].reverse().slice(0, 4);

  if (!recent.length) {
    recentList.innerHTML = '<div class="empty-state"><div class="empty-graphic"><i data-lucide="file-text"></i></div><h4>No activity yet</h4><p>Save a URL or message check to build your local security timeline.</p></div>';
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  recentList.innerHTML = recent.map((record) => {
    const badgeClass = record.riskLevel === 'high' ? 'high' : record.riskLevel === 'caution' ? 'caution' : 'low';
    const title = record.title || (record.type === 'url' ? 'URL inspection' : record.type === 'message' ? 'Message analysis' : record.type === 'qr' ? 'QR inspection' : 'Security check');
    return `
      <div class="activity-item">
        <span class="activity-flag ${badgeClass}"></span>
        <div class="activity-copy">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(record.summary || 'Saved report')}</span><br>
          <small>${escapeHtml(formatDate(record.createdAt))}</small>
        </div>
        <button class="small-button" type="button" data-view="history">Open</button>
      </div>
    `;
  }).join('');

  recentList.querySelectorAll('[data-view="history"]').forEach((button) => {
    button.addEventListener('click', () => setActiveView('history'));
  });

  if (window.lucide) window.lucide.createIcons();
}

function renderSecurityActivityChart(history) {
  const chart = $('#securityActivityChart');
  if (!chart) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return date;
  });
  const counts = days.map((day) => history.filter((record) => {
    const created = new Date(record.createdAt);
    return !Number.isNaN(created.getTime())
      && created.getFullYear() === day.getFullYear()
      && created.getMonth() === day.getMonth()
      && created.getDate() === day.getDate();
  }).length);

  if (!counts.some((count) => count > 0)) {
    chart.innerHTML = '<p class="chart-empty">Security activity will appear after you save a check.</p>';
    return;
  }

  chart.innerHTML = renderTrendSvg(
    days.map((day, index) => ({
      period: day.toISOString(),
      visitors: counts[index],
      page_views: counts[index]
    })),
    'security'
  );
}

function makeAnonymousId(storageKey, storage) {
  try {
    const current = storage.getItem(storageKey);
    if (current && /^[a-f0-9]{32}$/.test(current)) return current;
    if (!window.crypto || !window.crypto.getRandomValues) return null;
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    const generated = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    storage.setItem(storageKey, generated);
    return generated;
  } catch {
    return null;
  }
}

function isAnalyticsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEYS.analyticsEnabled) !== 'false';
  } catch {
    return false;
  }
}

function setAnalyticsStatus(message, hasError = false) {
  const status = $('#analyticsCollectionStatus');
  if (!status) return;
  status.classList.toggle('is-error', hasError);
  status.innerHTML = `<span class="status-dot"></span>${escapeHtml(message)}`;
}

function trackPageView(page) {
  if (state.lastTrackedPage === page) return;
  state.lastTrackedPage = page;
  if (!isAnalyticsEnabled()) return;

  const visitorId = makeAnonymousId(STORAGE_KEYS.analyticsVisitor, localStorage);
  const sessionId = makeAnonymousId(STORAGE_KEYS.analyticsSession, sessionStorage);
  if (!visitorId || !sessionId) {
    setAnalyticsStatus('Analytics unavailable in this browser', true);
    return;
  }

  fetch(`${API_BASE_URL}/api/analytics/pageview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ visitor_id: visitorId, session_id: sessionId, page }),
    keepalive: true
  }).then((response) => {
    if (!response.ok) throw new Error(`Analytics request failed (${response.status}).`);
    state.analyticsTrackingFailed = false;
    if (state.activeView === 'analytics') setAnalyticsStatus('Collecting pseudonymous visits');
  }).catch(() => {
    state.analyticsTrackingFailed = true;
    setAnalyticsStatus('Analytics service temporarily unavailable', true);
  });
}

function animateAnalyticsCounter(element, targetValue) {
  const target = Math.max(0, Math.floor(Number(targetValue) || 0));
  const previousAnimation = analyticsCounterAnimations.get(element);
  if (previousAnimation) {
    previousAnimation.observer?.disconnect();
    if (previousAnimation.frame) cancelAnimationFrame(previousAnimation.frame);
  }

  const startValue = Number(element.dataset.currentValue) || 0;
  const animation = { observer: null, frame: 0 };
  analyticsCounterAnimations.set(element, animation);
  element.dataset.target = String(target);
  const showTarget = () => {
    const startedAt = performance.now();
    const duration = 650;
    const step = (timestamp) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const value = Math.round(startValue + (target - startValue) * progress);
      element.dataset.currentValue = String(value);
      element.textContent = new Intl.NumberFormat().format(value);
      if (progress < 1) animation.frame = requestAnimationFrame(step);
    };
    animation.frame = requestAnimationFrame(step);
  };

  if (!('IntersectionObserver' in window)) {
    element.dataset.currentValue = String(target);
    element.textContent = new Intl.NumberFormat().format(target);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      showTarget();
    }
  }, { threshold: 0.1 });
  animation.observer = observer;
  observer.observe(element);
}

function renderTrendSvg(series, chartType) {
  if (!Array.isArray(series) || series.length === 0) {
    return '<p class="chart-empty">No recorded activity is available for this period.</p>';
  }

  const width = 800;
  const height = 250;
  const left = 42;
  const right = 18;
  const top = 18;
  const bottom = 40;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = series.map((item) => Math.max(0, Number(item.visitors) || 0));
  const maximum = Math.max(1, ...values);
  const points = series.map((item, index) => {
    const x = left + (series.length === 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth);
    const y = top + plotHeight - (values[index] / maximum) * plotHeight;
    return { x, y, item, value: values[index] };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${left},${top + plotHeight} ${line} ${left + plotWidth},${top + plotHeight}`;
  const tickIndexes = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  const formatLabel = (period) => {
    const date = new Date(period);
    if (Number.isNaN(date.getTime())) return '';
    const timezone = chartType === 'visitor' ? { timeZone: 'UTC' } : {};
    return chartType === 'visitor' && state.analyticsRange === '24h'
      ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', ...timezone }).format(date)
      : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', ...timezone }).format(date);
  };
  const pointTitles = points.map((point) => {
    const date = new Date(point.item.period);
    const fullDate = Number.isNaN(date.getTime())
      ? point.item.period
      : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        ...(chartType === 'visitor' && state.analyticsRange === '24h' ? { timeStyle: 'short' } : {}),
        ...(chartType === 'visitor' ? { timeZone: 'UTC' } : {})
      }).format(date);
    const metricName = chartType === 'visitor'
      ? point.value === 1 ? 'visitor' : 'visitors'
      : point.value === 1 ? 'saved check' : 'saved checks';
    const countLabel = `${point.value} ${metricName}`;
    return `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4"><title>${escapeHtml(`${fullDate}: ${countLabel}`)}</title></circle>`;
  }).join('');
  const labels = tickIndexes.map((index) => {
    const x = points[index].x;
    const anchor = index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle';
    return `<text class="chart-label" x="${x}" y="${height - 10}" text-anchor="${anchor}">${escapeHtml(formatLabel(series[index].period))}</text>`;
  }).join('');
  const grid = [0, 0.5, 1].map((ratio) => {
    const y = top + ratio * plotHeight;
    const label = Math.round(maximum * (1 - ratio));
    return `<line class="chart-gridline" x1="${left}" y1="${y}" x2="${left + plotWidth}" y2="${y}"></line><text class="chart-label" x="${left - 8}" y="${y + 4}" text-anchor="end">${label}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${chartType === 'visitor' ? 'Daily unique visitor trend' : 'Saved security checks over the last seven days'}"><title>${chartType === 'visitor' ? 'Visitor trend' : 'Security activity'}</title>${grid}<polygon class="chart-area" points="${area}"></polygon><polyline class="chart-line" points="${line}"></polyline>${pointTitles}${labels}</svg>`;
}

async function loadVisitorAnalytics(reportRange = state.analyticsRange) {
  state.analyticsRange = reportRange;
  const requestId = ++state.analyticsRequestId;
  const chart = $('#visitorChart');
  const updated = $('#analyticsLastUpdated');
  const description = $('#visitorRangeDescription');
  if (!chart) return;

  const rangeDescriptions = {
    '24h': 'Hourly unique visitors, last 24 hours (UTC)',
    '7d': 'Daily unique visitors, last 7 days (UTC)',
    '30d': 'Daily unique visitors, last 30 days (UTC)'
  };
  if (description) description.textContent = rangeDescriptions[reportRange];
  document.querySelectorAll('[data-analytics-range]').forEach((button) => {
    const selected = button.dataset.analyticsRange === reportRange;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  chart.innerHTML = '<p class="chart-empty">Loading visitor analytics…</p>';
  setAnalyticsStatus('Loading aggregated analytics');

  try {
    const response = await fetch(`${API_BASE_URL}/api/analytics?report_range=${encodeURIComponent(reportRange)}`, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Analytics request failed (${response.status}).`);
    const data = await response.json();
    if (requestId !== state.analyticsRequestId) return;
    const metricKeys = ['page_views', 'unique_visitors', 'today_visitors', 'active_visitors'];
    const validSummary = metricKeys.every((key) => Number.isSafeInteger(data?.summary?.[key]) && data.summary[key] >= 0);
    const validSeries = Array.isArray(data?.series) && data.series.every((point) => (
      typeof point.period === 'string'
      && Number.isSafeInteger(point.visitors)
      && point.visitors >= 0
      && Number.isSafeInteger(point.page_views)
      && point.page_views >= 0
    ));
    if (!validSummary || !validSeries) {
      throw new Error('Analytics service returned an invalid response.');
    }

    metricKeys.forEach((key) => {
      const metric = document.querySelector(`[data-analytics-count="${key}"]`);
      if (metric) animateAnalyticsCounter(metric, data.summary[key]);
    });
    const hasRecordedActivity = data.series.some((point) => Number(point.page_views) > 0);
    chart.innerHTML = hasRecordedActivity
      ? renderTrendSvg(data.series, 'visitor')
      : '<p class="chart-empty">Visitor analytics will appear as real visits are recorded.</p>';
    const generatedAt = new Date(data.generated_at);
    if (updated) {
      updated.textContent = Number.isNaN(generatedAt.getTime())
        ? 'Analytics updated by the server.'
        : `Last successful update: ${new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'UTC'
        }).format(generatedAt)} UTC`;
    }
    if (!isAnalyticsEnabled()) {
      setAnalyticsStatus('Collection disabled in this browser');
    } else if (state.analyticsTrackingFailed) {
      setAnalyticsStatus('Page-view collection temporarily unavailable', true);
    } else {
      setAnalyticsStatus('Collecting pseudonymous visits');
    }
  } catch (error) {
    if (requestId !== state.analyticsRequestId) return;
    document.querySelectorAll('[data-analytics-count]').forEach((metric) => {
      const animation = analyticsCounterAnimations.get(metric);
      animation?.observer?.disconnect();
      if (animation?.frame) cancelAnimationFrame(animation.frame);
      analyticsCounterAnimations.delete(metric);
      metric.textContent = '—';
      delete metric.dataset.target;
      delete metric.dataset.currentValue;
    });
    chart.innerHTML = '<p class="chart-empty">Visitor analytics could not be loaded. Check that the LinkShield API is running, then try again.</p>';
    if (updated) updated.textContent = 'No successful update is available.';
    setAnalyticsStatus('Analytics service unavailable', true);
  }
}

function buildUrlReport(result) {
  const severity = result.level === 'high' ? 'high' : result.level === 'caution' ? 'caution' : 'low';
  return {
    type: 'url',
    title: 'URL inspection',
    summary: `${result.url}`,
    riskLevel: severity,
    score: result.score,
    details: { url: result.url, findings: result.flags, level: result.level },
    createdAt: new Date().toISOString()
  };
}

function normalizeAndParse(raw) {
  let value = String(raw || '').trim();
  if (!value) throw new Error('Enter a URL to inspect.');
  if (/\s/.test(value)) throw new Error('The URL contains whitespace. Remove extra spaces and try again.');
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) value = `https://${value}`;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('That URL format is invalid. Please include a complete domain or full URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS links can be inspected in this demo.');
  }

  if (!parsed.hostname || !parsed.hostname.includes('.')) {
    throw new Error('Enter a complete domain name such as example.com.');
  }

  return parsed;
}

function inspectUrl(parsed) {
  const url = parsed.href;
  const host = parsed.hostname.toLowerCase();
  const full = `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase();
  const findings = [];
  let score = 0;

  const add = (title, detail, severity) => {
    findings.push({ title, detail, severity });
  };

  if (parsed.protocol === 'https:') {
    add('Encrypted connection format', 'The URL uses HTTPS to protect the connection in transit.', 'good');
  } else {
    score += 18;
    add('Unencrypted HTTP', 'This URL uses HTTP rather than HTTPS, which increases risk for account and password traffic.', 'warn');
  }

  const punycode = host.includes('xn--') || host.startsWith('xn--');
  if (punycode) {
    score += 24;
    add('Punycode domain detected', 'The hostname uses punycode encoding, which can be used to imitate legitimate domains.', 'warn');
  } else {
    add('Domain encoding appears normal', 'No punycode marker or encoded hostname was detected.', 'good');
  }

  const ipHost = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
  if (ipHost) {
    score += 22;
    add('Direct IP address host', 'The URL points to an IP address instead of a regular domain, which is unusual for a normal website.', 'warn');
  } else {
    add('Hostname format looks domain-like', 'The hostname does not look like a direct IP address.', 'good');
  }

  const suspiciousWords = ['login', 'verify', 'verification', 'secure', 'account', 'password', 'wallet', 'recover', 'update', 'signin', 'confirm', 'payment', 'gift', 'free-prize'];
  const foundWords = suspiciousWords.filter((word) => full.includes(word));
  if (foundWords.length) {
    score += Math.min(22, foundWords.length * 6);
    add('Urgency or credential language', `Keywords found: ${foundWords.slice(0, 4).join(', ')}. These words are common in scam and phishing lures.`, 'warn');
  } else {
    add('No common credential lure words', 'No obvious login or urgency keywords were found in the hostname or path.', 'good');
  }

  const shorteners = ['bit.ly', 'tinyurl.com', 't.co', 'is.gd', 'cutt.ly', 'shorturl.at', 'rb.gy', 'ow.ly'];
  if (shorteners.includes(host)) {
    score += 18;
    add('URL shortener detected', 'Shortened URLs hide the final destination and should be checked carefully.', 'warn');
  } else {
    add('Shortener check', 'The host does not match a commonly used URL shortener.', 'good');
  }

  if (parsed.username || parsed.password || /https?:\/\/[^/]+@/i.test(url)) {
    score += 28;
    add('Embedded credentials or @ symbol', 'User-info syntax can mask the real destination and should be reviewed carefully.', 'bad');
  } else {
    add('No embedded credentials', 'No username or password segment was found in the URL authority.', 'good');
  }

  if (host.split('.').length >= 5) {
    score += 12;
    add('Long subdomain chain', 'A deep subdomain chain can hide the real registrable domain or reflect suspicious URL structure.', 'warn');
  }

  if (parsed.href.length > 180) {
    score += 8;
    add('Unusually long URL', 'Long URLs may contain tracking parameters or hide the final destination.', 'warn');
  }

  if (host.includes('-') && /(secure|account|login|verify|support|bank)/.test(host)) {
    score += 10;
    add('Hyphenated sensitive-looking domain', 'A hyphenated hostname can be used to resemble a trusted brand or service.', 'warn');
  }

  score = Math.min(100, Math.max(0, score));
  const level = score >= 55 ? 'high' : score >= 25 ? 'caution' : 'low';
  return { url, host, score, level, flags: findings };
}

function renderUrlResult(result) {
  const emptyState = $('#emptyState');
  const reportContent = $('#reportContent');
  const resultSubtitle = $('#resultSubtitle');
  const checkedUrl = $('#checkedUrl');
  const riskScore = $('#riskScore');
  const riskMeter = $('#riskMeterFill');
  const riskLabel = $('#riskLabel');
  const statusPill = $('#statusPill');
  const checksList = $('#checksList');

  if (emptyState) emptyState.classList.add('hidden');
  if (reportContent) reportContent.classList.remove('hidden');

  if (resultSubtitle) resultSubtitle.textContent = 'Local URL structure review completed';
  if (checkedUrl) checkedUrl.textContent = result.url;
  if (riskScore) riskScore.innerHTML = `${result.score}<small>/100</small>`;
  if (riskMeter) riskMeter.style.width = `${result.score}%`;

  if (riskLabel) {
    riskLabel.textContent = result.level === 'high' ? 'Several warning signs' : result.level === 'caution' ? 'Some warning signs' : 'Few common flags found';
  }

  const colorMap = {
    high: 'var(--red)',
    caution: 'var(--amber)',
    low: 'var(--green)'
  };

  if (riskMeter) riskMeter.style.background = colorMap[result.level] || 'var(--green)';
  if (riskScore) riskScore.style.color = colorMap[result.level] || 'var(--green)';

  if (statusPill) {
    if (result.level === 'high') {
      statusPill.textContent = 'High caution';
      statusPill.className = 'status-pill status-bad';
    } else if (result.level === 'caution') {
      statusPill.textContent = 'Review carefully';
      statusPill.className = 'status-pill status-warn';
    } else {
      statusPill.textContent = 'Few flags found';
      statusPill.className = 'status-pill status-good';
    }
  }

  const html = result.flags.map((flag) => {
    const icon = flag.severity === 'good' ? 'check' : flag.severity === 'bad' ? 'x' : 'alert-triangle';
    const className = flag.severity === 'good' ? 'good' : flag.severity === 'bad' ? 'bad' : 'warn';
    return `
      <div class="check-item">
        <span class="check-icon ${className}"><i data-lucide="${icon}"></i></span>
        <div class="check-copy">
          <strong>${escapeHtml(flag.title)}</strong>
          <p>${escapeHtml(flag.detail)}</p>
        </div>
      </div>
    `;
  }).join('');

  if (checksList) checksList.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();
}

async function runUrlScan() {
  const urlInput = $('#urlInput');
  const progressWrap = $('#scannerProgress');
  const progressText = $('#progressText');
  const scanButton = $('#scanButton');
  const statusPill = $('#statusPill');
  const emptyState = $('#emptyState');
  const reportContent = $('#reportContent');

  try {
    const parsed = normalizeAndParse(urlInput.value);
    if (scanButton) scanButton.disabled = true;
    if (progressWrap) progressWrap.classList.remove('hidden');
    if (progressText) progressText.textContent = 'Reviewing URL structure...';
    if (emptyState) emptyState.classList.remove('hidden');
    if (reportContent) reportContent.classList.add('hidden');
    if (statusPill) {
      statusPill.textContent = 'Inspecting';
      statusPill.className = 'status-pill status-warn';
    }

    const stages = ['Checking connection format...', 'Reviewing risk signals...', 'Preparing your report...'];
    for (const stage of stages) {
      if (progressText) progressText.textContent = stage;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    let result;
    let backendUsed = false;

    try {
      const backendResponse = await fetchScanApi(parsed.href);
      result = normalizeScanPayload(backendResponse);
      backendUsed = !!result;
    } catch (networkError) {
      result = inspectUrl(parsed);
      backendUsed = false;
      showToast('Backend unavailable; local heuristic backup used');
    }

    if (!result) {
      result = inspectUrl(parsed);
    }

    state.lastUrlReport = result;
    state.lastUrlReportSource = backendUsed ? 'backend' : 'local';
    renderUrlResult(result);
    showToast(backendUsed ? 'URL review complete via secure backend' : 'URL review complete');
  } catch (error) {
    showToast(error.message || 'Unable to inspect that URL');
    if (urlInput) urlInput.focus();
  } finally {
    if (scanButton) scanButton.disabled = false;
    if (progressWrap) progressWrap.classList.add('hidden');
  }
}

function saveScannerReport() {
  if (!state.lastUrlReport) {
    showToast('Run a URL scan before saving a report');
    return;
  }

  const entry = addHistoryEntry(buildUrlReport(state.lastUrlReport));
  renderOverview();
  renderHistory();
  state.selectedHistoryId = entry.id;
  showToast('URL report saved locally');
}

function downloadJsonReport(report, filename) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportCurrentUrlReport() {
  if (!state.lastUrlReport) {
    showToast('No URL report to export yet');
    return;
  }

  const report = buildUrlReport(state.lastUrlReport);
  downloadJsonReport(report, 'linkshield-url-report.json');
  showToast('URL report downloaded');
}

function analyzeMessageText(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) throw new Error('Paste a message before running the analysis.');

  const lower = cleaned.toLowerCase();
  const findings = [];
  let score = 0;

  const add = (title, detail, severity) => findings.push({ title, detail, severity });

  const patterns = [
    { key: 'urgent', title: 'Urgency pressure', detail: 'The message pushes a short deadline or escalates pressure to act immediately.', severity: 'warn' },
    { key: 'password', title: 'Password or OTP request', detail: 'The text asks for a password, verification code, or similar credential.', severity: 'bad' },
    { key: 'support', title: 'Account action wording', detail: 'Messages that claim an account will be suspended or locked are commonly used in scams.', severity: 'warn' },
    { key: 'prize', title: 'Prize or reward bait', detail: 'Unexpected reward language may signal scam or fake offer messaging.', severity: 'warn' },
    { key: 'click', title: 'Unexpected click request', detail: 'The message asks the user to click or open a link unexpectedly.', severity: 'warn' },
    { key: 'giftcard', title: 'Gift card or crypto pressure', detail: 'Gift cards and crypto payments are common scam requests.', severity: 'bad' }
  ];

  const map = {
    urgent: /now|immediately|urgent|asap|today|without delay|within 24 hours|act now|final notice|expires soon/i,
    password: /password|otp|one[- ]time passcode|verification code|sms code|login code|security code/i,
    support: /suspended|locked|verify your account|account action|security alert|restricted/i,
    prize: /winner|congratulations|free|gift|cash prize|reward|claim your prize/i,
    click: /click here|tap this|open this link|visit now|follow this link/i,
    giftcard: /gift card|bitcoin|crypto|ethereum|usdt|wire transfer|money transfer|pay with/i
  };

  patterns.forEach((pattern) => {
    if (map[pattern.key] && map[pattern.key].test(lower)) {
      score += pattern.severity === 'bad' ? 20 : 14;
      add(pattern.title, pattern.detail, pattern.severity);
    }
  });

  if (!findings.length) {
    add('No obvious scam cues', 'This message did not hit the common phishing risk patterns used in this local heuristic.', 'good');
  }

  if (cleaned.length > 220) {
    score += 10;
    add('Long or unusual message', 'Very long messages can hide scam instructions or urgency cues.', 'warn');
  }

  if (/(\$|€|£|¥|₿|crypto|gift card|verify now)/i.test(cleaned)) {
    score += 8;
    add('Financial pressure cues', 'Requests involving money, crypto, or payment actions often indicate scam behavior.', 'warn');
  }

  score = Math.min(100, score);
  const severity = score >= 55 ? 'high' : score >= 25 ? 'caution' : 'low';

  return {
    text: cleaned,
    score,
    severity,
    findings
  };
}

function renderMessageResult(result) {
  const resultBox = $('#messageResult');
  if (!resultBox) return;
  resultBox.classList.remove('hidden');
  const textClassification = result.severity === 'high' ? 'High caution' : result.severity === 'caution' ? 'Review carefully' : 'Low concern';
  resultBox.innerHTML = `
    <div class="message-summary">
      <div class="risk-summary-row">
        <div>
          <span class="mini-label">Message risk</span>
          <strong>${textClassification}</strong>
        </div>
        <div class="risk-score" style="color:${result.severity === 'high' ? 'var(--red)' : result.severity === 'caution' ? 'var(--amber)' : 'var(--green)'};">${result.score}</div>
      </div>
      <div class="checks-list">
        ${result.findings.map((finding) => {
          const icon = finding.severity === 'good' ? 'check' : finding.severity === 'bad' ? 'x' : 'alert-triangle';
          const className = finding.severity === 'good' ? 'good' : finding.severity === 'bad' ? 'bad' : 'warn';
          return `
            <div class="check-item">
              <span class="check-icon ${className}"><i data-lucide="${icon}"></i></span>
              <div class="check-copy">
                <strong>${escapeHtml(finding.title)}</strong>
                <p>${escapeHtml(finding.detail)}</p>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="report-disclaimer"><i data-lucide="alert-triangle"></i><span>Message heuristics cannot prove a communication is scam or legitimate. Verify through a trusted channel before acting.</span></div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

function analyzeCurrentMessage() {
  const input = $('#messageInput');
  try {
    const result = analyzeMessageText(input.value);
    state.lastMessageReport = result;
    renderMessageResult(result);
    showToast('Message review complete');
  } catch (error) {
    showToast(error.message || 'Unable to analyze the message');
  }
}

function copyMessageSummary() {
  if (!state.lastMessageReport) {
    showToast('Analyze a message before copying the summary');
    return;
  }
  const summary = state.lastMessageReport.findings.map((item) => `${item.title}: ${item.detail}`).join('\n');
  copyText(summary);
}

function saveMessageReport() {
  if (!state.lastMessageReport) {
    showToast('Analyze a message before saving it');
    return;
  }
  const entry = addHistoryEntry({
    type: 'message',
    title: 'Message analysis',
    summary: state.lastMessageReport.text.slice(0, 120),
    riskLevel: state.lastMessageReport.severity,
    score: state.lastMessageReport.score,
    details: { findings: state.lastMessageReport.findings, severity: state.lastMessageReport.severity },
    createdAt: new Date().toISOString()
  });
  renderOverview();
  renderHistory();
  state.selectedHistoryId = entry.id;
  showToast('Message report saved');
}

function copyText(value) {
  if (!value) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(value)
      .then(() => showToast('Copied to clipboard'))
      .catch(() => fallbackCopy(value));
    return;
  }
  fallbackCopy(value);
}

function fallbackCopy(value) {
  const helper = document.createElement('textarea');
  helper.value = value;
  document.body.appendChild(helper);
  helper.select();
  document.execCommand('copy');
  helper.remove();
  showToast('Copied to clipboard');
}

function bindScannerEvents() {
  const scanButton = $('#scanButton');
  const clearButton = $('#clearInput');
  const saveButton = $('#saveScannerReport');
  const exportButton = $('#downloadScannerReport');
  const urlInput = $('#urlInput');
  const copyButton = $('#copyUrl');

  if (scanButton) scanButton.addEventListener('click', runUrlScan);
  if (clearButton) clearButton.addEventListener('click', () => {
    if (urlInput) urlInput.value = '';
    const emptyState = $('#emptyState');
    const reportContent = $('#reportContent');
    const statusPill = $('#statusPill');
    if (emptyState) emptyState.classList.remove('hidden');
    if (reportContent) reportContent.classList.add('hidden');
    if (statusPill) {
      statusPill.textContent = 'Awaiting URL';
      statusPill.className = 'status-pill status-neutral';
    }
    if (urlInput) urlInput.focus();
    showToast('URL input cleared');
  });

  if (saveButton) saveButton.addEventListener('click', saveScannerReport);
  if (exportButton) exportButton.addEventListener('click', exportCurrentUrlReport);

  if (urlInput) {
    urlInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') runUrlScan();
    });
    document.querySelectorAll('.sample-link').forEach((button) => {
      button.addEventListener('click', () => {
        urlInput.value = button.dataset.url || '';
        urlInput.focus();
      });
    });
  }

  if (copyButton) {
    copyButton.addEventListener('click', () => {
      const checkedUrl = $('#checkedUrl');
      copyText(checkedUrl ? checkedUrl.textContent : '');
    });
  }
}

function bindMessageEvents() {
  const analyzeButton = $('#messageAnalyze');
  const copyButton = $('#copyMessageSummary');
  const saveButton = $('#saveMessageReport');
  if (analyzeButton) analyzeButton.addEventListener('click', analyzeCurrentMessage);
  if (copyButton) copyButton.addEventListener('click', copyMessageSummary);
  if (saveButton) saveButton.addEventListener('click', saveMessageReport);
}

function decodeQrImage(file) {
  if (!file) return Promise.reject(new Error('No file was selected.'));

  const supported = ['image/png', 'image/jpeg', 'image/webp'];
  if (!supported.includes(file.type)) {
    throw new Error('Unsupported file type. Please upload a PNG, JPG, or WEBP QR image.');
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error('This file is too large. Keep QR uploads below 8 MB.');
  }

  if (typeof jsQR === 'undefined') {
    throw new Error('QR decoding library is unavailable right now. Check your connection and try again.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = image.width;
        canvas.height = image.height;
        context.drawImage(image, 0, 0, image.width, image.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (!code) {
          reject(new Error('This QR image could not be decoded. Try a clearer or larger image.'));
          return;
        }
        resolve(code.data);
      };
      image.onerror = () => reject(new Error('The QR image could not be loaded.'));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error('The selected file could not be read.'));
    reader.readAsDataURL(file);
  });
}

async function handleQrFile(file) {
  const qrPreviewWrap = $('#qrPreviewWrap');
  const qrDecoded = $('#qrDecodedContent');
  const qrInput = $('#qrInput');

  try {
    const decoded = await decodeQrImage(file);
    if (qrPreviewWrap) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = 'Decoded QR preview';
      qrPreviewWrap.innerHTML = '';
      qrPreviewWrap.appendChild(img);
    }

    if (qrDecoded) {
      qrDecoded.textContent = decoded;
    }

    showToast('QR code decoded successfully');
    if (qrInput) qrInput.value = '';
  } catch (error) {
    if (qrDecoded) qrDecoded.textContent = error.message || 'Unable to decode the selected QR code.';
    if (qrPreviewWrap) {
      qrPreviewWrap.innerHTML = '<div class="qr-placeholder">Image preview unavailable</div>';
    }
    showToast(error.message || 'QR scan failed');
  }
}

function bindQrEvents() {
  const input = $('#qrInput');
  const dropzone = $('#qrDropzone');
  const pickButton = $('#qrPick');
  const copyDecoded = $('#copyDecodedQr');
  const scanDecoded = $('#scanDecodedQr');

  if (pickButton) pickButton.addEventListener('click', () => input.click());
  if (input) {
    input.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) handleQrFile(file);
    });
  }

  if (dropzone) {
    ['dragover', 'dragenter'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.remove('is-dragover');
      });
    });

    dropzone.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) handleQrFile(file);
    });

    dropzone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input.click();
      }
    });
  }

  if (copyDecoded) {
    copyDecoded.addEventListener('click', () => {
      const content = $('#qrDecodedContent');
      const text = content ? content.textContent : '';
      copyText(text);
    });
  }

  if (scanDecoded) {
    scanDecoded.addEventListener('click', () => {
      const content = $('#qrDecodedContent');
      const text = content ? content.textContent : '';
      if (!text || text.includes('No QR content')) {
        showToast('Decode a QR code before scanning the URL');
        return;
      }

      const detectedUrl = /^https?:\/\//i.test(text) ? text : null;
      if (!detectedUrl) {
        showToast('The decoded content does not look like a URL');
        return;
      }

      const input = $('#urlInput');
      if (input) input.value = detectedUrl;
      setActiveView('scanner');
      runUrlScan();
    });
  }
}

function evaluatePassword(password) {
  if (!password) {
    return {
      score: 0,
      label: 'Too short',
      notes: ['Enter a password to assess its strength.'],
      color: 'var(--red)'
    };
  }

  let score = 0;
  const notes = [];

  if (password.length >= 16) {
    score += 30;
  } else if (password.length >= 12) {
    score += 18;
  } else if (password.length >= 8) {
    score += 10;
  } else {
    notes.push('Use at least 12 characters for better protection.');
  }

  if (/[a-z]/.test(password)) score += 15;
  else notes.push('Add lowercase letters.');

  if (/[A-Z]/.test(password)) score += 15;
  else notes.push('Add uppercase letters.');

  if (/\d/.test(password)) score += 15;
  else notes.push('Add at least one number.');

  if (/[^A-Za-z0-9]/.test(password)) score += 15;
  else notes.push('Add a symbol or special character.');

  if (/(.)\1{2,}/.test(password)) {
    score -= 8;
    notes.push('Avoid repeated characters like aaa or 1111.');
  }

  const commonPatterns = ['password', 'admin', 'welcome', 'qwerty', 'letmein', 'login'];
  if (commonPatterns.some((pattern) => password.toLowerCase().includes(pattern))) {
    score -= 15;
    notes.push('Avoid common words and predictable patterns.');
  }

  score = Math.max(0, Math.min(100, score));

  let label = 'Weak';
  let color = 'var(--red)';
  if (score >= 75) {
    label = 'Strong';
    color = 'var(--green)';
  } else if (score >= 50) {
    label = 'Moderate';
    color = 'var(--amber)';
  } else if (score >= 25) {
    label = 'Low';
    color = 'var(--amber)';
  }

  if (!notes.length) {
    notes.push('This password uses a broad mix of character types. Keep it unique and avoid reuse across accounts.');
  }

  return { score, label, notes, color };
}

function renderPasswordAssessment() {
  const passwordInput = $('#passwordInput');
  const strengthText = $('#passwordStrengthText');
  const strengthBar = $('#passwordStrengthBar');
  const notes = $('#passwordNotes');

  const password = passwordInput ? passwordInput.value : '';
  const result = evaluatePassword(password);

  if (strengthText) strengthText.textContent = result.label;
  if (strengthBar) {
    strengthBar.style.width = `${result.score}%`;
    strengthBar.style.background = result.color;
  }

  if (notes) {
    notes.innerHTML = result.notes.map((note) => `<div class="password-note">${escapeHtml(note)}</div>`).join('');
  }
}

function bindPasswordEvents() {
  const input = $('#passwordInput');
  const toggle = $('#togglePassword');
  const clearButton = $('#clearPassword');
  const generateButton = $('#generatePassword');

  if (input) input.addEventListener('input', renderPasswordAssessment);

  if (toggle) {
    toggle.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      toggle.innerHTML = isPassword ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
      if (window.lucide) window.lucide.createIcons();
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (input) input.value = '';
      renderPasswordAssessment();
      if (input) input.focus();
    });
  }

  if (generateButton) {
    generateButton.addEventListener('click', () => {
      const wordList = ['aurora', 'cobalt', 'signal', 'harbor', 'forest', 'orbit', 'silver', 'thunder', 'meadow', 'pioneer', 'amber', 'raven', 'summit', 'marble', 'canyon'];
      const randomIndex = (array) => {
        const bytes = new Uint32Array(1);
        crypto.getRandomValues(bytes);
        return bytes[0] % array.length;
      };
      const sample = Array.from({ length: 4 }, () => wordList[randomIndex(wordList)]).join('-');
      if (input) {
        input.value = sample;
        input.type = 'text';
        renderPasswordAssessment();
      }
      showToast('Sample passphrase created');
    });
  }
}

function encodeTextValue() {
  const raw = $('#encodeInput').value;
  if (!raw.trim()) {
    $('#encodeOutput').textContent = 'Enter text to encode.';
    return;
  }
  const encoded = encodeURIComponent(raw);
  $('#encodeOutput').textContent = encoded;
}

function decodeTextValue() {
  const raw = $('#decodeInput').value;
  if (!raw.trim()) {
    $('#decodeOutput').textContent = 'Enter URL-encoded text to decode.';
    return;
  }
  try {
    $('#decodeOutput').textContent = decodeURIComponent(raw);
  } catch (error) {
    $('#decodeOutput').textContent = 'Could not decode the value. Check that the input uses valid URL encoding.';
  }
}

async function hashTextValue() {
  const raw = $('#hashInput').value;
  if (!raw.trim()) {
    $('#hashOutput').textContent = 'Enter text to hash.';
    return;
  }
  if (!window.crypto || !window.crypto.subtle) {
    $('#hashOutput').textContent = 'Secure hashing is not available in this browser context.';
    return;
  }
  const buffer = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  $('#hashOutput').textContent = hash;
}

function normalizeUrlValue() {
  const raw = $('#normalizeInput').value.trim();
  if (!raw) {
    $('#normalizeOutput').textContent = 'Enter a URL to normalize.';
    return;
  }

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only http and https URLs are supported.');
    }
    const result = parsed.href;
    $('#normalizeOutput').textContent = `Trimmed and normalized: ${result}`;
  } catch {
    $('#normalizeOutput').textContent = 'That value is not a valid HTTP or HTTPS URL. Check the address and try again.';
  }
}

function bindUtilityEvents() {
  $('#encodeButton')?.addEventListener('click', encodeTextValue);
  $('#decodeButton')?.addEventListener('click', decodeTextValue);
  $('#hashButton')?.addEventListener('click', hashTextValue);
  $('#normalizeButton')?.addEventListener('click', normalizeUrlValue);

  $('#copyEncode')?.addEventListener('click', () => copyText($('#encodeOutput').textContent));
  $('#copyDecode')?.addEventListener('click', () => copyText($('#decodeOutput').textContent));
  $('#copyHash')?.addEventListener('click', () => copyText($('#hashOutput').textContent));
  $('#copyNormalize')?.addEventListener('click', () => copyText($('#normalizeOutput').textContent));
}

function renderHistory() {
  const list = $('#historyList');
  const detail = $('#historyDetail');
  if (!list) return;

  const history = loadHistory();
  const typeFilter = $('#historyTypeFilter');
  const riskFilter = $('#historyRiskFilter');
  const searchInput = $('#historySearch');
  const sortSelect = $('#historySort');

  const filtered = [...history]
    .filter((item) => typeFilter.value === 'all' || item.type === typeFilter.value)
    .filter((item) => riskFilter.value === 'all' || item.riskLevel === riskFilter.value)
    .filter((item) => {
      const term = searchInput.value.trim().toLowerCase();
      if (!term) return true;
      return [item.title, item.summary, item.type, item.riskLevel].join(' ').toLowerCase().includes(term);
    })
    .sort((a, b) => {
      const left = new Date(a.createdAt).getTime();
      const right = new Date(b.createdAt).getTime();
      return sortSelect.value === 'oldest' ? left - right : right - left;
    });

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-graphic"><i data-lucide="history"></i></div><h4>No reports saved</h4><p>Your saved URL, message, and QR scans will appear here.</p></div>';
    if (detail) {
      detail.classList.add('empty-detail');
      detail.innerHTML = '<h4>Choose a saved report</h4><p>Select any saved item to see the full summary and metadata.</p>';
    }
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const selectedId = state.selectedHistoryId || filtered[0].id;
  const selected = filtered.find((item) => item.id === selectedId) || filtered[0];
  state.selectedHistoryId = selected.id;

  list.innerHTML = filtered.map((item) => `
    <div class="history-card ${item.id === selected.id ? 'active' : ''}" data-history-id="${item.id}">
      <div>
        <h4>${escapeHtml(item.title || 'Saved report')}</h4>
        <p class="history-meta">${escapeHtml(item.riskLevel || 'low')} · ${escapeHtml(formatDate(item.createdAt))}</p>
      </div>
      <div class="history-card-actions">
        <button type="button" data-history-action="details" data-history-id="${item.id}">Details</button>
        <button type="button" data-history-action="export" data-history-id="${item.id}">Export</button>
        <button type="button" data-history-action="delete" data-history-id="${item.id}">Delete</button>
      </div>
    </div>
  `).join('');

  const detailMarkup = selected ? `
    <h4>${escapeHtml(selected.title || 'Saved report')}</h4>
    <p>${escapeHtml(selected.summary || 'No summary available')}</p>
    <label>Risk level</label>
    <p>${escapeHtml(selected.riskLevel || 'low')}</p>
    <label>Created</label>
    <p>${escapeHtml(formatDate(selected.createdAt))}</p>
    <label>Details</label>
    <pre>${escapeHtml(JSON.stringify(selected.details || {}, null, 2))}</pre>
  ` : '<h4>No report selected</h4>';

  if (detail) {
    detail.classList.remove('empty-detail');
    detail.innerHTML = detailMarkup;
  }

  list.querySelectorAll('.history-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      state.selectedHistoryId = card.dataset.historyId;
      renderHistory();
    });
  });

  list.querySelectorAll('[data-history-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const id = button.dataset.historyId;
      const action = button.dataset.historyAction;
      if (action === 'details') {
        state.selectedHistoryId = id;
        renderHistory();
      }
      if (action === 'export') {
        const record = history.find((item) => item.id === id);
        if (record) downloadJsonReport(record, `linkshield-report-${id}.json`);
      }
      if (action === 'delete') {
        const nextHistory = history.filter((item) => item.id !== id);
        localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(nextHistory));
        if (state.selectedHistoryId === id) state.selectedHistoryId = null;
        renderOverview();
        renderHistory();
        showToast('Report deleted');
      }
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

function clearHistory() {
  const confirmed = window.confirm('Clear all saved browser history? This action cannot be undone.');
  if (!confirmed) return;
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify([]));
  state.selectedHistoryId = null;
  renderOverview();
  renderHistory();
  showToast('History cleared');
}

function exportAllHistory() {
  const history = loadHistory();
  if (!history.length) {
    showToast('There are no saved reports to export yet');
    return;
  }
  downloadJsonReport(history, 'linkshield-history.json');
  showToast('History exported');
}

function bindHistoryEvents() {
  const typeFilter = $('#historyTypeFilter');
  const riskFilter = $('#historyRiskFilter');
  const searchInput = $('#historySearch');
  const sortSelect = $('#historySort');
  const clearHistoryButton = $('#clearHistory');
  const clearHistorySettings = $('#clearHistorySettings');
  const exportSettings = $('#exportHistorySettings');

  [typeFilter, riskFilter, sortSelect].forEach((control) => {
    control?.addEventListener('change', renderHistory);
  });

  searchInput?.addEventListener('input', renderHistory);
  clearHistoryButton?.addEventListener('click', clearHistory);
  clearHistorySettings?.addEventListener('click', clearHistory);
  exportSettings?.addEventListener('click', exportAllHistory);
}

function bindLearningEvents() {
  $$('.accordion-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.accordion-item');
      const isOpen = item.classList.contains('active');
      $$('.accordion-item').forEach((entry) => entry.classList.remove('active'));
      if (!isOpen) item.classList.add('active');
    });
  });
}

function bindSettingsEvents() {
  const themePreference = $('#themePreference');
  if (themePreference) {
    themePreference.addEventListener('change', () => {
      applyTheme(themePreference.checked ? 'light' : 'dark');
      showToast(themePreference.checked ? 'Light theme enabled' : 'Dark theme enabled');
    });
  }

  const analyticsPreference = $('#analyticsPreference');
  if (analyticsPreference) {
    analyticsPreference.checked = isAnalyticsEnabled();
    analyticsPreference.addEventListener('change', () => {
      try {
        localStorage.setItem(STORAGE_KEYS.analyticsEnabled, String(analyticsPreference.checked));
        if (!analyticsPreference.checked) {
          localStorage.removeItem(STORAGE_KEYS.analyticsVisitor);
          sessionStorage.removeItem(STORAGE_KEYS.analyticsSession);
          setAnalyticsStatus('Collection disabled in this browser');
        } else {
          state.lastTrackedPage = null;
          trackPageView(state.activeView);
        }
        showToast(analyticsPreference.checked ? 'Pseudonymous analytics enabled' : 'Pseudonymous analytics disabled');
      } catch {
        analyticsPreference.checked = false;
        setAnalyticsStatus('Analytics preference could not be saved', true);
        showToast('Could not update the analytics preference');
      }
    });
  }
}

function bindAnalyticsEvents() {
  document.querySelectorAll('[data-analytics-range]').forEach((button) => {
    button.addEventListener('click', () => loadVisitorAnalytics(button.dataset.analyticsRange));
  });
}

function bindMobileMenu() {
  const menuButton = $('#mobileMenu');
  const navigation = $('#mainNavigation');
  const navbar = $('.app-navbar');
  if (!menuButton || !navigation || !navbar) return;

  menuButton.addEventListener('click', () => {
    const opened = navigation.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(opened));
    menuButton.setAttribute('aria-label', opened ? 'Close navigation menu' : 'Open navigation menu');
  });

  document.addEventListener('click', (event) => {
    if (navigation.classList.contains('open') && !event.composedPath().includes(navbar)) {
      closeMobileNavigation();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navigation.classList.contains('open')) {
      closeMobileNavigation();
      menuButton.focus();
    }
  });
}

function initialize() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || 'dark';
  applyTheme(savedTheme);
  bindRouteButtons();
  bindScannerEvents();
  bindMessageEvents();
  bindQrEvents();
  bindPasswordEvents();
  bindUtilityEvents();
  bindHistoryEvents();
  bindLearningEvents();
  bindSettingsEvents();
  bindAnalyticsEvents();
  bindMobileMenu();

  const themeToggle = $('#themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-view]');
    if (target && target.dataset.view) {
      setActiveView(target.dataset.view);
    }
  });

  restoreHashView();
  trackPageView(state.activeView);
  const copyrightYear = $('#copyrightYear');
  if (copyrightYear) copyrightYear.textContent = String(new Date().getFullYear());
  renderOverview();
  renderHistory();
  renderPasswordAssessment();
  if (window.lucide) window.lucide.createIcons();
  updateMobileBottomIndicator(state.activeView, false);
  const mobileBottomNavigation = $('.mobile-bottom-nav');
  if (mobileBottomNavigation && 'ResizeObserver' in window) {
    new ResizeObserver(() => updateMobileBottomIndicator(state.activeView, false)).observe(mobileBottomNavigation);
  } else {
    window.addEventListener('resize', () => updateMobileBottomIndicator(state.activeView, false), { passive: true });
  }
}

document.addEventListener('DOMContentLoaded', initialize);
window.addEventListener('hashchange', restoreHashView);
