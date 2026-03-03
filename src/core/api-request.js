export function createApiRequestError(path, response, payload = null) {
  const status = Number(response?.status || 0);
  const payloadError = typeof payload?.error === 'string' ? payload.error : '';
  let message = 'An error occurred while processing the request.';

  if (payloadError === 'invalid_csrf_token') {
    message = 'Security token is invalid. Please try again.';
  } else if (payloadError === 'too_many_requests' || status === 429) {
    message = 'Too many requests. Please try again later.';
  } else if (status === 401) {
    message = 'Session expired. Please log in again.';
  } else if (status === 403) {
    message = 'You do not have permission for this request.';
  } else if (status === 404) {
    message = 'Requested resource not found.';
  } else if (status === 409) {
    message = 'A concurrent modification conflict occurred.';
  } else if (status >= 500) {
    message = 'Server error. Please try again later.';
  }

  const error = new Error(message);
  error.name = 'ApiRequestError';
  error.status = status;
  error.path = path;
  error.payload = payload;
  error.response = response;
  return error;
}

export async function performApiRequest({
  baseUrl = '/api',
  path,
  options = {},
  fetchImpl = globalThis.fetch,
  onErrorToast = () => {},
  createError = createApiRequestError,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch_unavailable');
  }

  const {
    headers: optHeaders,
    allowHttpStatus = [],
    suppressErrorToast = false,
    ...rest
  } = options;

  const response = await fetchImpl(`${baseUrl}${path}`, {
    credentials: 'include',
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(optHeaders || {}),
    },
  });

  if (!response.ok && !allowHttpStatus.includes(response.status)) {
    let payload = null;
    try {
      payload = await response.clone().json();
    } catch {
      payload = null;
    }

    const apiError = createError(path, response, payload);
    if (!suppressErrorToast) {
      onErrorToast(apiError.message);
    }
    throw apiError;
  }

  return response;
}
