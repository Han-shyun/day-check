export const bucketApi = {
  endpoints: {
    order: '/bucket/order',
    visibility: '/bucket/visibility',
    labels: '/bucket/labels',
    projectLanes: '/project-lanes',
  },
  buildBucketPayload(bucketState = {}) {
    return {
      bucketLabels: bucketState.bucketLabels || {},
      bucketOrder: bucketState.bucketOrder || [],
      bucketVisibility: bucketState.bucketVisibility || {},
      projectLanes: bucketState.projectLanes || [],
    };
  },
};
