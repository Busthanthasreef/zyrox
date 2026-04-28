import Joi from 'joi';

// ---- User Auth ----
export const signupSchema = Joi.object({
  Name: Joi.string().min(2).max(50).required().messages({
    'string.empty': 'Name is required',
    'string.min': 'Name must be at least 2 characters',
    'any.required': 'Name is required',
  }),
  Email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    'string.empty': 'Email is required',
    'string.email': 'Enter a valid email',
    'any.required': 'Email is required',
  }),
  Phone: Joi.string()
    .pattern(/^\d{10,15}$/)
    .required()
    .messages({
      'string.empty': 'Phone is required',
      'string.pattern.base': 'Phone must contain 10‑15 digits',
    }),
  Password: Joi.string()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/)
    .required()
    .messages({
      'string.empty': 'Password is required',
      'string.pattern.base':
        'Password must be ≥8 chars, include upper, lower, number, special char',
    }),
  confirmPassword: Joi.ref('Password'),
  referralCode: Joi.string().allow('').optional(),
});

export const signinSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.empty': 'Email is required',
      'string.email': 'Enter a valid email',
    }),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required',
  }),
});

// ---- Profile ----
export const profileSchema = Joi.object({
  Name: Joi.string().min(2).max(50).required(),
  Phone: Joi.string().pattern(/^\d{10,15}$/).required(),
  // profileImage will be validated via fileValidator middleware
});

// ---- Address ----
export const addressSchema = Joi.object({
  line1: Joi.string().required(),
  line2: Joi.string().allow('').optional(),
  city: Joi.string().required(),
  state: Joi.string().required(),
  postalCode: Joi.string().pattern(/^\d{4,10}$/).required(),
  country: Joi.string().required(),
});

// ---- Product (Admin) ----
export const productSchema = Joi.object({
  title: Joi.string().min(2).max(150).required(),
  description: Joi.string().allow('').optional(),
  price: Joi.number().positive().required(),
  stock: Joi.number().integer().min(0).required(),
  categoryId: Joi.string().required(),
  // images validated via fileValidator middleware
});

// ---- Variant ----
export const variantSchema = Joi.object({
  size: Joi.string().required(),
  color: Joi.string().required(),
  price: Joi.number().positive().required(),
  sku: Joi.string().allow('').optional(),
  // images via fileValidator
});

// ---- Coupon ----
export const couponSchema = Joi.object({
  code: Joi.string().alphanum().min(4).max(20).required(),
  discount: Joi.number().positive().required(),
  validTill: Joi.date().greater('now').required(),
  minPurchase: Joi.number().positive().optional(),
});

// Add more schemas as needed for other admin forms.
