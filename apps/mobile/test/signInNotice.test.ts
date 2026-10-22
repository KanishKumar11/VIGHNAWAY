import { requestNotice, verifyNotice } from '@/features/account/signIn';
import { ApiRequestError } from '@/lib/api';

const URL = 'https://api.example.test';

describe('sign-in against an API without sign-in routes', () => {
  const missing = new ApiRequestError('Cannot POST /auth/otp/request', 404, 'NOT_FOUND');

  it('says the server is out of date instead of showing the raw route error', () => {
    for (const notice of [requestNotice(missing, URL), verifyNotice(missing, URL)]) {
      expect(notice.text).toBe('This server is older than the app and does not support sign-in yet. Ask whoever runs the API to update it, then try again.');
      expect(notice.text).not.toContain('Cannot POST');
      expect(notice.tone).toBe('danger');
    }
  });

  it('keeps the other messages: network, too many, bad code', () => {
    expect(requestNotice(new ApiRequestError('x', 0, null), URL).text).toContain(URL);
    expect(requestNotice(new ApiRequestError('x', 429, 'RATE_LIMITED'), URL).tone).toBe('warn');
    expect(verifyNotice(new ApiRequestError('x', 401, 'UNAUTHORIZED'), URL).text).not.toContain('older');
  });
});
