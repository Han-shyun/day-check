export const APP_ROUTES = ['home', 'buckets', 'calendar', 'report'];
export const ROUTE_STORAGE_KEY = 'day-check.ui.route.v1';

function parseRouteFromHash(hashText = '') {
  const cleaned = String(hashText || '')
    .replace(/^#\/?/, '')
    .trim();
  if (!cleaned) {
    return '';
  }
  return cleaned.split('/')[0];
}

function getRouteDirection(routes, previousRoute, nextRoute) {
  const previousIndex = routes.indexOf(previousRoute);
  const nextIndex = routes.indexOf(nextRoute);
  if (previousIndex < 0 || nextIndex < 0 || previousIndex === nextIndex) {
    return 'none';
  }
  return nextIndex > previousIndex ? 'forward' : 'backward';
}

function toRouteHash(route) {
  return `#/${route}`;
}

export function createRouter({
  routes = APP_ROUTES,
  storageKey = ROUTE_STORAGE_KEY,
  defaultRoute = APP_ROUTES[0],
} = {}) {
  const routeSet = new Set(routes);
  const listeners = new Set();
  let currentRoute = defaultRoute;
  let initialized = false;

  const notify = (payload) => {
    listeners.forEach((listener) => listener(payload));
  };

  const persist = (route) => {
    try {
      localStorage.setItem(storageKey, route);
    } catch {
      // ignore localStorage failures (private mode, quota, etc)
    }
  };

  const replaceHash = (route) => {
    const nextHash = toRouteHash(route);
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(null, '', nextUrl);
  };

  const commit = (nextRoute, source = 'navigate', replace = false) => {
    if (!routeSet.has(nextRoute)) {
      return;
    }

    const previousRoute = currentRoute;
    const direction = getRouteDirection(routes, previousRoute, nextRoute);
    const changed = previousRoute !== nextRoute;
    currentRoute = nextRoute;
    persist(nextRoute);

    if (source !== 'hashchange') {
      if (replace) {
        replaceHash(nextRoute);
      } else if (window.location.hash !== toRouteHash(nextRoute)) {
        window.location.hash = toRouteHash(nextRoute);
      }
    } else if (!changed && window.location.hash !== toRouteHash(nextRoute)) {
      replaceHash(nextRoute);
    }

    if (!changed && source === 'hashchange') {
      return;
    }

    notify({
      route: nextRoute,
      previousRoute,
      direction,
      source,
      changed,
    });
  };

  const resolveInitialRoute = () => {
    const fromHash = parseRouteFromHash(window.location.hash);
    if (routeSet.has(fromHash)) {
      return fromHash;
    }

    try {
      const fromStorage = localStorage.getItem(storageKey) || '';
      if (routeSet.has(fromStorage)) {
        return fromStorage;
      }
    } catch {
      // ignore localStorage failures
    }

    return defaultRoute;
  };

  const onHashChange = () => {
    const routeFromHash = parseRouteFromHash(window.location.hash);
    const fallback = currentRoute || defaultRoute;
    const nextRoute = routeSet.has(routeFromHash) ? routeFromHash : fallback;
    commit(nextRoute, 'hashchange', true);
  };

  return {
    init() {
      if (initialized) {
        return currentRoute;
      }
      initialized = true;
      const initial = resolveInitialRoute();
      window.addEventListener('hashchange', onHashChange);
      commit(initial, 'init', true);
      return currentRoute;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    navigate(route, { replace = false } = {}) {
      if (!routeSet.has(route)) {
        return;
      }
      commit(route, 'navigate', replace);
    },
    getCurrentRoute() {
      return currentRoute;
    },
    getRoutes() {
      return [...routes];
    },
  };
}

