/**
 * Errors a {@link ModelClient} throws, decoupled from the SDK's classes so the loop and the tests
 * need no runtime import of `@anthropic-ai/sdk`.
 */

/**
 * An API or transport failure. `errorClass` is the SDK's class name (`AuthenticationError`,
 * `RateLimitError`, `APIConnectionError`, `BadRequestError`, ...).
 */
export class ModelClientError extends Error {
  readonly errorClass: string;
  readonly status: number | undefined;

  constructor(errorClass: string, message: string, status?: number) {
    super(message);
    this.name = 'ModelClientError';
    this.errorClass = errorClass;
    this.status = status;
  }
}

/**
 * The model's streamed output could not be read (with eager input streaming, a tool input that is
 * not JSON at all). The loop retries the request a couple of times before it gives up.
 */
export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelOutputError';
  }
}

/**
 * The error classes a run's `done` event may carry (ADR 0125 D9). Most are the SDK's class names;
 * `BillingError`, `OverloadedError`, `TimeoutError` and `RequestTooLargeError` are worked out from
 * the status and the API's error type, which the SDK reports under a generic class;
 * `ContextWindowExceeded` and `ModelOutputError` come from the loop itself.
 */
export const AI_ERROR_CLASSES = Object.freeze([
  'AuthenticationError',
  'PermissionDeniedError',
  'BillingError',
  'RateLimitError',
  'OverloadedError',
  'InternalServerError',
  'APIConnectionError',
  'TimeoutError',
  'RequestTooLargeError',
  'BadRequestError',
  'NotFoundError',
  'ContextWindowExceeded',
  'ModelOutputError',
  'Error',
] as const);

/** One of {@link AI_ERROR_CLASSES}. */
export type AiErrorClass = (typeof AI_ERROR_CLASSES)[number];

/**
 * The plain sentence of each error class, without the class name (ADR 0125 D9). The renderer's
 * words file may say it differently per mode; these are the defaults the `done` event carries.
 */
export const ERROR_SENTENCES: Readonly<Record<AiErrorClass, string>> = Object.freeze({
  AuthenticationError: 'Your Anthropic API key was not accepted.',
  PermissionDeniedError: 'Your Anthropic API key may not use this model.',
  BillingError: 'Your Anthropic account has no credit left.',
  RateLimitError: 'Too many requests to Anthropic just now; try again in a minute.',
  OverloadedError: 'Anthropic is busy just now; try again shortly.',
  InternalServerError: 'Anthropic had a problem on its side; try again shortly.',
  APIConnectionError: 'No connection to Anthropic. Check the internet.',
  TimeoutError: 'Anthropic took too long to answer; try again.',
  RequestTooLargeError: 'The message is too large to send; try fewer or smaller pictures.',
  BadRequestError: 'Anthropic did not accept the request.',
  NotFoundError: 'The model was not found.',
  ContextWindowExceeded: 'The conversation is too long for the model; start a new chat.',
  ModelOutputError: "The helper's answer could not be read; try again.",
  Error: 'Something went wrong while talking to Anthropic.',
});

/** Whether the raw error text names the API error type (the SDK puts the body in the message). */
function namesType(error: ModelClientError, type: string): boolean {
  return error.message.includes(type);
}

/** The error class of a client error, by status and API error type before the SDK's class. */
export function classifyModelClientError(error: ModelClientError): AiErrorClass {
  if (error.status === 402 || namesType(error, 'billing_error')) return 'BillingError';
  if (error.status === 529 || namesType(error, 'overloaded_error')) return 'OverloadedError';
  if (error.status === 413 || namesType(error, 'request_too_large')) return 'RequestTooLargeError';
  if (
    error.errorClass === 'APIConnectionTimeoutError' ||
    error.status === 408 ||
    error.status === 504 ||
    namesType(error, 'timeout_error')
  ) {
    return 'TimeoutError';
  }
  switch (error.errorClass) {
    case 'AuthenticationError':
    case 'PermissionDeniedError':
    case 'RateLimitError':
    case 'InternalServerError':
    case 'APIConnectionError':
    case 'BadRequestError':
    case 'NotFoundError':
      return error.errorClass;
    default:
      break;
  }
  if (error.status === 401) return 'AuthenticationError';
  if (error.status === 403) return 'PermissionDeniedError';
  if (error.status === 429) return 'RateLimitError';
  if (error.status !== undefined && error.status >= 500) return 'InternalServerError';
  return 'Error';
}

/**
 * A plain sentence for the user, without the class name. A request Anthropic did not accept, and
 * a failure of no known class, keep Anthropic's own text after the sentence for diagnosis.
 */
export function describeModelClientError(error: ModelClientError): string {
  const errorClass = classifyModelClientError(error);
  const sentence = ERROR_SENTENCES[errorClass];
  if (errorClass === 'BadRequestError' || errorClass === 'Error') {
    return error.message.length > 0 ? `${sentence} ${error.message}` : sentence;
  }
  return sentence;
}
