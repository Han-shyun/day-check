import { describe, expect, it, vi } from 'vitest';

import { performApiRequest } from '../src/core/api-request.js';

function createMockResponse({ status, ok, payload }) {
  return {
    status,
    ok,
    clone() {
      return this;
    },
    async json() {
      return payload;
    },
  };
}

describe('performApiRequest', () => {
  it('returns response when status is allowed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createMockResponse({
        status: 409,
        ok: false,
        payload: { error: 'version_conflict' },
      }),
    );
    const onErrorToast = vi.fn();

    const response = await performApiRequest({
      baseUrl: '/api',
      path: '/state',
      options: {
        method: 'GET',
        allowHttpStatus: [409],
      },
      fetchImpl,
      onErrorToast,
    });

    expect(response.status).toBe(409);
    expect(onErrorToast).not.toHaveBeenCalled();
  });

  it('throws and sends toast message on non-allowed error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createMockResponse({
        status: 500,
        ok: false,
        payload: { error: 'internal_server_error' },
      }),
    );
    const onErrorToast = vi.fn();

    await expect(
      performApiRequest({
        baseUrl: '/api',
        path: '/state',
        options: {
          method: 'GET',
        },
        fetchImpl,
        onErrorToast,
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 500,
    });

    expect(onErrorToast).toHaveBeenCalledTimes(1);
  });

  it('suppresses toast when suppressErrorToast is true', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createMockResponse({
        status: 429,
        ok: false,
        payload: { error: 'too_many_requests' },
      }),
    );
    const onErrorToast = vi.fn();

    await expect(
      performApiRequest({
        baseUrl: '/api',
        path: '/collab/public-id',
        options: {
          method: 'PUT',
          suppressErrorToast: true,
        },
        fetchImpl,
        onErrorToast,
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 429,
    });

    expect(onErrorToast).not.toHaveBeenCalled();
  });
});

