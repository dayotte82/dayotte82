/**
 * Express Error Middleware
 * Centralized error handling for Express applications
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../utils/errors';
import { ErrorHandler } from '../utils/errorHandler';

// Initialize error handler
const errorHandler = new ErrorHandler(
  undefined, // Replace with your logger instance
  process.env.NODE_ENV === 'development'
);

/**
 * Express error handling middleware
 * Must be registered AFTER all routes
 */
export function errorMiddleware(
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate request ID for tracking
  const requestId = req.headers['x-request-id'] as string || generateRequestId();

  // Handle the error and get sanitized response
  const errorResponse = errorHandler.handleError(error, requestId);

  // Determine status code
  const statusCode = error instanceof AppError ? error.statusCode : 500;

  // Send response - NO stack trace included
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 * Should be registered BEFORE error middleware but AFTER all routes
 */
export function notFoundMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const error = new AppError(
    `Route ${req.method} ${req.path} not found`,
    ErrorCode.NOT_FOUND,
    404,
    true,
    {
      method: req.method,
      path: req.path,
    }
  );

  next(error);
}

/**
 * Request ID middleware
 * Generates unique ID for each request to track errors
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Async route wrapper to catch errors in async route handlers
 * Prevents unhandled promise rejections in Express routes
 */
export function asyncRoute<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
