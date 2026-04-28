// utils/errors/httpError.js
export class HttpError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequest extends HttpError {
  constructor(message = "Bad Request") {
    super(message, 400);
  }
}

export class NotFound extends HttpError {
  constructor(message = "Not Found") {
    super(message, 404);
  }
}

export class Unauthorized extends HttpError {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}

export class Forbidden extends HttpError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}
