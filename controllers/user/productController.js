import Wishlist from "../../models/wishlist.js";
import categorySchema from "../../models/category.js";
import Cart from "../../models/cart.js";
import {
    validateVariantForCart,
    getSidebarData,
    getFilteredProducts,
    getProductDetails,
    MAX_CART_QTY,
} from "../../services/userServices/productService.js";

const PRICE_MAX = 999999;
const PRICE_MIN = 0;

// ── Helper: parse array query params ─────────────────────────────────────────
const toArray = (value) =>
    value ? (Array.isArray(value) ? value : [value]) : [];

// ── Helper: build { variantId: qty } map from cart ───────────────────────────
const buildCartQuantityMap = async (userId) => {
    if (!userId) return {};
    try {
        const cart = await Cart.findOne({ User_id: userId }).lean();
        if (!cart?.Items?.length) return {};

        const map = {};
        cart.Items.forEach((item) => {
            const vid = item.Variant_id?.toString();
            if (vid) map[vid] = (map[vid] || 0) + (item.Quantity || 1);
        });
        return map;
    } catch (err) {
        console.error("buildCartQuantityMap error:", err);
        return {};
    }
};

// ── Helper: count total cart items for navbar badge ───────────────────────────
// FIX: single lean query — no need to populate just for a count
const getCartItemCount = async (userId) => {
    if (!userId) return 0;
    try {
        const cart = await Cart.findOne({ User_id: userId }).select("Items").lean();
        return cart?.Items?.length ?? 0;
    } catch {
        return 0;
    }
};

// ── Load Product Listing ──────────────────────────────────────────────────────
const loadProducts = async (req, res) => {
    try {
        // FIX: fetch only active, non-deleted categories — consistent with service layer
        const categories = await categorySchema
            .find({ IsDeleted: { $ne: true }, IsActive: { $ne: false } })
            .lean();

        const sidebarData = await getSidebarData(categories);


        const userId = req.session.user?._id || req.session.user?.id || null;

        const userAgent = req.headers['user-agent'] || '';
        let limit = 12; // Default for Desktop
        if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
            limit = 8;
        } else if (/mobile|iphone|ipod|android|blackberry|opera mini|windows phone/i.test(userAgent)) {
            limit = 6;
        }

        const filters = {
            page: Math.max(1, parseInt(req.query.page, 10) || 1),
            limit: limit,
            sortParam: req.query.sort || "",
            search: req.query.search || "",
            brandFilter: toArray(req.query.brand),
            ramFilter: toArray(req.query.ram),
            storageFilter: toArray(req.query.storage),
            colorFilter: toArray(req.query.color),
            minPrice: Math.max(parseInt(req.query.minPrice, 10) || PRICE_MIN, PRICE_MIN),
            maxPrice: Math.min(parseInt(req.query.maxPrice, 10) || PRICE_MAX, PRICE_MAX),
        };

        const { products, totalProducts, totalPages, currentPage } =
            await getFilteredProducts({ categories, filters });

        const [cartQuantityMap, cartItemCount, wishlist] = await Promise.all([
            buildCartQuantityMap(userId),
            getCartItemCount(userId),
            userId ? Wishlist.findOne({ User_id: userId }).select("Products").lean() : null,
        ]);

        const wishlistIds = wishlist ? wishlist.Products.map(id => id.toString()) : [];

        return res.render("user/products/productPage", {
            user: req.session.user || null,
            userId,
            categories,
            cartItemCount,
            products,
            totalProducts,
            totalPages,
            currentPage,
            wishlistIds,
            activeFilters: {
                brands: filters.brandFilter,
                rams: filters.ramFilter,
                storages: filters.storageFilter,
                colors: filters.colorFilter,
                minPrice: filters.minPrice,
                maxPrice: filters.maxPrice,
                sort: filters.sortParam,
                search: filters.search,
            },
            sidebarData,
            cartQuantityMap,
            MAX_CART_QTY,
        });
    } catch (error) {
        console.error("loadProducts error:", error);
        return res.status(500).send("Server error");
    }
};

// ── Load Product Detail ───────────────────────────────────────────────────────
const loadProductDetails = async (req, res) => {
    try {
        const categories = await categorySchema
            .find({ IsDeleted: { $ne: true }, IsActive: { $ne: false } })
            .lean();

        const result = await getProductDetails(req.params.id, req.query.variant);
        if (!result) return res.redirect("/products");

        const { variant, allVariants, relatedProducts } = result;

        const userId = req.session.user?._id || req.session.user?.id || null;

        const [cartQuantityMap, cartItemCount, wishlist] = await Promise.all([
            buildCartQuantityMap(userId),
            getCartItemCount(userId),
            userId ? Wishlist.findOne({ User_id: userId }).select("Products").lean() : null,
        ]);

        const isInWishlist = wishlist ? wishlist.Products.some(p => p.toString() === req.params.id) : false;

        return res.render("user/products/productDetails", {
            user: req.session.user || null,
            userId,
            categories,
            cartItemCount,
            variant,
            allVariants,
            relatedProducts,
            cartQuantityMap,
            isInWishlist,
            MAX_CART_QTY,
        });
    } catch (error) {
        console.error("loadProductDetails error:", error.message);
        return res.status(500).send("Server error");
    }
};

export { loadProducts, loadProductDetails };