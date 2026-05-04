import Offer from "../../models/offer.js";
import Product from "../../models/product.js";
import Categories from "../../models/category.js";

// Helper for validating offer data
const validateOfferData = (data, isEdit = false) => {
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
    } else if (discountType === 'percentage' && val > 100) {
        errors.discountValue = "Percentage cannot exceed 100%.";
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

    return { offers, totalOffersCount, totalPages };
};

const fetchProductsAndCategories = async () => {
    const products = await Product.find({ IsDeleted: { $ne: true } });
    const categories = await Categories.find({ IsDeleted: { $ne: true } });
    return { products, categories };
};

const createProductOffer = async (body) => {
    const { offerName, productId, discountType, discountValue, minPurchaseAmount, maxDiscountAmount, startDate, endDate, isActive } = body;

    const existingOffer = await Offer.findOne({ productId, offerType: 'product', isDeleted: false });
    if (existingOffer) {
        return { conflict: true, message: "Offer already exists for this product" };
    }

    const newOffer = new Offer({
        offerName,
        offerType: 'product',
        productId,
        discountType,
        discountValue,
        minPurchaseAmount: minPurchaseAmount || 0,
        maxDiscountAmount: maxDiscountAmount || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: isActive !== undefined ? isActive : true
    });

    await newOffer.save();
    return { conflict: false };
};

const createCategoryOffer = async (body) => {
    const { offerName, categoryId, discountType, discountValue, minPurchaseAmount, maxDiscountAmount, startDate, endDate, isActive } = body;

    const existingOffer = await Offer.findOne({ categoryId, offerType: 'category', isDeleted: false });
    if (existingOffer) {
        return { conflict: true, message: "Offer already exists for this category" };
    }

    const newOffer = new Offer({
        offerName,
        offerType: 'category',
        categoryId,
        discountType,
        discountValue,
        minPurchaseAmount: minPurchaseAmount || 0,
        maxDiscountAmount: maxDiscountAmount || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: isActive !== undefined ? isActive : true
    });

    await newOffer.save();
    return { conflict: false };
};

const updateOffer = async (id, body) => {
    const { offerName, offerType, productId, categoryId, discountType, discountValue, minPurchaseAmount, maxDiscountAmount, startDate, endDate, isActive } = body;

    const offer = await Offer.findById(id);
    if (!offer) return { notFound: true };

    // Check if another offer exists for the new product/category if changed
    const query = { _id: { $ne: id }, offerType, isDeleted: false };
    if (offerType === 'product') query.productId = productId;
    else query.categoryId = categoryId;

    const conflict = await Offer.findOne(query);
    if (conflict) {
        return { conflict: true, message: `An offer already exists for this ${offerType}` };
    }

    offer.offerName = offerName;
    offer.offerType = offerType;
    offer.productId = offerType === 'product' ? productId : null;
    offer.categoryId = offerType === 'category' ? categoryId : null;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.minPurchaseAmount = minPurchaseAmount || 0;
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
    const { offerName, discountType, discountValue, minPurchaseAmount, maxDiscountAmount, startDate, endDate, isActive } = body;

    const existingOffer = await Offer.findOne({ offerType: 'all', isDeleted: false });
    if (existingOffer) {
        return { conflict: true, message: "A store-wide offer already exists." };
    }

    const newOffer = new Offer({
        offerName,
        offerType: 'all',
        discountType,
        discountValue,
        minPurchaseAmount: minPurchaseAmount || 0,
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