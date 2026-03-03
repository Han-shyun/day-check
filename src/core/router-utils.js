import { APP_ROUTES, ROUTE_STORAGE_KEY, createRouter } from '../app/router.js';
import { createTodoUi } from '../features/todo/ui.js';
import { createBucketUi } from '../features/bucket/ui.js';
import { createCalendarUi } from '../features/calendar/ui.js';
import { createReportUi } from '../features/report/ui.js';
import { createAuthUi } from '../features/auth/ui.js';
import { runtime } from './app-context.js';
import {
  routeOutletEl,
  routeLinkEls,
  routeViewEls,
  appHeaderEl,
} from './dom-refs.js';

let _render = () => {};
let _closeBucketActionMenus = () => {};
let _syncCollabPolling = () => {};
let _renderers = {
  home: () => {},
  buckets: () => {},
  calendar: () => {},
  report: () => {},
};

export function initRouterDeps({
  render,
  closeBucketActionMenus,
  syncCollabPolling,
  renderers,
} = {}) {
  if (typeof render === 'function') {
    _render = render;
  }
  if (typeof closeBucketActionMenus === 'function') {
    _closeBucketActionMenus = closeBucketActionMenus;
  }
  if (typeof syncCollabPolling === 'function') {
    _syncCollabPolling = syncCollabPolling;
  }
  if (renderers && typeof renderers === 'object') {
    _renderers = {
      ..._renderers,
      ...renderers,
    };
  }
}

export function updateRouteTabs(route) {
  routeLinkEls.forEach((linkEl) => {
    const linkRoute = String(linkEl.dataset.routeLink || '');
    const isActive = linkRoute === route;
    linkEl.classList.toggle('is-active', isActive);
    if (isActive) {
      linkEl.setAttribute('aria-current', 'page');
    } else {
      linkEl.removeAttribute('aria-current');
    }
  });
}

export function focusRouteHeading(route) {
  const activeView = routeViewEls.find((viewEl) => viewEl.dataset.routeView === route);
  if (!activeView) {
    return;
  }
  const heading = activeView.querySelector('h1, h2');
  if (!heading) {
    return;
  }
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}

export function animateRouteView(route, direction = 'none') {
  if (!routeOutletEl) {
    return;
  }

  const activeView = routeViewEls.find((viewEl) => viewEl.dataset.routeView === route);
  if (!activeView) {
    return;
  }

  if (runtime.routeTransitionTimer) {
    clearTimeout(runtime.routeTransitionTimer);
    runtime.routeTransitionTimer = null;
  }

  routeViewEls.forEach((viewEl) => {
    viewEl.classList.remove('is-entering-forward', 'is-entering-backward');
  });

  if (direction === 'forward') {
    activeView.classList.add('is-entering-forward');
  } else if (direction === 'backward') {
    activeView.classList.add('is-entering-backward');
  }

  runtime.routeTransitionTimer = setTimeout(() => {
    routeViewEls.forEach((viewEl) => {
      viewEl.classList.remove('is-entering-forward', 'is-entering-backward');
    });
    runtime.routeTransitionTimer = null;
  }, 190);
}

export function activateRoute(route, direction = 'none') {
  runtime.currentRoute = APP_ROUTES.includes(route) ? route : 'home';
  _syncCollabPolling();

  routeViewEls.forEach((viewEl) => {
    const isActive = viewEl.dataset.routeView === runtime.currentRoute;
    viewEl.hidden = !isActive;
    viewEl.classList.toggle('is-active', isActive);
  });

  updateRouteTabs(runtime.currentRoute);
  animateRouteView(runtime.currentRoute, direction);
  focusRouteHeading(runtime.currentRoute);
}

export function renderRoute(route) {
  if (route !== 'buckets') {
    _closeBucketActionMenus();
  }

  const renderer = _renderers[route] || _renderers.home;
  if (typeof renderer === 'function') {
    renderer();
  }
}

export function initializeRouteModules() {
  runtime.routeModules = {
    home: createTodoUi(),
    buckets: createBucketUi(),
    calendar: createCalendarUi(),
    report: createReportUi(),
  };

  Object.entries(runtime.routeModules).forEach(([route, module]) => {
    const root = routeViewEls.find((viewEl) => viewEl.dataset.routeView === route) || null;
    module?.mount?.(root);
  });

  runtime.authView = createAuthUi();
  runtime.authView?.mount?.(appHeaderEl);
}

export function setupRouter() {
  if (runtime.appRouter) {
    return;
  }

  if (!routeOutletEl) {
    runtime.currentRoute = 'home';
    return;
  }

  runtime.appRouter = createRouter({
    routes: APP_ROUTES,
    storageKey: ROUTE_STORAGE_KEY,
    defaultRoute: 'home',
  });

  runtime.appRouter.subscribe(({ route, direction }) => {
    activateRoute(route, direction);
    _render();
  });

  routeLinkEls.forEach((linkEl) => {
    linkEl.addEventListener('click', (event) => {
      const route = String(linkEl.dataset.routeLink || '');
      if (!APP_ROUTES.includes(route)) {
        return;
      }
      event.preventDefault();
      runtime.appRouter.navigate(route);
    });
  });

  runtime.appRouter.init();
}
