import Coupon from "../../models/coupon.js";


// ─── Fetch Coupons (with pagination, search, filter) ─────────────────────────

export const fetchCoupons = async ({ page, search, statusFilter }) => {
  const limit = 4;
  const skip = (page - 1) * limit;

  const query = {
    isDeleted: false,
    code: { $regex: search, $options: "i" }
  };

  if (statusFilter === "active") query.isActive = true;
  else if (statusFilter === "inactive") query.isActive = false;
  else if (statusFilter === "expired") query.validTill = { $lt: new Date() };
  else if (statusFilter === "limitExceeded") query.$expr = { $gte: ["$usedCount", "$usageLimit"] };

  const [totalCoupons, coupons] = await Promise.all([
    Coupon.countDocuments(query),
    Coupon.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()
  ]);

  const totalPages = Math.ceil(totalCoupons / limit) || 1;

  return { coupons, totalCoupons, totalPages };
};


// ─── Validate Coupon Fields ───────────────────────────────────────────────────

export const validateCouponData = ({ discountType, discountValue, minCartValue, validFrom, validTill }) => {
  const fromDate = new Date(validFrom);
  const tillDate = new Date(validTill);

  if (isNaN(fromDate.getTime()) || isNaN(tillDate.getTime())) {
    return { valid: false, message: "Invalid date format provided" };
  }

  if (fromDate >= tillDate) {
    return { valid: false, message: "Valid From must be before Valid Till" };
  }

  const numericDiscount = Number(discountValue);
  const numericMinCart = Number(minCartValue) || 0;

  if (isNaN(numericDiscount) || numericDiscount <= 0) {
    return { valid: false, message: "Discount value must be greater than 0" };
  }

  // Enhanced validation: Percentage cannot exceed 99%
  if (discountType === "percentage" && numericDiscount > 99) {
    return { valid: false, message: "Percentage discount exceeds allowed limit (max 99%)" };
  }

  // Enhanced validation: Flat discount cannot exceed 99% of minCartValue if specified
  if (discountType === "flat" && numericMinCart > 0) {
    const maxAllowedFlat = numericMinCart * 0.99; // Allow up to 99% of minimum cart value
    if (numericDiscount > maxAllowedFlat) {
      return { valid: false, message: "Flat discount exceeds maximum allowed amount (99% of min cart)" };
    }
  }

  if (numericMinCart < 0) {
    return { valid: false, message: "Min cart value cannot be negative" };
  }

  return { valid: true, fromDate, tillDate, numericDiscount, numericMinCart };
};


// ─── Create Coupon ────────────────────────────────────────────────────────────

export const createCoupon = async (body) => {
  const { code, description, discountType, discountValue, minCartValue, maxDiscount, usageLimit, validFrom, validTill } = body;

  const normalizedCode = code.trim().toUpperCase();

  // Restore soft-deleted coupon if it exists
  const existingCoupon = await Coupon.findOne({ code: normalizedCode });
  if (existingCoupon) {
    if (existingCoupon.isDeleted) {
      await Coupon.findByIdAndUpdate(existingCoupon._id, { isDeleted: false });
      return { success: true, icon: "success", message: "Coupon restored successfully" };
    }
    return { success: false, message: "Coupon already exists" };
  }

  const validation = validateCouponData({ discountType, discountValue, minCartValue, validFrom, validTill });
  if (!validation.valid) return { success: false, message: validation.message };

  const { fromDate, tillDate, numericDiscount, numericMinCart } = validation;

  await new Coupon({
    code: normalizedCode,
    description,
    discountType,
    discountValue: numericDiscount,
    minCartValue: numericMinCart,
    maxDiscount: maxDiscount ? Number(maxDiscount) : null,
    usageLimit: usageLimit ? Number(usageLimit) : null,
    validFrom: fromDate,
    validTill: tillDate,
    isActive: true,
    isDeleted: false
  }).save();

  return { success: true, message: "Coupon added successfully" };
};


// ─── Update Coupon ────────────────────────────────────────────────────────────

export const updateCoupon = async (body) => {
  const { couponId, code, description, discountType, discountValue, minCartValue, maxDiscount, usageLimit, validFrom, validTill, isActive } = body;

  if (!couponId || !code || !discountType || !discountValue) {
    return { success: false, message: "Missing required fields" };
  }

  const existingCoupon = await Coupon.findById(couponId);
  if (!existingCoupon) {
    return { success: false, message: "Coupon not found" };
  }

  const normalizedCode = code.trim().toUpperCase();

  const duplicateCoupon = await Coupon.findOne({ code: normalizedCode, _id: { $ne: couponId } });
  if (duplicateCoupon) {
    return { success: false, message: "Coupon code already exists" };
  }

  const validation = validateCouponData({ discountType, discountValue, minCartValue, validFrom, validTill });
  if (!validation.valid) return { success: false, message: validation.message };

  const { fromDate, tillDate, numericDiscount, numericMinCart } = validation;

  const updateData = {
    code: normalizedCode,
    description: description ? description.trim() : "",
    discountType,
    discountValue: numericDiscount,
    minCartValue: numericMinCart,
    maxDiscount: maxDiscount ? Number(maxDiscount) : null,
    usageLimit: usageLimit ? Number(usageLimit) : null,
    validFrom: fromDate,
    validTill: tillDate,
    isActive: isActive === true || isActive === "true"
  };

  // Detect if anything actually changed
  const isChanged =
    existingCoupon.code !== updateData.code ||
    existingCoupon.description !== updateData.description ||
    existingCoupon.discountType !== updateData.discountType ||
    existingCoupon.discountValue !== updateData.discountValue ||
    existingCoupon.minCartValue !== updateData.minCartValue ||
    existingCoupon.maxDiscount !== updateData.maxDiscount ||
    existingCoupon.usageLimit !== updateData.usageLimit ||
    existingCoupon.validFrom.getTime() !== updateData.validFrom.getTime() ||
    existingCoupon.validTill.getTime() !== updateData.validTill.getTime() ||
    existingCoupon.isActive !== updateData.isActive;

  if (!isChanged) {
    return { success: true, icon: "info", message: "No changes detected" };
  }

  await Coupon.findByIdAndUpdate(couponId, updateData, { returnDocument: 'after', runValidators: true });

  return { success: true, message: "Coupon updated successfully" };
};


// ─── Toggle Coupon Status ─────────────────────────────────────────────────────

export const toggleStatus = async (id) => {
  const coupon = await Coupon.findById(id);
  if (!coupon) return { success: false, status: 404, message: "Coupon not found" };

  coupon.isActive = !coupon.isActive;
  await coupon.save();

  return {
    success: true,
    message: `Coupon ${coupon.isActive ? "activated" : "deactivated"} successfully`,
    isActive: coupon.isActive
  };
};


// ─── Soft Delete Coupon ───────────────────────────────────────────────────────

export const softDeleteCoupon = async (id) => {
  const coupon = await Coupon.findById(id);
  if (!coupon) return { success: false, status: 404, message: "Coupon not found" };
  await Coupon.findByIdAndUpdate(id, { isDeleted: true });
  return { success: true, message: "Coupon deleted successfully" };
};