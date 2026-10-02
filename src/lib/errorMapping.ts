/**
 * Error Mapping Utility (Section 7 Error Handling)
 * Maps structured server error codes to polished, human-friendly user copy.
 * Raw system errors or internal stack traces are never exposed to users.
 */

export const ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_CREDITS: 'You do not have enough credits to complete this action. Please top up your wallet.',
  UNAUTHORIZED: 'Your session has expired or is invalid. Please sign in again.',
  FORBIDDEN: 'You do not have permission to access or modify this resource.',
  NOT_AUTHENTICATED: 'Authentication required. Please sign in to continue.',
  JOB_NOT_FOUND: 'The requested generation job could not be found.',
  VARIANT_NOT_FOUND: 'The requested generation variant could not be found.',
  MODEL_NOT_FOUND: 'The selected AI model is currently unavailable.',
  PROMPT_REQUIRED: 'Please provide a prompt to start generation.',
  INVALID_SCALE: 'The selected resolution is not supported for this asset.',
  SCALE_EXCEEDS_MODEL: 'The selected resolution exceeds the maximum allowed by this model.',
  PROMPT_ENHANCER_UNAVAILABLE: 'The prompt enhancer is currently offline. Your original prompt was preserved.',
  ENHANCER_EMPTY_RESPONSE: 'Enhancement returned an empty response. Your original prompt was preserved.',
  ENHANCER_FAILED: 'Unable to enhance prompt right now. Your original prompt was preserved.',
  PROVIDER_UNAVAILABLE: 'The generation provider is temporarily offline. Please try again shortly.',
  PROVIDER_KEY_MISSING: 'AI provider key is not configured. Credits remain untouched.',
  PROVIDER_TIMEOUT: 'Generation timed out at the provider. Your credits have been refunded.',
  MODEL_TEMPORARILY_UNAVAILABLE: 'This model is temporarily unavailable. Please try again shortly.',
  CONTENT_MODERATION: 'This prompt or lyrics could not be generated due to content moderation guidelines. Please revise and try again.',
  INVALID_TASK_INPUT: 'The music prompt or lyrics format was rejected as invalid. Please shorten or adjust your input and try again.',
  UPSTREAM_PROVIDER_ERROR: 'The generation provider is temporarily offline. Please try again shortly.',
  RATE_LIMITED: 'Too many requests. Please pause a moment before trying again.',
  NETWORK_ERROR: 'Network connection lost. Please verify your connection and try again.',
  SUPABASE_REQUIRED: 'Supabase configuration is required for Studio features. Please configure your environment.',
  DELETE_FAILED: 'Could not delete variant. Please try again.',
  UPSCALE_FAILED: 'Upscale operation could not be completed. Any reserved credits were refunded.',
  DOWNLOAD_FAILED: 'Unable to start asset download. Please check your connection.',
  PLAYLIST_NAME_TAKEN: 'You already have a playlist with that name. Please choose a different name.',
  PLAYLIST_MUSIC_ONLY: 'Playlists can only contain music tracks.',
  PLAYLIST_NOT_FOUND: 'The requested playlist could not be found.',
  FAVORITE_FAILED: 'Could not update favorites. Please try again.',
  SERVER_ERROR: 'An unexpected server error occurred. Please try again in a few moments.',
};

/**
 * Maps a server error code or response object to human-friendly copy.
 */
export function formatApiError(errorCodeOrMessage?: string | null, detail?: string): string {
  if (!errorCodeOrMessage) {
    return detail || ERROR_MESSAGES.SERVER_ERROR;
  }

  // Normalise lookup key
  const key = errorCodeOrMessage.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (ERROR_MESSAGES[key]) {
    return ERROR_MESSAGES[key];
  }

  // Handle formatted strings like "INSUFFICIENT_CREDITS: Required 140, available 50"
  if (key.startsWith('INSUFFICIENT_CREDITS')) {
    return ERROR_MESSAGES.INSUFFICIENT_CREDITS;
  }

  if (key.includes('401') || key.includes('UNAUTHORIZED') || key.includes('JWT')) {
    return ERROR_MESSAGES.UNAUTHORIZED;
  }

  if (key.includes('403') || key.includes('FORBIDDEN')) {
    return ERROR_MESSAGES.FORBIDDEN;
  }

  if (key.includes('503') || key.includes('OFFLINE') || key.includes('ENHANCER')) {
    return ERROR_MESSAGES.PROMPT_ENHANCER_UNAVAILABLE;
  }

  if (detail && typeof detail === 'string' && detail.trim().length > 0) {
    return detail;
  }

  // If the message is a human sentence (contains spaces and isn't just an uppercase code)
  if (errorCodeOrMessage.includes(' ') && !errorCodeOrMessage.startsWith('error:')) {
    return errorCodeOrMessage;
  }

  return ERROR_MESSAGES.SERVER_ERROR;
}

/**
 * Returns a user-friendly error message from an API error object or string,
 * preferring err.code, then err.detail, then err.message.
 */
export function getApiErrorMessage(err: unknown): string {
  if (!err) {
    return ERROR_MESSAGES.SERVER_ERROR;
  }

  if (typeof err === 'string') {
    return formatApiError(err);
  }

  if (typeof err === 'object') {
    const errorObj = err as any;
    const code = errorObj.code || (typeof errorObj.error === 'string' ? errorObj.error : undefined);
    const detail = errorObj.detail;
    const message = errorObj.message;

    // 1. Prefer err.code
    if (code && typeof code === 'string') {
      const key = code.trim().toUpperCase().replace(/[\s-]+/g, '_');
      if (ERROR_MESSAGES[key]) {
        return ERROR_MESSAGES[key];
      }
      const formatted = formatApiError(code, detail);
      if (formatted !== ERROR_MESSAGES.SERVER_ERROR) {
        return formatted;
      }
    }

    // 2. Then prefer err.detail
    if (detail && typeof detail === 'string' && detail.trim().length > 0) {
      const detailKey = detail.trim().toUpperCase().replace(/[\s-]+/g, '_');
      if (ERROR_MESSAGES[detailKey]) {
        return ERROR_MESSAGES[detailKey];
      }
      return detail;
    }

    // 3. Then prefer err.message
    if (message && typeof message === 'string' && message.trim().length > 0) {
      return formatApiError(message);
    }
  }

  return ERROR_MESSAGES.SERVER_ERROR;
}

/**
 * Structured API Error class
 */
export class ApiError extends Error {
  code: string;
  status?: number;
  detail?: string;

  constructor(code: string, options?: { status?: number; detail?: string; message?: string }) {
    super(options?.message || code);
    this.name = 'ApiError';
    this.code = code;
    this.status = options?.status;
    this.detail = options?.detail;
  }
}

export interface EnhanceErrorPresentation {
  code: string;
  title: string;
  message: string;
  canRetry: boolean;
  devHint?: string;
}

/**
 * Derives end-user error presentation for prompt enhancement failures.
 * Never exposes raw tokens, keys, env-vars or stack traces to users.
 * Logs technical details via console.warn.
 */
export function getEnhanceErrorPresentation(codeOrError: unknown): EnhanceErrorPresentation {
  let code = 'ENHANCER_FAILED';
  let status: number | undefined;
  let detail: string | undefined;

  if (codeOrError instanceof ApiError) {
    code = codeOrError.code || 'ENHANCER_FAILED';
    status = codeOrError.status;
    detail = codeOrError.detail;
  } else if (typeof codeOrError === 'string') {
    code = codeOrError;
  } else if (codeOrError && typeof codeOrError === 'object') {
    const errObj = codeOrError as any;
    code = errObj.code || errObj.error || errObj.message || 'ENHANCER_FAILED';
    status = errObj.status;
    detail = errObj.detail;
  }

  // Technical detail logged only to developer console, never shown to user
  console.warn('[Enhancer] Enhancement failed with technical detail:', { code, status, detail });

  const upperCode = String(code).toUpperCase();

  let title = "Couldn't enhance prompt";
  let message = "Prompt enhancement isn't available right now. Your original prompt is untouched — you can generate with it as is.";
  let canRetry = true;

  if (
    upperCode === 'PROMPT_ENHANCER_UNAVAILABLE' ||
    status === 503 ||
    upperCode.includes('503') ||
    upperCode.includes('UNAVAILABLE') ||
    upperCode.includes('KEY_MISSING')
  ) {
    title = 'Enhancer is unavailable';
    message = "Prompt enhancement isn't available right now. Your original prompt is untouched — you can generate with it as is.";
    canRetry = false;
  } else if (
    upperCode === 'ENHANCER_FAILED' ||
    upperCode === 'ENHANCER_EMPTY_RESPONSE' ||
    status === 502 ||
    upperCode.includes('502')
  ) {
    title = "Couldn't enhance this time";
    message = "Enhancement couldn't complete. Your original prompt is preserved — you can try again or generate as is.";
    canRetry = true;
  } else if (upperCode === 'NETWORK_ERROR' || upperCode.includes('NETWORK') || upperCode.includes('FETCH')) {
    title = 'Connection problem';
    message = "Check your internet connection and try again. Your original prompt has not been changed.";
    canRetry = true;
  } else if (upperCode === 'UNAUTHORIZED' || status === 401 || upperCode.includes('401')) {
    title = 'Sign in required';
    message = 'Please sign in to your account to enhance prompts with AI.';
    canRetry = false;
  }

  let devHint: string | undefined = undefined;
  if (
    import.meta.env.DEV &&
    (upperCode === 'PROMPT_ENHANCER_UNAVAILABLE' ||
      status === 503 ||
      upperCode.includes('UNAVAILABLE') ||
      upperCode.includes('KEY'))
  ) {
    devHint = 'Developer hint: set GEMINI_API_KEY in your environment.';
  }

  return {
    code,
    title,
    message,
    canRetry,
    devHint,
  };
}

