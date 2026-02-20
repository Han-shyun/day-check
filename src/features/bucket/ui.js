export function createBucketUi() {
  let root = null;

  return {
    mount(nextRoot) {
      root = nextRoot || null;
    },
    unmount() {
      root = null;
    },
    render(state) {
      if (!root) {
        return;
      }

      const order = Array.isArray(state?.bucketOrder) ? state.bucketOrder : [];
      const visibility = state?.bucketVisibility && typeof state.bucketVisibility === 'object'
        ? state.bucketVisibility
        : {};
      const activeCount = order.filter((bucket) => visibility[bucket] !== false).length;

      root.dataset.activeBuckets = String(activeCount);
      root.dataset.bucketOrder = order.join(',');
    },
    getRoot() {
      return root;
    },
  };
}

export const bucketUi = {
  create: createBucketUi,
};
