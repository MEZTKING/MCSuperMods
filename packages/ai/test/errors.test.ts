import { describe, expect, it } from 'vitest';
import {
  AI_ERROR_CLASSES,
  classifyModelClientError,
  describeModelClientError,
  ERROR_SENTENCES,
  ModelClientError,
} from '../src/index';

describe('model client errors', () => {
  it('classifies by status and API error type before the SDK class', () => {
    const cases: Array<[ModelClientError, string]> = [
      [
        new ModelClientError('AuthenticationError', 'invalid x-api-key', 401),
        'AuthenticationError',
      ],
      [new ModelClientError('PermissionDeniedError', 'no access', 403), 'PermissionDeniedError'],
      // The SDK has no class of its own for 402.
      [new ModelClientError('APIError', '402 {"type":"error"}', 402), 'BillingError'],
      [
        new ModelClientError(
          'BadRequestError',
          '400 {"error":{"type":"billing_error","message":"Your credit balance is too low"}}',
          400,
        ),
        'BillingError',
      ],
      [new ModelClientError('RateLimitError', 'slow down', 429), 'RateLimitError'],
      // 529 is reported as an InternalServerError by the SDK.
      [new ModelClientError('InternalServerError', 'Overloaded', 529), 'OverloadedError'],
      [
        new ModelClientError('InternalServerError', '{"type":"overloaded_error"}', 500),
        'OverloadedError',
      ],
      [new ModelClientError('InternalServerError', 'oops', 500), 'InternalServerError'],
      [new ModelClientError('APIConnectionError', 'Connection error.'), 'APIConnectionError'],
      [new ModelClientError('APIConnectionTimeoutError', 'Request timed out.'), 'TimeoutError'],
      [new ModelClientError('APIError', 'request_too_large', 413), 'RequestTooLargeError'],
      [new ModelClientError('BadRequestError', 'bad field', 400), 'BadRequestError'],
      [new ModelClientError('NotFoundError', 'model: x', 404), 'NotFoundError'],
      [new ModelClientError('ConflictError', 'conflict', 409), 'Error'],
      [new ModelClientError('APIError', 'teapot', 418), 'Error'],
    ];
    for (const [error, expected] of cases) {
      expect(classifyModelClientError(error), error.message).toBe(expected);
    }
  });

  it('says a plain sentence without the class name', () => {
    for (const errorClass of AI_ERROR_CLASSES) {
      const sentence = ERROR_SENTENCES[errorClass];
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence).toMatch(/[.]$/);
      expect(sentence).not.toMatch(/Error\b/);
    }
    const billing = new ModelClientError('APIError', 'credit balance is too low', 402);
    expect(describeModelClientError(billing)).toBe('Your Anthropic account has no credit left.');
    const busy = new ModelClientError('InternalServerError', 'Overloaded', 529);
    expect(describeModelClientError(busy)).toBe('Anthropic is busy just now; try again shortly.');
    const key = new ModelClientError('AuthenticationError', 'invalid x-api-key', 401);
    expect(describeModelClientError(key)).not.toContain('AuthenticationError');
    expect(describeModelClientError(key)).not.toContain('x-api-key');
  });

  it("keeps Anthropic's text for a refused request and an unknown failure", () => {
    expect(
      describeModelClientError(new ModelClientError('BadRequestError', 'messages: empty', 400)),
    ).toBe('Anthropic did not accept the request. messages: empty');
    expect(describeModelClientError(new ModelClientError('ConflictError', 'conflict', 409))).toBe(
      'Something went wrong while talking to Anthropic. conflict',
    );
  });
});
