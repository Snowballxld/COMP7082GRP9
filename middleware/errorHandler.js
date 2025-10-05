
export function errorHandler(err, req, res, next) {
  console.error(err.stack); // log for debugging

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: true,
    message: err.message || 'Internal Server Error',
  });
}

