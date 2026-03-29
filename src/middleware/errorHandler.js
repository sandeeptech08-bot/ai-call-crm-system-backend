/**
 * Global Express error handler.
 * Must have 4 parameters to be recognized by Express as an error handler.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error("❌ Unhandled error:", err.message);

  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "An internal server error occurred"
        : err.message,
  });
}

/**
 * 404 handler for unmatched routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

module.exports = { errorHandler, notFoundHandler };
