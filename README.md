# Error Handling Framework

Comprehensive error handling framework addressing all common error handling issues in production applications.

## Features

### ✅ All Error Handling Issues Addressed

1. **Missing try-catch blocks** - Utilities and examples for wrapping all async operations
2. **Catching without handling** - Patterns for proper error recovery
3. **Generic error messages** - Custom error classes with specific, user-friendly messages
4. **Stack traces exposed** - Middleware that sanitizes errors before sending to frontend
5. **Missing error recovery** - Retry logic, fallbacks, and circuit breaker patterns
6. **Unhandled promise rejections** - Global handlers and async wrappers
7. **Missing timeout handling** - Timeout utilities for all async operations

## Installation

```bash
npm install
```

## Quick Start

### 1. Custom Error Classes

```typescript
import {
  AppError,
  ValidationError,
  NotFoundError,
  TimeoutError,
  ExternalServiceError
} from './utils/errors';

// Throw specific errors with meaningful messages
throw new ValidationError('Email address is required', { field: 'email' });
throw new NotFoundError('User', userId);
throw new TimeoutError('fetchUserData', 5000);
```

### 2. Error Middleware (Express)

```typescript
import express from 'express';
import {
  errorMiddleware,
  notFoundMiddleware,
  requestIdMiddleware,
  asyncRoute
} from './middleware/errorMiddleware';

const app = express();

// Add request ID tracking
app.use(requestIdMiddleware);

// Your routes using asyncRoute wrapper
app.get('/users/:id', asyncRoute(async (req, res) => {
  const user = await getUserById(req.params.id);
  res.json({ success: true, data: user });
}));

// 404 handler (after all routes)
app.use(notFoundMiddleware);

// Error handler (must be last)
app.use(errorMiddleware);
```

### 3. Timeout Handling

```typescript
import { withTimeout } from './utils/errorHandler';

// Wrap any async operation with timeout
const data = await withTimeout(
  fetchFromAPI(),
  10000, // 10 second timeout
  'fetchFromAPI'
);
```

### 4. Retry Logic

```typescript
import { withRetry } from './utils/errorHandler';

// Retry with exponential backoff
const result = await withRetry(
  () => unreliableOperation(),
  {
    maxRetries: 3,
    initialDelayMs: 1000,
    onRetry: (error, attempt) => {
      console.log(`Retry attempt ${attempt}:`, error.message);
    }
  }
);
```

### 5. Global Error Handlers

```typescript
import { ErrorHandler } from './utils/errorHandler';

const errorHandler = new ErrorHandler(logger, isDevelopment);

// Setup handlers for unhandled rejections and exceptions
errorHandler.setupGlobalHandlers();
```

## Project Structure

```
src/
├── utils/
│   ├── errors.ts              # Custom error classes
│   └── errorHandler.ts        # Error handling utilities
├── middleware/
│   └── errorMiddleware.ts     # Express error middleware
└── examples/
    └── properErrorHandling.ts # Complete examples
```

## Error Classes

### AppError (Base Class)
- Generic application error with code, status, and metadata
- All custom errors extend this

### ValidationError
- 400 status code
- Used for input validation failures
- Includes field-specific details

### UnauthorizedError
- 401 status code
- Used for authentication failures

### ForbiddenError
- 403 status code
- Used for authorization failures

### NotFoundError
- 404 status code
- Used for missing resources

### TimeoutError
- 408 status code
- Used for operations that exceed timeout

### ExternalServiceError
- 502 status code
- Used for third-party API failures

### DatabaseError
- 500 status code
- Used for database operation failures

## Error Response Format

All errors returned to frontend follow this structure:

```json
{
  "success": false,
  "error": {
    "message": "User-friendly error message",
    "code": "ERROR_CODE",
    "timestamp": "2025-10-21T12:00:00.000Z",
    "requestId": "abc123"
  }
}
```

**Important:** Stack traces are NEVER included in responses to frontend. They are only logged server-side.

## Utilities

### `withTimeout<T>(promise, timeoutMs, operation)`
Wraps a promise with timeout handling

### `withRetry<T>(fn, options)`
Retries an operation with exponential backoff

### `asyncHandler<T>(fn)`
Wraps async functions to ensure errors are caught

### `asyncRoute(fn)`
Express route wrapper for async handlers

## Best Practices

### ✅ DO:
- Use specific error classes for different scenarios
- Provide actionable error messages to users
- Log full error details server-side
- Add timeouts to all external operations
- Implement retry logic for transient failures
- Use try-catch for all async operations
- Track errors with request IDs

### ❌ DON'T:
- Send stack traces to frontend
- Use generic error messages like "Something went wrong"
- Leave catch blocks empty
- Ignore unhandled promise rejections
- Skip timeout handling
- Expose internal error details to users

## Code Review Checklist

See [ERROR_HANDLING_CHECKLIST.md](./ERROR_HANDLING_CHECKLIST.md) for a comprehensive review checklist.

## Examples

Complete examples of proper error handling for all scenarios are in:
- `src/examples/properErrorHandling.ts`

These examples demonstrate:
1. ✅ Proper try-catch blocks
2. ✅ Error handling with recovery
3. ✅ User-friendly messages
4. ✅ No stack trace exposure
5. ✅ Error recovery logic
6. ✅ Promise rejection handling
7. ✅ Timeout handling

## Testing Error Handling

```typescript
// Test that errors are properly caught and transformed
it('should return sanitized error to frontend', async () => {
  const error = new DatabaseError('Connection failed');
  const response = errorHandler.handleError(error);

  expect(response.error.message).toBe('Connection failed');
  expect(response.error.code).toBe('DATABASE_ERROR');
  expect(response.error).not.toHaveProperty('stack');
});
```

## Production Configuration

```typescript
// In production
const errorHandler = new ErrorHandler(
  productionLogger,
  false // Don't expose detailed errors
);

// Setup global handlers
errorHandler.setupGlobalHandlers();
```

## License

MIT
