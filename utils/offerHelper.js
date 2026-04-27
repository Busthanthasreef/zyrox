import Offer from "../models/offer.js";

/**
 * Calculates the absolute discount amount for a given offer and price.
 */
const getDiscountAmount = (price, offer) => {
    if (!offer) return 0;
    if (offer.discountType === 'flat') {
        return Math.min(offer.discountValue, price); // Flat discount can't exceed price
    } else {
        const discount = (price * offer.discountValue) / 100;
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
            // Check minimum purchase requirement
            if (offer.minPurchaseAmount && price < offer.minPurchaseAmount) return;

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
 */
export const applyOffer = (price, offer) => {
    if (!offer) return price;
    const discount = getDiscountAmount(price, offer);
    return Math.max(0, price - discount);
};
