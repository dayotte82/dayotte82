/**
 * Error Handler Utilities
 * Centralized error handling with proper logging and sanitization
 */

import { AppError, ErrorCode } from './errors';

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    timestamp: string;
    requestId?: string;
    details?: Record<string, any>;
  };
}

interface LoggerInterface {
  error: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  info: (message: string, meta?: any) => void;
}

export class ErrorHandler {
  private logger?: LoggerInterface;
  private isDevelopment: boolean;

  constructor(logger?: LoggerInterface, isDevelopment: boolean = false) {
    this.logger = logger;
    this.isDevelopment = isDevelopment;
  }

  /**
   * Handles errors and returns sanitized response for frontend
   * PREVENTS stack traces from being exposed to users
   */
  public handleError(error: Error | AppError, requestId?: string): ErrorResponse {
    // Log the full error with stack trace (server-side only)
    this.logError(error, requestId);

    // Return sanitized error to frontend
    if (error instanceof AppError) {
      return this.createErrorResponse(
        error.message,
        error.code,
        requestId,
        // Only include details in development mode
        this.isDevelopment ? error.details : undefined
      );
    }

    // For unknown errors, return generic message to prevent information leakage
    return this.createErrorResponse(
      this.isDevelopment ? error.message : 'An unexpected error occurred',
      ErrorCode.INTERNAL_ERROR,
      requestId
    );
  }

  /**
   * Logs error with full details including stack trace
   * Stack traces are NEVER sent to frontend
   */
  private logError(error: Error | AppError, requestId?: string): void {
    const errorLog = {
      message: error.message,
      name: error.name,
      stack: error.stack,
      requestId,
      timestamp: new Date().toISOString(),
      ...(error instanceof AppError && {
        code: error.code,
        statusCode: error.statusCode,
        isOperational: error.isOperational,
        details: error.details,
      }),
    };

    if (this.logger) {
      this.logger.error('Error occurred', errorLog);
    } else {
      // Fallback to console in case logger is not configured
      console.error('Error occurred:', errorLog);
    }
  }

  /**
   * Creates sanitized error response for frontend
   * NO stack traces or sensitive information included
   */
  private createErrorResponse(
    message: string,
    code: string,
    requestId?: string,
    details?: Record<string, any>
  ): ErrorResponse {
    return {
      success: false,
      error: {
        message,
        code,
        timestamp: new Date().toISOString(),
        ...(requestId && { requestId }),
        ...(details && { details }),
      },
    };
  }

  /**
   * Handles unhandled promise rejections
   */
  public setupGlobalHandlers(): void {
    process.on('unhandledRejection', (reason: Error | any, promise: Promise<any>) => {
      console.error('Unhandled Promise Rejection at:', promise);
      console.error('Reason:', reason);

      this.logError(
        reason instanceof Error ? reason : new Error(String(reason)),
        'unhandled-rejection'
      );

      // In production, you might want to exit the process
      // process.exit(1);
    });

    process.on('uncaughtException', (error: Error) => {
      console.error('Uncaught Exception:', error);

      this.logError(error, 'uncaught-exception');

      // For uncaught exceptions, it's safer to exit
      process.exit(1);
    });
  }
}

/**
 * Async error wrapper - ensures all errors in async functions are caught
 * Prevents unhandled promise rejections
 */
export function asyncHandler<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  return ((...args: Parameters<T>) => {
    return Promise.resolve(fn(...args)).catch((error) => {
      // Re-throw to be handled by error middleware
      throw error;
    });
  }) as T;
}

/**
 * Wraps a promise with timeout handling
 * Prevents operations from hanging indefinitely
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new AppError(
        `Operation '${operation}' timed out after ${timeoutMs}ms`,
        ErrorCode.TIMEOUT,
        408,
        true,
        { operation, timeoutMs }
      ));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

/**
 * Retry logic with exponential backoff
 * Provides error recovery for transient failures
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        break;
      }

      const delayMs = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt),
        maxDelayMs
      );

      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError!;
}
