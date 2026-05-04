import {
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
} from "../../services/adminServices/offerService.js";

// Load Offers List
const getOffers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const search = req.query.search || "";
        const type = req.query.type || "all";
        const status = req.query.status || "all";

        const { offers, totalOffersCount, totalPages } = await fetchOffers({ page, limit, search, type, status });

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({
                success: true,
                offers,
                totalOffers: totalOffersCount,
                totalPages,
                currentPage: page,
                search,
                typeFilter: type,
                statusFilter: status
            });
        }

        const { products, categories } = await fetchProductsAndCategories();

        res.render('admin/offer/offers', {
            admin: req.session.admin,
            offers,
            totalOffers: totalOffersCount,
            totalPages,
            currentPage: page,
            search,
            typeFilter: type,
            statusFilter: status,
            products,
            categories,
            activePage: 'offers'
        });
    } catch (error) {
        console.error("Error fetching offers:", error);
        res.status(500).send("Internal Server Error");
    }
};

// Add Product Offer
const addProductOffer = async (req, res) => {
    try {
        const errors = validateOfferData({ ...req.body, offerType: 'product' });
        if (errors) return res.status(400).json({ success: false, errors });

        const result = await createProductOffer(req.body);
        if (result.conflict) {
            return res.status(400).json({ success: false, message: result.message });
        }

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

        const result = await createCategoryOffer(req.body);
        if (result.conflict) {
            return res.status(400).json({ success: false, message: result.message });
        }

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

        const result = await updateOffer(id, req.body);
        if (result.notFound) return res.status(404).json({ success: false, message: "Offer not found" });
        if (result.conflict) return res.status(400).json({ success: false, message: result.message });

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

        const result = await flipOfferStatus(id);
        if (result.notFound) return res.status(404).json({ success: false, message: "Offer not found" });

        res.json({ success: true, message: "Offer status updated", isActive: result.isActive });
    } catch (error) {
        console.error("Error toggling offer status:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Delete Offer
const deleteOffer = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await softDeleteOffer(id);
        if (result.notFound) return res.status(404).json({ success: false, message: "Offer not found" });

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

        const result = await createReferralOffer(req.body);
        if (result.conflict) {
            return res.status(400).json({ success: false, message: result.message });
        }

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

        const result = await createAllOffer(req.body);
        if (result.conflict) {
            return res.status(400).json({ success: false, message: result.message });
        }

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