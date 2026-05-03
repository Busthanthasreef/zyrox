import productSchema from "../../models/product.js";
import categorySchema from "../../models/category.js";
import variantSchema from "../../models/variant.js";
import { calculateBestOffer, applyOffer } from "../../utils/offerHelper.js";
import Offer from "../../models/offer.js";

// ── Constants ──────────────────────────────────────────────────────────────────
const PRICE_MIN = 0;
const PRICE_MAX = 999999;
const ITEMS_PER_PAGE = 8;

export const MAX_CART_QTY = 3;

// ── Variant Validation ────────────────────────────────────────────────────────
export const validateVariantForCart = async (productId, variantId) => {
    const variant = await variantSchema
        .findOne({ _id: variantId, productId, IsDeleted: { $ne: true } })
        .populate("productId");

    if (!variant || !variant.productId) return { error: "Product not found." };
    if (variant.productId.IsDeleted) return { error: "Product no longer available." };
    if (variant.productId.status !== "active") return { error: "Product is currently unavailable." };
    
    // Check Category Status
    const category = await categorySchema.findById(variant.productId.categoryId);
    if (!category || category.IsDeleted || category.IsActive === false) {
        return { error: "Category is currently unavailable." };
    }

    if (variant.IsActive === false) return { error: "This variant is currently unavailable." };
    if (variant.stock <= 0) return { error: "This variant is out of stock." };

    return { variant };
};


export const getSidebarData = async (categories) => {
    // Only include active, non-deleted categories
    const activeCategories = categories.filter(
        (c) => !c.IsDeleted && c.IsActive !== false
    );

    // Count active products per category using correct field: categoryId
    const brands = await Promise.all(
        activeCategories.map(async (c) => {
            const count = await productSchema.countDocuments({
                categoryId: c._id,          // ✅ FIXED: was `category` — wrong field name
                IsDeleted: { $ne: true },
                status: "active",
            });
            return { name: c.categoryName, count };
        })
    );
    brands.sort((a, b) => a.name.localeCompare(b.name));

    // Get all active product IDs for variant lookups
    const activeProductIds = await productSchema
        .find({ IsDeleted: { $ne: true }, status: "active" })
        .distinct("_id");

    // Get all active, non-deleted variants for those products
    const allVariants = await variantSchema
        .find({
            productId: { $in: activeProductIds },
            IsDeleted: { $ne: true },
            IsActive: { $ne: false },
        })
        .select("color RAM storage")
        .lean();

    const colors = [...new Set(allVariants.map((v) => v.color).filter(Boolean))].sort();
    const rams = [...new Set(allVariants.map((v) => v.RAM).filter(Boolean))].sort((a, b) => a - b);
    const storages = [...new Set(allVariants.map((v) => v.storage).filter(Boolean))].sort((a, b) => a - b);

    return { brands, colors, rams, storages };
};

// ── Product Listing ───────────────────────────────────────────────────────────
export const getFilteredProducts = async ({ categories, filters }) => {
    const {
        page = 1,
        sortParam = "",
        search = "",
        brandFilter = [],
        ramFilter = [],
        storageFilter = [],
        colorFilter = [],
        minPrice = PRICE_MIN,
        maxPrice = PRICE_MAX,
    } = filters;

    // Only active, non-deleted categories
    const activeCatIds = categories
        .filter((c) => !c.IsDeleted && c.IsActive !== false)
        .map((c) => c._id);

    // Base product query
    const productQuery = {
        IsDeleted: { $ne: true },
        status: "active",
    };

    if (activeCatIds.length > 0) {
        productQuery.categoryId = { $in: activeCatIds };
    }

    // Search filter
    if (search) {
        productQuery.productName = {
            $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            $options: "i",
        };
    }

    // Brand/category filter — narrow categoryId if brands selected
    if (brandFilter.length > 0) {
        const filteredCatIds = categories
            .filter((c) => brandFilter.includes(c.categoryName) && !c.IsDeleted && c.IsActive !== false)
            .map((c) => c._id);
        productQuery.categoryId = { $in: filteredCatIds };
    }

    const rawProducts = await productSchema.find(productQuery).sort({ createdAt: -1 }).lean();
    const productIds = rawProducts.map((p) => p._id);

    // Variant query with price + attribute filters
    const variantQuery = {
        productId: { $in: productIds },
        IsDeleted: { $ne: true },
        IsActive: { $ne: false },
        price: { $gte: minPrice, $lte: maxPrice },
    };

    if (ramFilter.length > 0) variantQuery.RAM = { $in: ramFilter.map((r) => parseInt(r, 10)) };
    if (storageFilter.length > 0) variantQuery.storage = { $in: storageFilter.map((s) => parseInt(s, 10)) };
    if (colorFilter.length > 0) variantQuery.color = { $in: colorFilter };

    const variants = await variantSchema.find(variantQuery).lean();

    // Group variants by product
    const variantsByProduct = {};
    variants.forEach((v) => {
        const pid = v.productId.toString();
        if (!variantsByProduct[pid]) variantsByProduct[pid] = [];
        variantsByProduct[pid].push(v);
    });

    // Build display list — one card per product
    let products = await Promise.all(rawProducts
        .filter((p) => variantsByProduct[p._id.toString()]?.length > 0)
        .map(async (p) => {
            const pid = p._id.toString();
            const pVariants = variantsByProduct[pid];
            const displayVariant = pVariants.find((v) => v.IsDefault) || pVariants[0];
            const brandObj = categories.find((c) => c._id.toString() === p.categoryId?.toString());

            // Calculate Offer
            const bestOffer = await calculateBestOffer(p._id, p.categoryId, displayVariant.price);
            const discountedPrice = applyOffer(displayVariant.price, bestOffer);

            return {
                id: pid,
                name: p.productName,
                brand: brandObj ? brandObj.categoryName : "Generic",
                image: displayVariant.images?.length > 0 ? displayVariant.images[0] : "/images/placeholder.png",
                ram: displayVariant.RAM,
                storage: displayVariant.storage,
                color: displayVariant.color,
                price: discountedPrice, // Show the discounted price
                originalPrice: displayVariant.price, // Keep original
                hasOffer: !!bestOffer,
                offerDiscount: bestOffer ? bestOffer.discountValue : 0,
                offerType: bestOffer ? bestOffer.discountType : null,
                stock: displayVariant.stock,
                rating: p.rating || 0,
                badge: p.badge || null,
                variantId: displayVariant._id.toString(),
                status: p.status || "active",
            };
        }));

    // Sort
    if (sortParam === "price_asc") products.sort((a, b) => a.price - b.price);
    if (sortParam === "price_desc") products.sort((a, b) => b.price - a.price);
    if (sortParam === "name_asc") products.sort((a, b) => a.name.localeCompare(b.name));
    if (sortParam === "name_desc") products.sort((a, b) => b.name.localeCompare(a.name));

    // Paginate
    const limit = filters.limit || 8;
    const totalProducts = products.length;
    const totalPages = Math.ceil(totalProducts / limit) || 1;
    const currentPage = Math.min(Math.max(parseInt(page, 10) || 1, 1), totalPages);
    const paginatedProducts = products.slice(
        (currentPage - 1) * limit,
        currentPage * limit
    );

    return { products: paginatedProducts, totalProducts, totalPages, currentPage };
};

// ── Product Details ───────────────────────────────────────────────────────────
export const getProductDetails = async (productId, variantIdReq) => {
    const safeProductId = productId && /^[a-f\d]{24}$/i.test(productId) ? productId : null;
    const safeVariantId = variantIdReq && /^[a-f\d]{24}$/i.test(variantIdReq) ? variantIdReq : null;

    if (!safeProductId) return null;

    let variantQuery = { productId: safeProductId, IsDeleted: { $ne: true } };
    if (safeVariantId) variantQuery = { _id: safeVariantId, IsDeleted: { $ne: true } };

    const variant = await variantSchema
        .findOne(variantQuery)
        .populate({
            path: "productId",
            model: "Product",
            populate: { path: "categoryId", model: "Categories" },
        })
        .lean();

    if (
        !variant ||
        !variant.productId ||
        variant.productId.IsDeleted ||
        variant.productId.status !== "active"
    ) return null;

    const category = variant.productId.categoryId;
    if (category && (!category.IsActive || category.IsDeleted)) return null;

    const allVariants = await variantSchema
        .find({ productId: safeProductId, IsDeleted: { $ne: true } })
        .lean();

    // Calculate Offer for the main variant
    const bestOffer = await calculateBestOffer(variant.productId._id, variant.productId.categoryId._id, variant.price);
    variant.discountedPrice = applyOffer(variant.price, bestOffer);
    variant.bestOffer = bestOffer;

    const relatedProductsRaw = await productSchema
        .find({
            categoryId: category._id,
            _id: { $ne: safeProductId },
            IsDeleted: { $ne: true },
            status: "active",
        })
        .limit(4)
        .lean();

    const relatedProducts = (
        await Promise.all(
            relatedProductsRaw.map(async (p) => {
                const v =
                    (await variantSchema.findOne({ productId: p._id, IsDeleted: { $ne: true }, IsDefault: true }).lean()) ||
                    (await variantSchema.findOne({ productId: p._id, IsDeleted: { $ne: true } }).lean());
                if (!v) return null;

                const pOffer = await calculateBestOffer(p._id, p.categoryId, v.price);
                v.discountedPrice = applyOffer(v.price, pOffer);
                v.bestOffer = pOffer;

                return { ...p, displayVariant: v };
            })
        )
    ).filter(Boolean);

    return { variant, allVariants, relatedProducts };
};