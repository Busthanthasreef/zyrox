import Offer from "../../models/offer.js";
import Product from "../../models/product.js";
import Categories from "../../models/category.js";

// Load Offers List
const getOffers = async (req, res) => {
    try {
        const offers = await Offer.find({ isDeleted: false })
            .populate('productId')
            .populate('categoryId')
            .sort({ createdAt: -1 });
        
        const products = await Product.find({ IsDeleted: { $ne: true } });
        const categories = await Categories.find({ IsDeleted: { $ne: true } });

        res.render('admin/offer/offers', {
            admin:req.session.admin,
            offers,
            totalOffers: offers.length,
            products,
            categories,
            activePage: 'offers'
        });
    } catch (error) {
        console.error("Error fetching offers:", error);
        res.status(500).send("Internal Server Error");
    }
};

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

    if (!startDate) {
        errors.startDate = "Start date is required.";
    } else if (!isEdit && start < now) {
        errors.startDate = "Start date cannot be in the past.";
    }

    if (!endDate) {
        errors.endDate = "End date is required.";
    } else if (startDate && end <= start) {
        errors.endDate = "End date must be after the start date.";
    }

    return Object.keys(errors).length > 0 ? errors : null;
};

// Add Product Offer
const addProductOffer = async (req, res) => {
    try {
        const errors = validateOfferData({ ...req.body, offerType: 'product' });
        if (errors) return res.status(400).json({ success: false, errors });

        const { offerName, productId, discountType, discountValue, minPurchaseAmount, maxDiscountAmount, startDate, endDate, isActive } = req.body;
        
        const existingOffer = await Offer.findOne({ productId, offerType: 'product', isDeleted: false });
        if (existingOffer) {
            return res.status(400).json({ success: false, message: "Offer already exists for this product" });
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
        res.json({ success: true, message: "Product offer added successfully" });
    } catch (error) {
        console.error("Error adding product offer:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Add Category Offer
const addCategoryOffer = async (req, res) => {
    try {
        const errors = validateOfferData({ ...req.body, offerType: 'category' });
        if (errors) return res.status(400).json({ success: false, errors });

        const { offerName, categoryId, discountType, discountValue, minPurchaseAmount, maxDiscountAmount, startDate, endDate, isActive } = req.body;

        const existingOffer = await Offer.findOne({ categoryId, offerType: 'category', isDeleted: false });
        if (existingOffer) {
            return res.status(400).json({ success: false, message: "Offer already exists for this category" });
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
        res.json({ success: true, message: "Category offer added successfully" });
    } catch (error) {
        console.error("Error adding category offer:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Edit Offer
const editOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const errors = validateOfferData(req.body, true);
        if (errors) return res.status(400).json({ success: false, errors });

        const { offerName, offerType, productId, categoryId, discountType, discountValue, minPurchaseAmount, maxDiscountAmount, startDate, endDate, isActive } = req.body;

        const offer = await Offer.findById(id);
        if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });

        // Check if another offer exists for the new product/category if changed
        const query = { _id: { $ne: id }, offerType, isDeleted: false };
        if (offerType === 'product') query.productId = productId;
        else query.categoryId = categoryId;

        const conflict = await Offer.findOne(query);
        if (conflict) {
            return res.status(400).json({ success: false, message: `An offer already exists for this ${offerType}` });
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
        res.json({ success: true, message: "Offer updated successfully" });
    } catch (error) {
        console.error("Error editing offer:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Toggle Offer Status
const toggleOfferStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const offer = await Offer.findById(id);
        if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });

        offer.isActive = !offer.isActive;
        await offer.save();
        res.json({ success: true, message: "Offer status updated", isActive: offer.isActive });
    } catch (error) {
        console.error("Error toggling offer status:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Delete Offer
const deleteOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const offer = await Offer.findById(id);
        if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });

        offer.isDeleted = true;
        await offer.save();
        res.json({ success: true, message: "Offer deleted successfully" });
    } catch (error) {
        console.error("Error deleting offer:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Add Referral Offer
const addReferralOffer = async (req, res) => {
    try {
        const errors = validateOfferData({ ...req.body, offerType: 'referral' });
        if (errors) return res.status(400).json({ success: false, errors });

        const { offerName, discountValue, startDate, endDate, isActive } = req.body;

        const existingOffer = await Offer.findOne({ offerType: 'referral', isDeleted: false });
        if (existingOffer) {
            return res.status(400).json({ success: false, message: "Referral offer already exists. Please edit the existing one." });
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
        res.json({ success: true, message: "Referral offer added successfully" });
    } catch (error) {
        console.error("Error adding referral offer:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Add All Products Offer
const addAllOffer = async (req, res) => {
    try {
        const errors = validateOfferData({ ...req.body, offerType: 'all' });
        if (errors) return res.status(400).json({ success: false, errors });

        const { offerName, discountType, discountValue, minPurchaseAmount, maxDiscountAmount, startDate, endDate, isActive } = req.body;

        const existingOffer = await Offer.findOne({ offerType: 'all', isDeleted: false });
        if (existingOffer) {
            return res.status(400).json({ success: false, message: "A store-wide offer already exists." });
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
        res.json({ success: true, message: "Store-wide offer added successfully" });
    } catch (error) {
        console.error("Error adding store-wide offer:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

export {
    getOffers,
    addProductOffer,
    addCategoryOffer,
    addReferralOffer,
    addAllOffer,
    editOffer,
    toggleOfferStatus,
    deleteOffer
};
