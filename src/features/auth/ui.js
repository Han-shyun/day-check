export function createAuthUi() {
  let root = null;

  return {
    mount(nextRoot) {
      root = nextRoot || null;
    },
    unmount() {
      root = null;
    },
    render(payload = {}) {
      if (!root) {
        return;
      }

      const isAuthenticated = !!payload.isServerSync && !!payload.authUser;
      root.dataset.authenticated = isAuthenticated ? 'true' : 'false';
      root.dataset.authProvider = isAuthenticated ? 'kakao' : 'local';
    },
    getRoot() {
      return root;
    },
  };
}

export const authUi = {
  create: createAuthUi,
};
