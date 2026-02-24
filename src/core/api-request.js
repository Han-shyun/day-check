export function createApiRequestError(path, response, payload = null) {
  const status = Number(response?.status || 0);
  const payloadError = typeof payload?.error === 'string' ? payload.error : '';
  let message = '요청 처리 중 오류가 발생했습니다.';

  if (payloadError === 'invalid_csrf_token') {
    message = '보안 토큰이 유효하지 않습니다. 다시 시도해 주세요.';
  } else if (payloadError === 'too_many_requests' || status === 429) {
    message = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  } else if (status === 401) {
    message = '로그인이 만료되었습니다. 다시 로그인해 주세요.';
  } else if (status === 403) {
    message = '요청 권한이 없습니다.';
  } else if (status === 404) {
    message = '요청한 리소스를 찾을 수 없습니다.';
  } else if (status === 409) {
    message = '동시 수정 충돌이 발생했습니다.';
  } else if (status >= 500) {
    message = '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
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

