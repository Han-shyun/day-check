import { API_ERROR_TOAST_COOLDOWN_MS, MOJIBAKE_MARKERS } from './constants.js';
import { runtime } from './app-context.js';
import { createApiRequestError as createCoreApiRequestError } from './api-request.js';

let _showToast = () => {};

export function initUiDeps({ showToast } = {}) {
  _showToast = typeof showToast === 'function' ? showToast : () => {};
}

export function findBrokenTextMarker(text) {
  return MOJIBAKE_MARKERS.find((marker) => String(text || '').includes(marker)) || '';
}

export function hasBrokenText(value) {
  const text = String(value || '');
  if (!text) {
    return false;
  }
  if (/[\uFFFD]/u.test(text)) {
    return true;
  }
  return Boolean(findBrokenTextMarker(text));
}

export function showBrokenTextFilteredToast(context, value) {
  const text = String(value || '');
  if (!text) {
    return;
  }

  const marker = findBrokenTextMarker(text);
  if (marker) {
    _showToast(`${context}에서 깨진 문자열 패턴("${marker}")이 감지되어 제외했습니다.`, 'error');
    return;
  }

  if (/[\uFFFD]/u.test(text)) {
    _showToast(`${context}에서 치환 문자(U+FFFD)가 감지되어 제외했습니다.`, 'error');
  }
}

export function ensureToastHost() {
  if (runtime.toastHostEl && document.body.contains(runtime.toastHostEl)) {
    return runtime.toastHostEl;
  }

  runtime.toastHostEl = document.getElementById('toastHost');
  if (!runtime.toastHostEl) {
    runtime.toastHostEl = document.createElement('div');
    runtime.toastHostEl.id = 'toastHost';
    runtime.toastHostEl.className = 'toast-host';
    document.body.appendChild(runtime.toastHostEl);
  }

  return runtime.toastHostEl;
}

export function showToast(message, type = 'info') {
  const host = ensureToastHost();
  if (!host || !message) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = String(message);
  host.appendChild(toast);

  window.requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => {
      toast.remove();
    }, 220);
  }, 2200);
}

export function extractErrorDetail(error) {
  if (!error) {
    return '';
  }
  if (error instanceof Error) {
    return error.stack || error.message || '';
  }
  return String(error);
}

export function dismissFatalErrorScreen({ restoreFocus = false } = {}) {
  const overlay = runtime.fatalErrorOverlayEl;
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  runtime.fatalErrorOverlayEl = null;
  runtime.fatalErrorShown = false;

  if (restoreFocus && typeof document !== 'undefined') {
    const fallbackFocus = document.querySelector('.topbar button, .app-tabs button');
    fallbackFocus?.focus?.();
  }
}

export function renderFatalErrorScreen(error) {
  if (runtime.fatalErrorShown || typeof document === 'undefined' || !document.body) {
    return;
  }

  const details = extractErrorDetail(error);
  const isDev = Boolean(import.meta?.env?.DEV);

  runtime.fatalErrorShown = true;
  const overlay = document.createElement('section');
  overlay.className = 'fatal-error-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');

  const card = document.createElement('div');
  card.className = 'fatal-error-card';

  const title = document.createElement('h2');
  title.className = 'fatal-error-title';
  title.textContent = '앱 오류가 발생했습니다';

  const description = document.createElement('p');
  description.className = 'fatal-error-description';
  description.textContent = '화면을 복구하지 못했습니다. 다시 시도하거나 새로고침해 주세요.';

  const actions = document.createElement('div');
  actions.className = 'fatal-error-actions';

  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'ghost-btn';
  retryBtn.textContent = '다시 시도';
  retryBtn.addEventListener('click', () => {
    dismissFatalErrorScreen();
    // fallback render will be handled by bootstrap catch path if needed
  });

  const reloadBtn = document.createElement('button');
  reloadBtn.type = 'button';
  reloadBtn.className = 'project-add-btn';
  reloadBtn.textContent = '새로고침';
  reloadBtn.addEventListener('click', () => {
    window.location.reload();
  });

  actions.append(retryBtn, reloadBtn);
  card.append(title, description);

  if (isDev && details) {
    const stack = document.createElement('pre');
    stack.className = 'fatal-error-stack';
    stack.textContent = details;
    card.appendChild(stack);
  }

  card.appendChild(actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  runtime.fatalErrorOverlayEl = overlay;
  retryBtn.focus();
}

export function handleFatalError(error) {
  console.error('[fatal]', error);
  renderFatalErrorScreen(error);
}

export function shouldIgnoreGlobalError(error) {
  const detail = extractErrorDetail(error);
  const message =
    (error && typeof error === 'object' && 'message' in error ? String(error.message || '') : '') || detail;
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name || '') : '';

  if (name === 'ApiRequestError' || name === 'AbortError') {
    return true;
  }
  if (!message) {
    return false;
  }
  if (message.includes('ResizeObserver loop limit exceeded')) {
    return true;
  }
  if (message.includes('ResizeObserver loop completed with undelivered notifications')) {
    return true;
  }
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return true;
  }
  if (message.includes('Loading chunk') && message.includes('failed')) {
    return true;
  }
  return false;
}

export function registerGlobalErrorBoundary() {
  if (runtime.globalErrorHandlersRegistered || typeof window === 'undefined') {
    return;
  }

  runtime.globalErrorHandlersRegistered = true;
  window.addEventListener('error', (event) => {
    const error = event?.error || new Error(String(event?.message || 'window_error'));
    if (shouldIgnoreGlobalError(error)) {
      return;
    }
    handleFatalError(error);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason || new Error('unhandled_rejection');
    if (shouldIgnoreGlobalError(reason)) {
      return;
    }
    handleFatalError(reason);
  });
}

export function showApiErrorToast(message) {
  const text = String(message || '').trim();
  if (!text) {
    return;
  }
  const now = Date.now();
  if (text === runtime.lastApiErrorToastKey && now - runtime.lastApiErrorToastAt < API_ERROR_TOAST_COOLDOWN_MS) {
    return;
  }
  runtime.lastApiErrorToastKey = text;
  runtime.lastApiErrorToastAt = now;
  showToast(text, 'error');
}

export function createApiRequestError(path, response, payload = null) {
  return createCoreApiRequestError(path, response, payload);
}
