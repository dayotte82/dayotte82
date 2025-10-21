# Error Handling Review Checklist

Use this checklist to review code for proper error handling.

## 1. ✅ Try-Catch Blocks

### Check for:
- [ ] All async/await functions have try-catch blocks
- [ ] Database operations are wrapped in try-catch
- [ ] External API calls are wrapped in try-catch
- [ ] File I/O operations are wrapped in try-catch
- [ ] JSON parsing operations are wrapped in try-catch

### Common Issues:
```typescript
// ❌ BAD: No try-catch
async function getData() {
  const result = await db.query('SELECT * FROM users');
  return result;
}

// ✅ GOOD: Proper try-catch
async function getData() {
  try {
    const result = await db.query('SELECT * FROM users');
    return result;
  } catch (error) {
    throw new DatabaseError('Failed to fetch users', 'getData');
  }
}
```

## 2. ✅ Error Handling (Not Just Catching)

### Check for:
- [ ] No empty catch blocks
- [ ] Errors are logged before re-throwing
- [ ] Specific error types are caught when appropriate
- [ ] Error recovery logic exists where applicable
- [ ] Fallback mechanisms are in place

### Common Issues:
```typescript
// ❌ BAD: Empty catch (silent failure)
try {
  await saveData();
} catch (error) {
  // Nothing - error disappears
}

// ❌ BAD: Logged but not handled
try {
  await saveData();
} catch (error) {
  console.log(error); // Only logging, no recovery
}

// ✅ GOOD: Proper handling with recovery
try {
  await saveData();
} catch (error) {
  logger.error('Failed to save data', { error });

  // Try recovery
  try {
    await saveToBackup();
  } catch (backupError) {
    throw new AppError('Failed to save data to primary and backup');
  }
}
```

## 3. ✅ User-Friendly Error Messages

### Check for:
- [ ] Error messages are specific and actionable
- [ ] No technical jargon in user-facing messages
- [ ] Error messages explain what went wrong
- [ ] Error messages suggest how to fix the issue
- [ ] Validation errors specify which field has the issue

### Common Issues:
```typescript
// ❌ BAD: Generic, unhelpful messages
throw new Error('Invalid input');
throw new Error('Something went wrong');
throw new Error('Error');

// ✅ GOOD: Specific, actionable messages
throw new ValidationError('Email address is required', { field: 'email' });
throw new ValidationError('Password must be at least 8 characters', {
  field: 'password',
  minLength: 8
});
throw new NotFoundError('User', userId);
```

## 4. ✅ No Stack Traces to Frontend

### Check for:
- [ ] Error responses don't include `error.stack`
- [ ] Error responses don't include full error objects
- [ ] Production mode hides detailed error info
- [ ] Error middleware sanitizes errors before sending
- [ ] Sensitive information is not leaked in errors

### Common Issues:
```typescript
// ❌ BAD: Exposing stack trace
res.status(500).json({
  error: error.message,
  stack: error.stack, // NEVER!
  details: error // May contain sensitive data
});

// ✅ GOOD: Sanitized response
res.status(500).json({
  success: false,
  error: {
    message: 'An error occurred',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  }
});
```

## 5. ✅ Error Recovery Logic

### Check for:
- [ ] Retry mechanisms for transient failures
- [ ] Fallback data sources when primary fails
- [ ] Circuit breaker pattern for external services
- [ ] Graceful degradation of features
- [ ] Cache usage when services are down

### Common Issues:
```typescript
// ❌ BAD: No recovery, just fails
async function fetchData() {
  return await externalAPI.getData();
}

// ✅ GOOD: Multiple recovery strategies
async function fetchData() {
  try {
    // Try with retry
    return await withRetry(() => externalAPI.getData());
  } catch (apiError) {
    // Fallback to cache
    const cached = await cache.get('data');
    if (cached) return cached;

    // Last resort: return empty with warning
    logger.warn('All data sources failed, returning empty');
    return [];
  }
}
```

## 6. ✅ Unhandled Promise Rejections

### Check for:
- [ ] All promises have .catch() or are in try-catch
- [ ] Promise.all/allSettled used instead of forEach with async
- [ ] Global rejection handler is set up
- [ ] No floating promises (await or .catch everything)
- [ ] Event handlers properly catch async errors

### Common Issues:
```typescript
// ❌ BAD: Unhandled promise
function processItems(items) {
  items.forEach(item => {
    processAsync(item); // No await or .catch!
  });
}

// ❌ BAD: Fire-and-forget
async function handleRequest() {
  sendEmail(); // Async function not awaited
  return 'OK';
}

// ✅ GOOD: All promises handled
async function processItems(items) {
  await Promise.allSettled(
    items.map(async item => {
      try {
        await processAsync(item);
      } catch (error) {
        logger.error('Failed to process item', { item, error });
      }
    })
  );
}

// ✅ GOOD: Explicitly handle background task
async function handleRequest() {
  sendEmail().catch(error => {
    logger.error('Failed to send email', { error });
  });
  return 'OK';
}
```

## 7. ✅ Timeout Handling

### Check for:
- [ ] All external API calls have timeouts
- [ ] Database queries have timeouts
- [ ] File operations have timeouts
- [ ] WebSocket connections have timeouts
- [ ] Long-running operations have timeouts

### Common Issues:
```typescript
// ❌ BAD: No timeout (can hang forever)
async function fetchData() {
  const response = await fetch('https://api.example.com/data');
  return response.json();
}

// ✅ GOOD: With timeout
async function fetchData() {
  return await withTimeout(
    fetch('https://api.example.com/data').then(r => r.json()),
    10000,
    'fetchData from API'
  );
}

// ✅ GOOD: Native fetch with AbortController
async function fetchData() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('https://api.example.com/data', {
      signal: controller.signal
    });
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

## Review Process

### For Each File:
1. Search for `async` functions - verify try-catch exists
2. Search for `catch` blocks - verify they handle errors properly
3. Search for `.json()` responses - verify no stack traces
4. Search for `Promise` - verify all are awaited or have .catch()
5. Search for `setTimeout/setInterval` - verify cleanup exists
6. Search for external calls (fetch, axios, etc.) - verify timeouts
7. Search for database calls - verify error handling and timeouts

### For Each Route/API Endpoint:
1. Verify input validation with specific error messages
2. Verify error middleware is configured
3. Verify no sensitive data in error responses
4. Verify proper HTTP status codes
5. Verify request ID tracking for debugging

### For Each Service/Module:
1. Verify custom error classes are used
2. Verify logging of errors with context
3. Verify retry logic for external dependencies
4. Verify circuit breaker for unreliable services
5. Verify graceful degradation strategies

## Automated Checks

Use these patterns to find issues:

```bash
# Find async functions without try
grep -n "async.*{" src/**/*.ts | grep -v "try"

# Find empty catch blocks
grep -A 1 "catch.*{" src/**/*.ts | grep "^}"

# Find error.stack being sent
grep -n "error.stack\|err.stack" src/**/*.ts

# Find fetch without timeout
grep -n "fetch(" src/**/*.ts | grep -v "timeout\|AbortController"

# Find Promise without await or catch
grep -n "Promise\." src/**/*.ts | grep -v "await\|\.catch"
```

## Priority Levels

### 🔴 Critical (Fix Immediately):
- Stack traces exposed to users
- Unhandled promise rejections in production code
- Empty catch blocks with no logging
- No timeout on external API calls

### 🟡 High Priority (Fix Soon):
- Generic error messages
- Missing try-catch on async operations
- No error recovery logic
- Missing input validation

### 🟢 Medium Priority (Improve):
- Better error messages
- Add retry logic
- Improve logging
- Add request tracking
