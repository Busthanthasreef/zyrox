// import productSchema from "../../models/product.js";
// import categorySchema from "../../models/category.js";
// import variantSchema from "../../models/variant.js";

// const PRICE_MIN = 0;
// const PRICE_MAX = 219999;
// const ITEMS_PER_PAGE = 8;
// export const MAX_CART_QTY = 3; // single source of truth


// export const validateVariantForCart = async (productId, variantId) => {
//     const variant = await variantSchema.findOne({
//         _id: variantId,
//         productId,
//         IsDeleted: { $ne: true }
//     }).populate("productId");

//     if (!variant || !variant.productId) {
//         return { error: "Product not found" };
//     }

//     if (variant.productId.status !== "active") {
//         return { error: "Product unavailable" };
//     }

//     if (variant.stock <= 0) {
//         return { error: "Out of stock" };
//     }

//     return { variant };
// };


// // ── Sidebar Data ──────────────────────────────────────────────────────────────

// export const getSidebarData = async (categories) => {
//     const brands = await Promise.all(
//         categories.map(async (c) => {
//             const count = await productSchema.countDocuments({
//                 categoryId: c._id,
//                 IsDeleted: { $ne: true },
//             });
//             return { name: c.categoryName, count };
//         })
//     );
//     brands.sort((a, b) => a.name.localeCompare(b.name));

//     const allVariants = await variantSchema.find({ IsDeleted: { $ne: true } }).lean();

//     const colors   = [...new Set(allVariants.map((v) => v.color).filter(Boolean))].sort();
//     const rams     = [...new Set(allVariants.map((v) => v.RAM).filter(Boolean))].sort((a, b) => a - b);
//     const storages = [...new Set(allVariants.map((v) => v.storage).filter(Boolean))].sort((a, b) => a - b);

//     return { brands, colors, rams, storages };
// };

// // ── Product Listing ───────────────────────────────────────────────────────────

// export const getFilteredProducts = async ({ categories, filters }) => {
//     const {
//         page = 1,
//         sortParam = "",
//         search = "",
//         brandFilter   = [],
//         ramFilter     = [],
//         storageFilter = [],
//         colorFilter   = [],
//         maxPrice = PRICE_MAX,
//     } = filters;

//     // Product query — no status filter here; we include all non-deleted products
//     // and expose status in the shape so the UI can show "unavailable" label
//     const productQuery = { IsDeleted: false };

//     if (search) {
//         productQuery.productName = { $regex: search, $options: "i" };
//     }

//     if (brandFilter.length > 0) {
//         const filteredCatIds = categories
//             .filter((c) => brandFilter.includes(c.categoryName))
//             .map((c) => c._id);
//         productQuery.categoryId = { $in: filteredCatIds };
//     }

//     const rawProducts = await productSchema.find(productQuery).lean();
//     const productIds  = rawProducts.map((p) => p._id);

//     // Variant query
//     const variantQuery = {
//         productId: { $in: productIds },
//         IsDeleted: { $ne: true },
//         price: { $lte: maxPrice },
//     };

//     if (ramFilter.length > 0)     variantQuery.RAM     = { $in: ramFilter.map((r) => parseInt(r)) };
//     if (storageFilter.length > 0) variantQuery.storage  = { $in: storageFilter.map((s) => parseInt(s)) };
//     if (colorFilter.length > 0)   variantQuery.color    = { $in: colorFilter };

//     const variants = await variantSchema.find(variantQuery).lean();

//     // Group variants by product
//     const variantsByProduct = {};
//     variants.forEach((v) => {
//         const pid = v.productId.toString();
//         if (!variantsByProduct[pid]) variantsByProduct[pid] = [];
//         variantsByProduct[pid].push(v);
//     });

//     // Shape products
//     let products = rawProducts
//         .filter((p) => variantsByProduct[p._id.toString()]?.length > 0)
//         .map((p) => {
//             const pid            = p._id.toString();
//             const pVariants      = variantsByProduct[pid];
//             const displayVariant = pVariants.find((v) => v.IsDefault) || pVariants[0];
//             const brandObj       = categories.find((c) => c._id.toString() === p.categoryId?.toString());

//             return {
//                 id:        pid,
//                 name:      p.productName,
//                 brand:     brandObj ? brandObj.categoryName : "Generic",
//                 image:     displayVariant.images?.length > 0 ? displayVariant.images[0] : "/images/placeholder.png",
//                 ram:       displayVariant.RAM,
//                 storage:   displayVariant.storage,
//                 price:     displayVariant.price,
//                 oldPrice:  displayVariant.oldPrice || null,
//                 stock:     displayVariant.stock,
//                 rating:    p.rating || 0,
//                 badge:     p.badge  || null,
//                 variantId: displayVariant._id.toString(),
//                 status:    p.status || "active", // ← exposed so EJS can show "unavailable" label
//             };
//         });

//     // Sort
//     if (sortParam === "price_asc")  products.sort((a, b) => a.price - b.price);
//     if (sortParam === "price_desc") products.sort((a, b) => b.price - a.price);
//     if (sortParam === "name_asc")   products.sort((a, b) => a.name.localeCompare(b.name));
//     if (sortParam === "name_desc")  products.sort((a, b) => b.name.localeCompare(a.name));

//     // Paginate
//     const totalProducts = products.length;
//     const totalPages    = Math.ceil(totalProducts / ITEMS_PER_PAGE);
//     const currentPage   = Math.min(page, totalPages || 1);
//     const paginatedProducts = products.slice(
//         (currentPage - 1) * ITEMS_PER_PAGE,
//         currentPage * ITEMS_PER_PAGE
//     );

//     return { products: paginatedProducts, totalProducts, totalPages, currentPage };
// };

// // ── Product Details ───────────────────────────────────────────────────────────

// export const getProductDetails = async (productId, variantIdReq) => {
//     let variantQuery = { productId, IsDeleted: { $ne: true } };

//     if (variantIdReq && variantIdReq !== "undefined" && variantIdReq !== "null") {
//         variantQuery = { _id: variantIdReq, IsDeleted: { $ne: true } };
//     }

//     const variant = await variantSchema
//         .findOne(variantQuery)
//         .populate({
//             path: "productId",
//             model: "Product",
//             populate: { path: "categoryId", model: "Categories" },
//         })
//         .lean();

//     if (
//         !variant ||
//         !variant.productId ||
//         variant.productId.IsDeleted ||
//         variant.productId.status !== "active"
//     ) {
//         return null;
//     }

//     const category = variant.productId.categoryId;
//     if (category && (!category.IsActive || category.IsDeleted)) {
//         return null;
//     }

//     const otherVariants = await variantSchema
//     .find({ 
//         productId, 
//         IsDeleted: { $ne: true },
//         IsActive: true   
//     })
//     .lean();

//     const relatedProductsRaw = await productSchema
//         .find({
//             categoryId: category._id,
//             _id:        { $ne: productId },
//             IsDeleted:  { $ne: true },
//         })
//         .limit(4)
//         .lean();

//     const relatedProducts = (
//         await Promise.all(
//             relatedProductsRaw.map(async (p) => {
//                 const v =
//                     (await variantSchema.findOne({ productId: p._id, IsDeleted: false, IsDefault: true })) ||
//                     (await variantSchema.findOne({ productId: p._id, IsDeleted: false }));
//                 if (!v) return null;
//                 return { ...p, displayVariant: v };
//             })
//         )
//     ).filter(Boolean);

//    return { variant, allVariants: otherVariants, relatedProducts };
// };

import productSchema from "../../models/product.js";
import categorySchema from "../../models/category.js";
import variantSchema  from "../../models/variant.js";

// ── Constants ──────────────────────────────────────────────────────────────────
const PRICE_MIN    = 0;
const PRICE_MAX    = 219999;
const ITEMS_PER_PAGE = 8;

export const MAX_CART_QTY = 4; // single source of truth — max units per variant per cart

// ── Variant Validation ────────────────────────────────────────────────────────

/**
 * Validates a variant is purchasable. Called server-side before every cart add.
 * Returns { variant } on success or { error: string } on failure.
 */
export const validateVariantForCart = async (productId, variantId) => {
    const variant = await variantSchema
        .findOne({
            _id:       variantId,
            productId,
            IsDeleted: { $ne: true },
        })
        .populate("productId");

    if (!variant || !variant.productId) {
        return { error: "Product not found." };
    }

    if (variant.productId.IsDeleted) {
        return { error: "Product no longer available." };
    }

    if (variant.productId.status !== "active") {
        return { error: "Product is currently unavailable." };
    }

    if (variant.stock <= 0) {
        return { error: "This variant is out of stock." };
    }

    return { variant };
};

// ── Sidebar Data ──────────────────────────────────────────────────────────────

export const getSidebarData = async (categories) => {
    const brands = await Promise.all(
        categories.map(async (c) => {
            const count = await productSchema.countDocuments({
                categoryId: c._id,
                IsDeleted:  { $ne: true },
            });
            return { name: c.categoryName, count };
        })
    );
    brands.sort((a, b) => a.name.localeCompare(b.name));

    const allVariants = await variantSchema.find({ IsDeleted: { $ne: true } }).lean();

    const colors   = [...new Set(allVariants.map((v) => v.color).filter(Boolean))].sort();
    const rams     = [...new Set(allVariants.map((v) => v.RAM).filter(Boolean))].sort((a, b) => a - b);
    const storages = [...new Set(allVariants.map((v) => v.storage).filter(Boolean))].sort((a, b) => a - b);

    return { brands, colors, rams, storages };
};

// ── Product Listing ───────────────────────────────────────────────────────────

export const getFilteredProducts = async ({ categories, filters }) => {
    const {
        page          = 1,
        sortParam     = "",
        search        = "",
        brandFilter   = [],
        ramFilter     = [],
        storageFilter = [],
        colorFilter   = [],
        maxPrice      = PRICE_MAX,
    } = filters;

    const productQuery = { IsDeleted: false };

    if (search) {
        productQuery.productName = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }

    if (brandFilter.length > 0) {
        const filteredCatIds = categories
            .filter((c) => brandFilter.includes(c.categoryName))
            .map((c) => c._id);
        productQuery.categoryId = { $in: filteredCatIds };
    }

    const rawProducts = await productSchema.find(productQuery).lean();
    const productIds  = rawProducts.map((p) => p._id);

    const variantQuery = {
        productId: { $in: productIds },
        IsDeleted: { $ne: true },
        price:     { $lte: maxPrice },
    };

    if (ramFilter.length > 0)     variantQuery.RAM     = { $in: ramFilter.map((r) => parseInt(r, 10)) };
    if (storageFilter.length > 0) variantQuery.storage = { $in: storageFilter.map((s) => parseInt(s, 10)) };
    if (colorFilter.length > 0)   variantQuery.color   = { $in: colorFilter };

    const variants = await variantSchema.find(variantQuery).lean();

    const variantsByProduct = {};
    variants.forEach((v) => {
        const pid = v.productId.toString();
        if (!variantsByProduct[pid]) variantsByProduct[pid] = [];
        variantsByProduct[pid].push(v);
    });

    let products = rawProducts
        .filter((p) => variantsByProduct[p._id.toString()]?.length > 0)
        .map((p) => {
            const pid            = p._id.toString();
            const pVariants      = variantsByProduct[pid];
            const displayVariant = pVariants.find((v) => v.IsDefault) || pVariants[0];
            const brandObj       = categories.find((c) => c._id.toString() === p.categoryId?.toString());

            return {
                id:        pid,
                name:      p.productName,
                brand:     brandObj ? brandObj.categoryName : "Generic",
                image:     displayVariant.images?.length > 0 ? displayVariant.images[0] : "/images/placeholder.png",
                ram:       displayVariant.RAM,
                storage:   displayVariant.storage,
                price:     displayVariant.price,
                oldPrice:  displayVariant.oldPrice || null,
                stock:     displayVariant.stock,
                rating:    p.rating || 0,
                badge:     p.badge  || null,
                variantId: displayVariant._id.toString(),
                status:    p.status || "active",
            };
        });

    if (sortParam === "price_asc")  products.sort((a, b) => a.price - b.price);
    if (sortParam === "price_desc") products.sort((a, b) => b.price - a.price);
    if (sortParam === "name_asc")   products.sort((a, b) => a.name.localeCompare(b.name));
    if (sortParam === "name_desc")  products.sort((a, b) => b.name.localeCompare(a.name));

    const totalProducts     = products.length;
    const totalPages        = Math.ceil(totalProducts / ITEMS_PER_PAGE);
    const currentPage       = Math.min(Math.max(parseInt(page, 10) || 1, 1), totalPages || 1);
    const paginatedProducts = products.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    return { products: paginatedProducts, totalProducts, totalPages, currentPage };
};

// ── Product Details ───────────────────────────────────────────────────────────

export const getProductDetails = async (productId, variantIdReq) => {
    // Sanitize inputs
    const safeProductId  = productId && /^[a-f\d]{24}$/i.test(productId) ? productId : null;
    const safeVariantId  = variantIdReq && /^[a-f\d]{24}$/i.test(variantIdReq) ? variantIdReq : null;

    if (!safeProductId) return null;

    let variantQuery = { productId: safeProductId, IsDeleted: { $ne: true } };

    if (safeVariantId) {
        variantQuery = { _id: safeVariantId, IsDeleted: { $ne: true } };
    }

    const variant = await variantSchema
        .findOne(variantQuery)
        .populate({
            path:     "productId",
            model:    "Product",
            populate: { path: "categoryId", model: "Categories" },
        })
        .lean();

    if (
        !variant ||
        !variant.productId ||
        variant.productId.IsDeleted ||
        variant.productId.status !== "active"
    ) {
        return null;
    }

    const category = variant.productId.categoryId;
    if (category && (!category.IsActive || category.IsDeleted)) {
        return null;
    }

    // All active, non-deleted variants for this product
    const allVariants = await variantSchema
        .find({
            productId: safeProductId,
            IsDeleted: { $ne: true },
        })
        .lean();

    // Related products in same category (excluding self)
    const relatedProductsRaw = await productSchema
        .find({
            categoryId: category._id,
            _id:        { $ne: safeProductId },
            IsDeleted:  { $ne: true },
            status:     "active",
        })
        .limit(4)
        .lean();

    const relatedProducts = (
        await Promise.all(
            relatedProductsRaw.map(async (p) => {
                const v =
                    (await variantSchema.findOne({ productId: p._id, IsDeleted: false, IsDefault: true }).lean()) ||
                    (await variantSchema.findOne({ productId: p._id, IsDeleted: false }).lean());
                if (!v) return null;
                return { ...p, displayVariant: v };
            })
        )
    ).filter(Boolean);

    return { variant, allVariants, relatedProducts };
};