import Offer from "../models/offer.js";

/**
 * Validates offer limits before applying discount
 * @param {number} price - Original price
 * @param {Object} offer - Offer object
 * @returns {Object} - Validation result with isValid and error message
 */
const validateOfferLimits = (price, offer) => {
    if (!offer || !price) {
        return { isValid: false, error: "Invalid price or offer" };
    }

    if (offer.discountType === 'percentage') {
        // Percentage validation: cannot exceed 70%
        if (offer.discountValue > 70) {
            return { isValid: false, error: "Percentage discount exceeds allowed limit" };
        }
    } else if (offer.discountType === 'flat') {
        // Flat discount validation
        const maxAllowed = price * 0.5; // 50% of product price
        
        if (offer.discountValue > maxAllowed) {
            return { isValid: false, error: "Flat discount exceeds maximum allowed amount" };
        }
        
        if (offer.discountValue > price) {
            return { isValid: false, error: "Discount cannot exceed product price" };
        }
    }

    return { isValid: true };
};

/**
 * Calculates the safe discount amount for a given offer and price.
 * Ensures discount doesn't exceed limits and prevents negative pricing.
 */
const getDiscountAmount = (price, offer) => {
    if (!offer) return 0;
    
    // Validate offer limits first
    const validation = validateOfferLimits(price, offer);
    if (!validation.isValid) {
        console.warn(`Offer validation failed: ${validation.error}`);
        return 0; // Return no discount if validation fails
    }
    
    if (offer.discountType === 'flat') {
        // For flat discount, ensure it doesn't exceed 50% of price or the price itself
        const maxAllowed = Math.min(price * 0.5, price);
        return Math.min(offer.discountValue, maxAllowed);
    } else {
        // For percentage discount, ensure it doesn't exceed 70%
        const safePercentage = Math.min(offer.discountValue, 70);
        const discount = (price * safePercentage) / 100;
        return offer.maxDiscountAmount ? Math.min(discount, offer.maxDiscountAmount) : discount;
    }
};

/**
 * Calculates the best offer for a product based on product-specific and category offers.
 * Returns the offer that provides the highest absolute discount.
 */
export const calculateBestOffer = async (productId, categoryId, price) => {
    try {
        const now = new Date();
        
        const activeOffers = await Offer.find({
            isActive: true,
            isDeleted: false,
            startDate: { $lte: now },
            endDate: { $gte: now },
            $or: [
                { productId: productId, offerType: 'product' },
                { categoryId: categoryId, offerType: 'category' },
                { offerType: 'all' }
            ]
        });

        if (!activeOffers.length) return null;

        let bestOffer = null;
        let maxDiscount = -1;

        activeOffers.forEach(offer => {
            // Validate offer limits before calculating discount
            const validation = validateOfferLimits(price, offer);
            if (!validation.isValid) {
                console.warn(`Skipping invalid offer ${offer._id}: ${validation.error}`);
                return;
            }

            const currentDiscount = getDiscountAmount(price, offer);
            if (currentDiscount > maxDiscount) {
                maxDiscount = currentDiscount;
                bestOffer = offer;
            }
        });

        return bestOffer;
    } catch (error) {
        console.error("Error calculating best offer:", error);
        return null;
    }
};

/**
 * Applies an offer to a numeric price and returns the final price.
 * Ensures the final price is never negative and respects offer limits.
 */
export const applyOffer = (price, offer) => {
    if (!offer) return price;
    
    // Validate offer limits before applying
    const validation = validateOfferLimits(price, offer);
    if (!validation.isValid) {
        console.warn(`Cannot apply offer: ${validation.error}`);
        return price; // Return original price if validation fails
    }
    
    const discount = getDiscountAmount(price, offer);
    const finalPrice = Math.max(0, price - discount);
    
    // Additional safety check to prevent negative pricing
    return finalPrice >= 0 ? finalPrice : price;
};

/**
 * Utility function to validate offer data before saving
 * @param {Object} offerData - Offer data to validate
 * @param {number} productPrice - Product price for validation (optional)
 * @returns {Object} - Validation result
 */
export const validateOfferData = (offerData, productPrice = null) => {
    const errors = {};
    
    if (offerData.discountType === 'percentage' && offerData.discountValue > 70) {
        errors.discountValue = "Percentage discount exceeds allowed limit";
    }
    
    if (offerData.discountType === 'flat' && productPrice) {
        const maxAllowed = productPrice * 0.5;
        if (offerData.discountValue > maxAllowed) {
            errors.discountValue = "Flat discount exceeds maximum allowed amount";
        }
        if (offerData.discountValue > productPrice) {
            errors.discountValue = "Discount cannot exceed product price";
        }
    }
    
    return Object.keys(errors).length > 0 ? errors : null;
};
