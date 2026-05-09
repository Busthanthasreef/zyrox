import Offer from "../../models/offer.js";
import Product from "../../models/product.js";
import Categories from "../../models/category.js";
import Variant from "../../models/variant.js";

/**
 * Validates offer discount limits against product prices
 */
const validateOfferLimits = async (data) => {
    const { discountType, discountValue, offerType, productId, categoryId } = data;
    const errors = {};
    
    if (discountType === 'percentage') {
        // Percentage validation: cannot exceed 70%
        const val = parseFloat(discountValue);
        if (val > 99) {
            errors.discountValue = "Percentage discount exceeds allowed limit (max 99%)";
            return errors;
        }
    } else if (discountType === 'flat') {
        // Flat discount validation
        const flatAmount = parseFloat(discountValue);
        
        if (offerType === 'product' && productId) {
            // Validate against specific product price
            const variants = await Variant.find({ productId, IsDeleted: { $ne: true } });
            if (variants && variants.length > 0) {
                const minPrice = Math.min(...variants.map(v => v.price));
                const maxAllowed = minPrice * 0.5; // 50% of product price
                
                if (flatAmount > maxAllowed) {
                    errors.discountValue = `Flat discount exceeds maximum allowed amount (limit is: ${Math.floor(maxAllowed)})`;
                    return errors;
                }
                if (flatAmount > minPrice) {
                    errors.discountValue = "Discount cannot exceed product price";
                    return errors;
                }
            }
        } else if (offerType === 'category' && categoryId) {
            // Validate against category's minimum product price
            const products = await Product.find({ categoryId, IsDeleted: { $ne: true } });
            if (products && products.length > 0) {
                const productIds = products.map(p => p._id);
                const variants = await Variant.find({ productId: { $in: productIds }, IsDeleted: { $ne: true } });
                
                if (variants && variants.length > 0) {
                    const minPrice = Math.min(...variants.map(v => v.price));
                    const maxAllowed = minPrice * 0.5; // 50% of minimum product price
                    
                    if (flatAmount > maxAllowed) {
                        errors.discountValue = `Flat discount exceeds maximum allowed amount (limit is: ${Math.floor(maxAllowed)})`;
                        return errors;
                    }
                    if (flatAmount > minPrice) {
                        errors.discountValue = "Discount cannot exceed product price";
                        return errors;
                    }
                }
            }
        }
    }
    
    return Object.keys(errors).length > 0 ? errors : null;
};

// Helper for validating offer data
const validateOfferData = async (data, isEdit = false) => {
    const errors = {};
    const { offerName, discountType, discountValue, startDate, endDate, offerType, productId, categoryId } = data;

    if (!offerName || offerName.trim().length < 3) {
        errors.offerName = "Offer name must be at least 3 characters.";
    }

    if (offerType === 'product' && !productId) {
        errors.targetId = "Please select a product.";
    } else if (offerType === 'category' && !categoryId) {
        errors.targetId = "Please select a category.";
    }

    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) {
        errors.discountValue = "Discount value must be a positive number.";
    } else if (discountType === 'percentage' && val > 99) {
        errors.discountValue = "Percentage discount exceeds allowed limit (max 99%)";
    }

    // Validate offer limits for flat discounts and specific products/categories
    if (val > 0 && (offerType === 'product' || offerType === 'category')) {
        const limitErrors = await validateOfferLimits(data);
        if (limitErrors) {
            Object.assign(errors, limitErrors);
        }
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (startDate && isNaN(start.getTime())) {
        errors.startDate = "Invalid start date format.";
    } else if (!startDate) {
        errors.startDate = "Start date is required.";
    } else if (!isEdit && start < now) {
        errors.startDate = "Start date cannot be in the past.";
    }

    if (endDate && isNaN(end.getTime())) {
        errors.endDate = "Invalid end date format.";
    } else if (!endDate) {
        errors.endDate = "End date is required.";
    } else if (startDate && !isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
        errors.endDate = "End date must be after the start date.";
    }

    return Object.keys(errors).length > 0 ? errors : null;
};

const fetchOffers = async ({ page, limit, search, type, status }) => {
    const skip = (page - 1) * limit;

    const query = { isDeleted: false };
    if (search) {
        query.offerName = { $regex: search, $options: "i" };
    }
    if (type !== "all") {
        query.offerType = type;
    }
    if (status !== "all") {
        query.isActive = status === "active";
    }

    const totalOffersCount = await Offer.countDocuments(query);
    const totalPages = Math.ceil(totalOffersCount / limit) || 1;

    const offers = await Offer.find(query)
        .populate('productId')
        .populate('categoryId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    // Attach prices to each offer
    const offersWithPrices = await Promise.all(offers.map(async (offer) => {
        let basePrice = null;
        let offerPrice = null;
        let discountAmount = null;

        if (offer.offerType === 'product' && offer.productId) {
            const variants = await Variant.find({ productId: offer.productId._id, IsDeleted: { $ne: true } });
            if (variants.length > 0) {
                basePrice = Math.min(...variants.map(v => v.price));
            }
        } else if (offer.offerType === 'category' && offer.categoryId) {
            const products = await Product.find({ categoryId: offer.categoryId._id, IsDeleted: { $ne: true } });
            if (products.length > 0) {
                const productIds = products.map(p => p._id);
                const variants = await Variant.find({ productId: { $in: productIds }, IsDeleted: { $ne: true } });
                if (variants.length > 0) {
                    basePrice = Math.min(...variants.map(v => v.price));
                }
            }
        } else if (offer.offerType === 'all') {
            // For store-wide, we could show the min price of any variant in store
            const minVariant = await Variant.findOne({ IsDeleted: { $ne: true } }).sort({ price: 1 });
            if (minVariant) basePrice = minVariant.price;
        }

        if (basePrice !== null) {
            if (offer.discountType === 'percentage') {
                const discount = (basePrice * offer.discountValue) / 100;
                const effectiveDiscount = Math.min(discount, offer.maxDiscountAmount || Infinity);
                offerPrice = basePrice - effectiveDiscount;
                discountAmount = effectiveDiscount;
            } else {
                offerPrice = Math.max(0, basePrice - offer.discountValue);
                discountAmount = basePrice - offerPrice;
            }
        }

        const offerObj = offer.toObject();
        return { ...offerObj, basePrice, offerPrice, discountAmount };
    }));

    return { offers: offersWithPrices, totalOffersCount, totalPages };
};

const fetchProductsAndCategories = async () => {
    const products = await Product.find({ IsDeleted: { $ne: true } });
    const categories = await Categories.find({ IsDeleted: { $ne: true } });
    return { products, categories };
};

const createProductOffer = async (body) => {
    const { offerName, productId, discountType, discountValue, maxDiscountAmount, startDate, endDate, isActive } = body;

    const existingOffer = await Offer.findOne({ productId, offerType: 'product', isDeleted: false });
    if (existingOffer) {
        return { conflict: true, message: "Offer already exists for this product" };
    }

    // Additional validation for flat discounts against product price
    if (discountType === 'flat') {
        const variants = await Variant.find({ productId, IsDeleted: { $ne: true } });
        if (variants && variants.length > 0) {
            const minPrice = Math.min(...variants.map(v => v.price));
            const maxAllowed = minPrice * 0.5; // 50% of product price
            
            if (discountValue > maxAllowed) {
                return { conflict: true, message: `Flat discount exceeds maximum allowed amount (limit is: ${Math.floor(maxAllowed)})` };
            }
            if (discountValue > minPrice) {
                return { conflict: true, message: "Discount cannot exceed product price" };
            }
        }
    }

    const newOffer = new Offer({
        offerName,
        offerType: 'product',
        productId,
        discountType,
        discountValue,
        minPurchaseAmount: 0, // Set to 0 since we removed the field
        maxDiscountAmount: maxDiscountAmount || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: isActive !== undefined ? isActive : true
    });

    await newOffer.save();
    return { conflict: false };
};

const createCategoryOffer = async (body) => {
    const { offerName, categoryId, discountType, discountValue, maxDiscountAmount, startDate, endDate, isActive } = body;

    const existingOffer = await Offer.findOne({ categoryId, offerType: 'category', isDeleted: false });
    if (existingOffer) {
        return { conflict: true, message: "Offer already exists for this category" };
    }

    // Additional validation for flat discounts against category's minimum product price
    if (discountType === 'flat') {
        const products = await Product.find({ categoryId, IsDeleted: { $ne: true } });
        if (products && products.length > 0) {
            const productIds = products.map(p => p._id);
            const variants = await Variant.find({ productId: { $in: productIds }, IsDeleted: { $ne: true } });
            
            if (variants && variants.length > 0) {
                const minPrice = Math.min(...variants.map(v => v.price));
                const maxAllowed = minPrice * 0.5; // 50% of minimum product price
                
                if (discountValue > maxAllowed) {
                    return { conflict: true, message: `Flat discount exceeds maximum allowed amount (limit is: ${Math.floor(maxAllowed)})` };
                }
                if (discountValue > minPrice) {
                    return { conflict: true, message: "Discount cannot exceed product price" };
                }
            }
        }
    }

    const newOffer = new Offer({
        offerName,
        offerType: 'category',
        categoryId,
        discountType,
        discountValue,
        minPurchaseAmount: 0, // Set to 0 since we removed the field
        maxDiscountAmount: maxDiscountAmount || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: isActive !== undefined ? isActive : true
    });

    await newOffer.save();
    return { conflict: false };
};

const updateOffer = async (id, body) => {
    const { offerName, offerType, productId, categoryId, discountType, discountValue, maxDiscountAmount, startDate, endDate, isActive } = body;

    const offer = await Offer.findById(id);
    if (!offer) return { notFound: true };

    // Check if another offer exists for the new product/category if changed
    const query = { _id: { $ne: id }, offerType, isDeleted: false };
    if (offerType === 'product') query.productId = productId;
    else if (offerType === 'category') query.categoryId = categoryId;
    // For 'all' or 'referral', the offerType itself is enough for uniqueness check

    const conflict = await Offer.findOne(query);
    if (conflict) {
        return { conflict: true, message: `An offer already exists for this ${offerType}` };
    }

    // Additional validation for flat discounts
    if (discountType === 'flat') {
        if (offerType === 'product' && productId) {
            const variants = await Variant.find({ productId, IsDeleted: { $ne: true } });
            if (variants && variants.length > 0) {
                const minPrice = Math.min(...variants.map(v => v.price));
                const maxAllowed = minPrice * 0.5; // 50% of product price
                
                if (discountValue > maxAllowed) {
                    return { conflict: true, message: `Flat discount exceeds maximum allowed amount (limit is: ${Math.floor(maxAllowed)})` };
                }
                if (discountValue > minPrice) {
                    return { conflict: true, message: "Discount cannot exceed product price" };
                }
            }
        } else if (offerType === 'category' && categoryId) {
            const products = await Product.find({ categoryId, IsDeleted: { $ne: true } });
            if (products && products.length > 0) {
                const productIds = products.map(p => p._id);
                const variants = await Variant.find({ productId: { $in: productIds }, IsDeleted: { $ne: true } });
                
                if (variants && variants.length > 0) {
                    const minPrice = Math.min(...variants.map(v => v.price));
                    const maxAllowed = minPrice * 0.5; // 50% of minimum product price
                    
                    if (discountValue > maxAllowed) {
                        return { conflict: true, message: `Flat discount exceeds maximum allowed amount (limit is: ${Math.floor(maxAllowed)})` };
                    }
                    if (discountValue > minPrice) {
                        return { conflict: true, message: "Discount cannot exceed product price" };
                    }
                }
            }
        }
    }

    offer.offerName = offerName;
    offer.offerType = offerType;
    offer.productId = offerType === 'product' ? productId : null;
    offer.categoryId = offerType === 'category' ? categoryId : null;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.minPurchaseAmount = 0; // Set to 0 since we removed the field
    offer.maxDiscountAmount = maxDiscountAmount || null;
    offer.startDate = new Date(startDate);
    offer.endDate = new Date(endDate);
    offer.isActive = isActive !== undefined ? isActive : true;

    await offer.save();
    return { notFound: false, conflict: false };
};

const flipOfferStatus = async (id) => {
    const offer = await Offer.findById(id);
    if (!offer) return { notFound: true };

    offer.isActive = !offer.isActive;
    await offer.save();
    return { notFound: false, isActive: offer.isActive };
};

const softDeleteOffer = async (id) => {
    const offer = await Offer.findById(id);
    if (!offer) return { notFound: true };

    offer.isDeleted = true;
    await offer.save();
    return { notFound: false };
};

const createReferralOffer = async (body) => {
    const { offerName, discountValue, startDate, endDate, isActive } = body;

    const existingOffer = await Offer.findOne({ offerType: 'referral', isDeleted: false });
    if (existingOffer) {
        return { conflict: true, message: "Referral offer already exists. Please edit the existing one." };
    }

    const newOffer = new Offer({
        offerName,
        offerType: 'referral',
        discountType: 'flat', // Referral usually uses flat amounts
        discountValue,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: isActive !== undefined ? isActive : true
    });

    await newOffer.save();
    return { conflict: false };
};

const createAllOffer = async (body) => {
    const { offerName, discountType, discountValue, maxDiscountAmount, startDate, endDate, isActive } = body;

    const existingOffer = await Offer.findOne({ offerType: 'all', isDeleted: false });
    if (existingOffer) {
        return { conflict: true, message: "A store-wide offer already exists." };
    }

    const newOffer = new Offer({
        offerName,
        offerType: 'all',
        discountType,
        discountValue,
        minPurchaseAmount: 0, // Set to 0 since we removed the field
        maxDiscountAmount: maxDiscountAmount || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: isActive !== undefined ? isActive : true
    });

    await newOffer.save();
    return { conflict: false };
};

export {
    validateOfferData,
    fetchOffers,
    fetchProductsAndCategories,
    createProductOffer,
    createCategoryOffer,
    updateOffer,
    flipOfferStatus,
    softDeleteOffer,
    createReferralOffer,
    createAllOffer
};