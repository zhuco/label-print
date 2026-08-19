import { describe, expect, it } from 'vitest';
import {
  API_ERROR_HTTP_STATUS,
  PLAN_LABEL_LIMITS,
  getPlanLabelLimit,
  isApiErrorCode,
} from '../index';

describe('plan contract', () => {
  it('publishes the documented free and pro label limits', () => {
    expect(PLAN_LABEL_LIMITS).toEqual({ free: 50, pro: 200 });
    expect(getPlanLabelLimit('free')).toBe(50);
    expect(getPlanLabelLimit('pro')).toBe(200);
  });
});

describe('API error contract', () => {
  it('recognizes only stable business error codes', () => {
    expect(isApiErrorCode('REVISION_CONFLICT')).toBe(true);
    expect(isApiErrorCode('something-else')).toBe(false);
    expect(isApiErrorCode(null)).toBe(false);
  });

  it('keeps conflicts and version failures mapped to their documented status', () => {
    expect(API_ERROR_HTTP_STATUS.REVISION_CONFLICT).toBe(409);
    expect(API_ERROR_HTTP_STATUS.LABEL_LIMIT_REACHED).toBe(409);
    expect(API_ERROR_HTTP_STATUS.UNSUPPORTED_DOCUMENT_VERSION).toBe(422);
  });
});
