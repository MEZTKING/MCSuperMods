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

const FRIENDLY: Readonly<Record<string, string>> = {
  AuthenticationError: 'The API key was rejected',
  PermissionDeniedError: 'The API key may not use this model or feature',
  RateLimitError: 'Rate limited; try again shortly',
  APIConnectionError: 'Could not reach Anthropic',
  APIConnectionTimeoutError: 'Could not reach Anthropic',
  InternalServerError: 'Anthropic reported a server error; try again shortly',
  BadRequestError: 'Anthropic refused the request',
  NotFoundError: 'The model was not found',
};

/** A message for the user naming the error class, for example "The API key was rejected (AuthenticationError)". */
export function describeModelClientError(error: ModelClientError): string {
  const friendly = FRIENDLY[error.errorClass];
  if (friendly === undefined) return `${error.errorClass}: ${error.message}`;
  if (error.errorClass === 'BadRequestError' || error.errorClass === 'NotFoundError') {
    return `${friendly} (${error.errorClass}): ${error.message}`;
  }
  return `${friendly} (${error.errorClass})`;
}
