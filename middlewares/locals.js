import Wishlist from "../models/wishlist.js";
import Cart from "../models/cart.js";
import Categories from "../models/category.js";

/**
 * Global middleware that injects wishlistCount and cartItemCount
 * into res.locals so every view (via the navbar partial) can access them
 * without each controller needing to pass them explicitly.
 */
const attachLocalCounts = async (req, res, next) => {
    // ── FLASH MESSAGES / SESSION ALERTS ──────────────────────────
    res.locals.successMessage = req.session.successMessage || null;
    res.locals.errorMessage   = req.session.errorMessage || null;
    res.locals.infoMessage    = req.session.infoMessage || null;

    delete req.session.successMessage;
    delete req.session.errorMessage;
    delete req.session.infoMessage;
    // ──────────────────────────────────────────────────────────────

    const userId = req.session?.user?._id;

    if (!userId) {
        res.locals.wishlistCount = 0;
        if (res.locals.cartItemCount === undefined) {
            res.locals.cartItemCount = 0;
        }
        try {
            const categories = await Categories.find({ IsActive: true, IsDeleted: false }).select("categoryName").lean();
            res.locals.categories = categories || [];
        } catch {
            res.locals.categories = [];
        }

        // Add current brand filters for navbar
        const brandQuery = req.query.brand;
        res.locals.curBrands = brandQuery ? (Array.isArray(brandQuery) ? brandQuery : [brandQuery]) : [];

        return next();
    }

    try {
        const [wishlist, cart, categories] = await Promise.all([
            Wishlist.findOne({ User_id: userId }).select("Products").lean(),
            Cart.findOne({ User_id: userId }).select("Items").lean(),
            Categories.find({ IsActive: true, IsDeleted: false }).select("categoryName").lean()
        ]);

        res.locals.wishlistCount = wishlist?.Products?.length ?? 0;
        res.locals.categories = categories || [];

        // Add current brand filters for navbar
        const brandQuery = req.query.brand;
        res.locals.curBrands = brandQuery ? (Array.isArray(brandQuery) ? brandQuery : [brandQuery]) : [];

        if (res.locals.cartItemCount === undefined) {
            res.locals.cartItemCount = cart?.Items?.length ?? 0;
        }
    } catch {
        res.locals.wishlistCount = 0;
        res.locals.categories = [];
        res.locals.curBrands = [];
        if (res.locals.cartItemCount === undefined) {
            res.locals.cartItemCount = 0;
        }
    }

    next();
};

export default attachLocalCounts;
