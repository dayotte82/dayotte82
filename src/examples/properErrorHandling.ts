/**
 * Examples of Proper Error Handling
 * Demonstrates best practices for all common scenarios
 */

import { Request, Response, NextFunction } from 'express';
import {
  AppError,
  ValidationError,
  NotFoundError,
  TimeoutError,
  ExternalServiceError,
  DatabaseError,
} from '../utils/errors';
import { withTimeout, withRetry, asyncHandler } from '../utils/errorHandler';
import { asyncRoute } from '../middleware/errorMiddleware';

// ============================================================================
// 1. PROPER TRY-CATCH BLOCKS
// ============================================================================

/**
 * ✅ GOOD: Async function with proper try-catch
 */
export async function getUserById(userId: string) {
  try {
    // Validate input
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('User ID must be a non-empty string');
    }

    // Simulate database call with timeout
    const user = await withTimeout(
      fetchUserFromDatabase(userId),
      5000,
      'fetchUserFromDatabase'
    );

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    return user;
  } catch (error) {
    // Re-throw AppErrors as-is
    if (error instanceof AppError) {
      throw error;
    }

    // Wrap unknown errors
    throw new DatabaseError(
      'Failed to fetch user',
      'getUserById'
    );
  }
}

/**
 * ❌ BAD: Missing try-catch (unhandled promise rejection risk)
 */
export async function getUserByIdBad(userId: string) {
  const user = await fetchUserFromDatabase(userId); // Can throw unhandled error
  return user;
}

// ============================================================================
// 2. CATCHING ERRORS WITH PROPER HANDLING
// ============================================================================

/**
 * ✅ GOOD: Error caught and properly handled with recovery logic
 */
export async function getDataWithFallback(id: string) {
  try {
    return await fetchFromPrimarySource(id);
  } catch (error) {
    console.warn('Primary source failed, trying fallback:', error);

    try {
      // Error recovery: try fallback source
      return await fetchFromFallbackSource(id);
    } catch (fallbackError) {
      // Both failed, throw meaningful error
      throw new ExternalServiceError('data service', fallbackError as Error);
    }
  }
}

/**
 * ❌ BAD: Error caught but not handled (empty catch)
 */
export async function getDataBad(id: string) {
  try {
    return await fetchFromPrimarySource(id);
  } catch (error) {
    // Silent failure - user never knows what went wrong
  }
}

// ============================================================================
// 3. MEANINGFUL ERROR MESSAGES TO USERS
// ============================================================================

/**
 * ✅ GOOD: Specific, actionable error messages
 */
export const createUserRoute = asyncRoute(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Specific validation with helpful messages
  if (!email) {
    throw new ValidationError('Email address is required', {
      field: 'email',
      reason: 'missing',
    });
  }

  if (!isValidEmail(email)) {
    throw new ValidationError('Email address format is invalid', {
      field: 'email',
      reason: 'invalid_format',
      example: 'user@example.com',
    });
  }

  if (!password || password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long', {
      field: 'password',
      reason: 'too_short',
      minLength: 8,
    });
  }

  // Create user...
  res.json({ success: true });
});

/**
 * ❌ BAD: Generic error message
 */
export const createUserRouteBad = asyncRoute(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new Error('Invalid input'); // Too generic, not helpful
  }

  // ...
});

// ============================================================================
// 4. NEVER EXPOSE STACK TRACES TO FRONTEND
// ============================================================================

/**
 * ✅ GOOD: Error sanitized, no stack trace sent to frontend
 * (Handled by errorMiddleware)
 */
export const secureRoute = asyncRoute(async (req: Request, res: Response) => {
  try {
    const result = await riskyOperation();
    res.json({ success: true, data: result });
  } catch (error) {
    // Error middleware will sanitize and log properly
    throw error;
  }
});

/**
 * ❌ BAD: Stack trace exposed to frontend
 */
export const insecureRouteBad = async (req: Request, res: Response) => {
  try {
    const result = await riskyOperation();
    res.json({ success: true, data: result });
  } catch (error) {
    // NEVER DO THIS - exposes internal details
    res.status(500).json({
      error: error.message,
      stack: error.stack, // ❌ Security issue!
      details: error, // ❌ May contain sensitive info!
    });
  }
};

// ============================================================================
// 5. ERROR RECOVERY LOGIC
// ============================================================================

/**
 * ✅ GOOD: Multiple recovery strategies
 */
export async function fetchDataWithRecovery(id: string) {
  // Strategy 1: Retry with exponential backoff
  try {
    return await withRetry(
      () => fetchFromAPI(id),
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        onRetry: (error, attempt) => {
          console.log(`Retry attempt ${attempt} after error:`, error.message);
        },
      }
    );
  } catch (retryError) {
    // Strategy 2: Try cache
    try {
      const cached = await getCachedData(id);
      if (cached) {
        console.log('Serving from cache due to API failure');
        return cached;
      }
    } catch (cacheError) {
      console.warn('Cache lookup failed:', cacheError);
    }

    // Strategy 3: Try alternative endpoint
    try {
      return await fetchFromBackupAPI(id);
    } catch (backupError) {
      // All recovery strategies failed
      throw new ExternalServiceError('data service', retryError as Error);
    }
  }
}

// ============================================================================
// 6. HANDLING UNHANDLED PROMISE REJECTIONS
// ============================================================================

/**
 * ✅ GOOD: All promises properly handled
 */
export async function processItems(items: string[]) {
  const results = await Promise.allSettled(
    items.map(async (item) => {
      try {
        return await processItem(item);
      } catch (error) {
        console.error(`Failed to process item ${item}:`, error);
        return null;
      }
    })
  );

  // Handle results
  const successful = results
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    .map((r) => (r as PromiseFulfilledResult<any>).value);

  const failed = results.filter((r) => r.status === 'rejected').length;

  if (failed > 0) {
    console.warn(`${failed} items failed to process`);
  }

  return successful;
}

/**
 * ❌ BAD: Unhandled promise rejection
 */
export function processItemsBad(items: string[]) {
  items.forEach((item) => {
    processItem(item); // ❌ Promise not awaited or caught
  });
}

// ============================================================================
// 7. TIMEOUT HANDLING
// ============================================================================

/**
 * ✅ GOOD: All async operations have timeouts
 */
export async function fetchWithTimeout(url: string) {
  return await withTimeout(
    fetch(url).then((res) => res.json()),
    10000, // 10 second timeout
    `fetch ${url}`
  );
}

/**
 * ✅ GOOD: Multiple operations with individual timeouts
 */
export async function complexOperation() {
  try {
    // Each operation has appropriate timeout
    const user = await withTimeout(fetchUser(), 5000, 'fetchUser');
    const settings = await withTimeout(fetchSettings(), 3000, 'fetchSettings');
    const data = await withTimeout(fetchData(), 10000, 'fetchData');

    return { user, settings, data };
  } catch (error) {
    if (error instanceof TimeoutError) {
      // Handle timeout specifically
      throw new AppError(
        `Operation timed out: ${error.details?.operation}`,
        error.code,
        408,
        true,
        error.details
      );
    }
    throw error;
  }
}

/**
 * ❌ BAD: No timeout (can hang indefinitely)
 */
export async function fetchWithoutTimeout(url: string) {
  return await fetch(url).then((res) => res.json()); // Can hang forever
}

// ============================================================================
// HELPER FUNCTIONS (Stubs for examples)
// ============================================================================

async function fetchUserFromDatabase(userId: string): Promise<any> {
  // Stub implementation
  return { id: userId, name: 'John Doe' };
}

async function fetchFromPrimarySource(id: string): Promise<any> {
  return { id, data: 'primary' };
}

async function fetchFromFallbackSource(id: string): Promise<any> {
  return { id, data: 'fallback' };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function riskyOperation(): Promise<any> {
  return { result: 'success' };
}

async function fetchFromAPI(id: string): Promise<any> {
  return { id, source: 'api' };
}

async function getCachedData(id: string): Promise<any | null> {
  return null;
}

async function fetchFromBackupAPI(id: string): Promise<any> {
  return { id, source: 'backup' };
}

async function processItem(item: string): Promise<any> {
  return { item, processed: true };
}

async function fetchUser(): Promise<any> {
  return { id: 1, name: 'User' };
}

async function fetchSettings(): Promise<any> {
  return { theme: 'dark' };
}

async function fetchData(): Promise<any> {
  return { records: [] };
}
