// utils/validation/fileValidator.js
import { BadRequest } from "../errors/httpError.js";

const DEFAULT_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Middleware to validate uploaded files.
 */
export const validateFiles = (req, res, next) => {
  try {
    const files = [];
    if (req.file) files.push(req.file);
    
    if (req.files) {
      if (Array.isArray(req.files)) {
        files.push(...req.files);
      } else if (typeof req.files === "object") {
        for (const v of Object.values(req.files)) {
          if (Array.isArray(v)) files.push(...v);
          else files.push(v);
        }
      }
    }

    if (files.length === 0 && (req.method === 'POST' && req.originalUrl.includes('products-add'))) {
        // Optional: Require at least one image for new products
        // return next(new BadRequest("At least one image is required"));
    }

    for (const f of files) {
      if (!DEFAULT_ALLOWED_TYPES.includes(f.mimetype)) {
        throw new BadRequest(`Invalid file type ${f.mimetype}. Allowed: ${DEFAULT_ALLOWED_TYPES.join(", ")}`);
      }
      if (f.size > DEFAULT_MAX_SIZE) {
        throw new BadRequest(`File ${f.originalname} too large (Max 5MB)`);
      }
    }
    next();
  } catch (error) {
    // If it's an AJAX request, send JSON, else maybe redirect with error
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(error.statusCode || 400).json({ success: false, message: error.message });
    }
    next(error);
  }
};
