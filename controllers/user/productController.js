// import categorySchema from "../../models/category.js";
// import Cart from "../../models/cart.js";
// import {
//     validateVariantForCart,
//     getSidebarData,
//     getFilteredProducts,
//     getProductDetails,
//     MAX_CART_QTY,
// } from "../../services/userServices/productService.js";

// const PRICE_MAX = 219999;

// // ── Helper: parse array query params ─────────────────────────────────────────

// const toArray = (value) =>
//     value ? (Array.isArray(value) ? value : [value]) : [];

// // ── Helper: read cart from DB → { variantId: quantity } ──────────────────────

// const buildCartQuantityMap = async (userId) => {
//     if (!userId) return {};
//     try {
//         const cart = await Cart.findOne({ User_id: userId }).lean();
//         if (!cart || !cart.Items || cart.Items.length === 0) return {};

//         const map = {};
//         cart.Items.forEach((item) => {
//             const vid = item.Variant_id?.toString();
//             if (vid) {
//                 map[vid] = (map[vid] || 0) + (item.Quantity || 1);
//             }
//         });
//         return map;
//     } catch (err) {
//         console.error("buildCartQuantityMap error:", err);
//         return {};
//     }
// };

// // ── Load Product Listing ──────────────────────────────────────────────────────

// const loadProducts = async (req, res) => {
//     try {
//         const categories  = await categorySchema.find({ IsDeleted: { $ne: true } });
//         const sidebarData = await getSidebarData(categories);

//          const currentUser = req.session.user?._id || null;
        
//             let totalItems = 0; // default value
        
//             if (currentUser) {
//               const cart = await Cart
//                 .findOne({ User_id: currentUser })
//                 .populate("Items.Product_id")
//                 .populate("Items.Variant_id");
        
//               // check if cart exists
//               if (cart && cart.Items) {
//                 totalItems = cart.Items.length;
//               }
//             }
        

//         const filters = {
//             page:          parseInt(req.query.page) || 1,
//             sortParam:     req.query.sort     || "",
//             search:        req.query.search   || "",
//             brandFilter:   toArray(req.query.brand),
//             ramFilter:     toArray(req.query.ram),
//             storageFilter: toArray(req.query.storage),
//             colorFilter:   toArray(req.query.color),
//             maxPrice:      parseInt(req.query.maxPrice) || PRICE_MAX,
//         };

//         const { products, totalProducts, totalPages, currentPage } =
//             await getFilteredProducts({ categories, filters });

//         const userId         = req.session.user?._id || req.session.user?.id;
//         const cartQuantityMap = await buildCartQuantityMap(userId);

//         res.render("user/products/productPage", {
//             user:          req.session.user,
//             categories,
//             cartItemCount : totalItems,
//             products,
//             totalProducts,
//             totalPages,
//             currentPage,
//             activeFilters: {
//                 brands:   filters.brandFilter,
//                 rams:     filters.ramFilter,
//                 storages: filters.storageFilter,
//                 colors:   filters.colorFilter,
//                 maxPrice: filters.maxPrice,
//                 sort:     filters.sortParam,
//                 search:   filters.search,
//             },
//             sidebarData,
//             cartQuantityMap,
//         });
//     } catch (error) {
//         console.error("loadProducts error:", error);
//         res.status(500).send("Server error");
//     }
// };

// // ── Load Product Detail ───────────────────────────────────────────────────────

// const loadProductDetails = async (req, res) => {
//     try {
//         const categories = await categorySchema.find({ IsActive: true, IsDeleted: { $ne: true } });
//         const result     = await getProductDetails(req.params.id, req.query.variant);

//         if (!result) return res.redirect("/products");

//         const { variant, allVariants, relatedProducts } = result;

//         const userId          = req.session.user?._id || req.session.user?.id;
//         const cartQuantityMap = await buildCartQuantityMap(userId);

//         res.render("user/products/productDetails", {
//             user:          req.session.user,
//             categories,
//             cartItemCount: req.session.cartItemCount,
//             variant,
//             allVariants,
//             relatedProducts,
//             cartQuantityMap,
//         });
//     } catch (error) {
//         console.error("loadProductDetails error:", error.message);
//         res.status(500).send("Server error");
//     }
// };

// // ── Add to Cart ───────────────────────────────────────────────────────────────

// const addToCart = async (req, res) => {
//     try {
//         const userId = req.session.user?._id || req.session.user?.id;

//         if (!userId) {
//             return res.json({
//                 success: false,
//                 requiresAuth: true,
//                 redirect: "/signin"
//             });
//         }

//         const { productId, variantId, quantity = 1 } = req.body;

//         // ✅ Basic validation
//         if (!productId || !variantId) {
//             return res.json({
//                 success: false,
//                 message: "Invalid product or variant."
//             });
//         }

//         const requestedQty = Math.max(1, parseInt(quantity) || 1);

//         // ✅ 🔥 IMPORTANT: Validate from DB (NEW)
//         const { variant, error } = await validateVariantForCart(productId, variantId);

//         if (error) {
//             return res.json({
//                 success: false,
//                 message: error
//             });
//         }

//         let cart = await Cart.findOne({ User_id: userId });

//         if (!cart) {
//             cart = new Cart({ User_id: userId, Items: [] });
//         }

//         const existingIndex = cart.Items.findIndex(
//             (item) => item.Variant_id.toString() === variantId.toString()
//         );

//         const existingQty = existingIndex >= 0
//             ? cart.Items[existingIndex].Quantity
//             : 0;

//         // ✅ Max cart limit check
//         if (existingQty >= MAX_CART_QTY) {
//             return res.json({
//                 success: false,
//                 limitReached: true,
//                 currentQty: existingQty,
//                 message: `You can only add up to ${MAX_CART_QTY} units of this product.`,
//             });
//         }

//         // ✅ Stock validation (NEW)
//         if (existingQty + requestedQty > variant.stock) {
//             return res.json({
//                 success: false,
//                 message: `Only ${variant.stock} items available in stock`
//             });
//         }

//         const allowedQty = Math.min(
//             requestedQty,
//             MAX_CART_QTY - existingQty,
//             variant.stock - existingQty
//         );

//         if (existingIndex >= 0) {
//             cart.Items[existingIndex].Quantity += allowedQty;
//         } else {
//             cart.Items.push({
//                 Product_id: productId,
//                 Variant_id: variantId,
//                 Quantity: allowedQty,
//                 Price: variant.price // ✅ FIXED (NO FRONTEND PRICE)
//             });
//         }

//         await cart.save();

//         const cartCount = cart.Items.reduce(
//             (sum, item) => sum + item.Quantity,
//             0
//         );

//         req.session.cartItemCount = cartCount;

//         const newQty = existingQty + allowedQty;

//         return res.json({
//             success: true,
//             cartCount,
//             newQty,
//             limitReached: newQty >= MAX_CART_QTY,
//         });

//     } catch (error) {
//         console.error("addToCart error:", error);

//         return res.status(500).json({
//             success: false,
//             message: "Server error."
//         });
//     }
// };

// export { loadProducts, loadProductDetails, addToCart };

import categorySchema from "../../models/category.js";
import Cart from "../../models/cart.js";
import {
    validateVariantForCart,
    getSidebarData,
    getFilteredProducts,
    getProductDetails,
    MAX_CART_QTY,
} from "../../services/userServices/productService.js";

const PRICE_MAX = 219999;

// ── Helper: parse array query params ─────────────────────────────────────────

const toArray = (value) =>
    value ? (Array.isArray(value) ? value : [value]) : [];

// ── Helper: read cart from DB → { variantId: quantity } ──────────────────────

const buildCartQuantityMap = async (userId) => {
    if (!userId) return {};
    try {
        const cart = await Cart.findOne({ User_id: userId }).lean();
        if (!cart || !cart.Items || cart.Items.length === 0) return {};

        const map = {};
        cart.Items.forEach((item) => {
            const vid = item.Variant_id?.toString();
            if (vid) {
                map[vid] = (map[vid] || 0) + (item.Quantity || 1);
            }
        });
        return map;
    } catch (err) {
        console.error("buildCartQuantityMap error:", err);
        return {};
    }
};

// ── Helper: safe cart item count ──────────────────────────────────────────────

const getCartItemCount = async (userId) => {
    if (!userId) return 0;
    try {
        const cart = await Cart.findOne({ User_id: userId }).lean();
        if (!cart || !cart.Items) return 0;
        return cart.Items.reduce((sum, item) => sum + (item.Quantity || 1), 0);
    } catch {
        return 0;
    }
};

// ── Load Product Listing ──────────────────────────────────────────────────────

const loadProducts = async (req, res) => {
    try {
        const categories  = await categorySchema.find({ IsDeleted: { $ne: true } });
        const sidebarData = await getSidebarData(categories);

        const userId       = req.session.user?._id || req.session.user?.id;
        const cartItemCount = await getCartItemCount(userId);

        const filters = {
            page:          Math.max(1, parseInt(req.query.page, 10) || 1),
            sortParam:     req.query.sort    || "",
            search:        req.query.search  || "",
            brandFilter:   toArray(req.query.brand),
            ramFilter:     toArray(req.query.ram),
            storageFilter: toArray(req.query.storage),
            colorFilter:   toArray(req.query.color),
            maxPrice:      Math.min(parseInt(req.query.maxPrice, 10) || PRICE_MAX, PRICE_MAX),
        };

        const { products, totalProducts, totalPages, currentPage } =
            await getFilteredProducts({ categories, filters });

        const cartQuantityMap = await buildCartQuantityMap(userId);

        return res.render("user/products/productPage", {
            user:          req.session.user,
            categories,
            cartItemCount,
            products,
            totalProducts,
            totalPages,
            currentPage,
            activeFilters: {
                brands:   filters.brandFilter,
                rams:     filters.ramFilter,
                storages: filters.storageFilter,
                colors:   filters.colorFilter,
                maxPrice: filters.maxPrice,
                sort:     filters.sortParam,
                search:   filters.search,
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
        const categories = await categorySchema.find({
            IsActive:  true,
            IsDeleted: { $ne: true },
        });

        const result = await getProductDetails(req.params.id, req.query.variant);
        if (!result) return res.redirect("/products");

        const { variant, allVariants, relatedProducts } = result;

        const userId          = req.session.user?._id || req.session.user?.id;
        const cartQuantityMap = await buildCartQuantityMap(userId);
        const cartItemCount   = await getCartItemCount(userId);

        return res.render("user/products/productDetails", {
            user:          req.session.user,
            categories,
            cartItemCount,
            variant,
            allVariants,
            relatedProducts,
            cartQuantityMap,
            MAX_CART_QTY,
        });
    } catch (error) {
        console.error("loadProductDetails error:", error.message);
        return res.status(500).send("Server error");
    }
};

// ── Add to Cart ───────────────────────────────────────────────────────────────

const addToCart = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;

        if (!userId) {
            return res.status(401).json({
                success:      false,
                requiresAuth: true,
                redirect:     "/signin",
            });
        }

        const { productId, variantId } = req.body;
        const requestedQty = Math.max(1, Math.min(parseInt(req.body.quantity, 10) || 1, MAX_CART_QTY));

        // Input validation — must be valid MongoDB ObjectIDs
        if (
            !productId || !/^[a-f\d]{24}$/i.test(productId) ||
            !variantId || !/^[a-f\d]{24}$/i.test(variantId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid product or variant ID.",
            });
        }

        // Validate variant from DB (product active, variant exists, stock > 0)
        const { variant, error } = await validateVariantForCart(productId, variantId);
        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        let cart = await Cart.findOne({ User_id: userId });
        if (!cart) {
            cart = new Cart({ User_id: userId, Items: [] });
        }

        const existingIndex = cart.Items.findIndex(
            (item) => item.Variant_id.toString() === variantId
        );
        const existingQty = existingIndex >= 0 ? cart.Items[existingIndex].Quantity : 0;

        // Hard cap: already at MAX
        if (existingQty >= MAX_CART_QTY) {
            return res.json({
                success:      false,
                limitReached: true,
                currentQty:   existingQty,
                message:      `You can only add up to ${MAX_CART_QTY} units of this product.`,
            });
        }

        // How many can still be added
        const canAdd   = MAX_CART_QTY - existingQty;           // respect cart cap
        const stockCap = variant.stock - existingQty;          // respect live stock
        const allowedQty = Math.min(requestedQty, canAdd, stockCap);

        if (allowedQty <= 0) {
            return res.json({
                success:      false,
                limitReached: stockCap <= 0,
                message:      stockCap <= 0
                    ? `Only ${variant.stock} items in stock.`
                    : `You can only add up to ${MAX_CART_QTY} units of this product.`,
            });
        }

        if (existingIndex >= 0) {
            cart.Items[existingIndex].Quantity += allowedQty;
        } else {
            cart.Items.push({
                Product_id: productId,
                Variant_id: variantId,
                Quantity:   allowedQty,
                Price:      variant.price, // ✅ price set server-side, never trusted from client
            });
        }

        await cart.save();

        const newQty    = existingQty + allowedQty;
        const cartCount = cart.Items.reduce((sum, item) => sum + (item.Quantity || 0), 0);

        // Keep session in sync
        req.session.cartItemCount = cartCount;

        return res.json({
            success:      true,
            cartCount,
            newQty,
            limitReached: newQty >= MAX_CART_QTY,
            canAddMore:   MAX_CART_QTY - newQty, // how many more the user can add
        });
    } catch (error) {
        console.error("addToCart error:", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

export { loadProducts, loadProductDetails, addToCart };