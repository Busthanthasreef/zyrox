import VariantSchema from "../../models/variant.js";
import ProductSchema from "../../models/product.js";
import categorySchema from "../../models/category.js";

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────

export const IMAGE_MIN = 3;
export const IMAGE_MAX = 5;
export const VARIANT_PAGE_LIMIT = 5;

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/** Strips non-digit characters and returns a Number (or undefined). */
export const parseNum = (val) =>
    val !== undefined && val !== ""
        ? Number(String(val).replace(/[^\d]/g, ""))
        : undefined;

/** Capitalises the first letter of a string. */
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

/** Human-readable label for a variant configuration. */
const variantLabel = (color, RAM, storage) =>
    `Color: ${capitalize(color)}, RAM: ${RAM}GB, Storage: ${storage}GB`;

// ─────────────────────────────────────────────
//  READ
// ─────────────────────────────────────────────

/**
 * Fetches everything needed to render the variant listing page.
 *
 * @param {string} productId
 * @param {number} page
 * @returns {Promise<object>}
 */
export const getVariantListingData = async (productId, page = 1) => {
    const skip = (page - 1) * VARIANT_PAGE_LIMIT;

    const [product, totalVariants, activeVariants, inactiveVariants, categories] =
        await Promise.all([
            ProductSchema.findById(productId).populate("categoryId").lean(),
            VariantSchema.countDocuments({ productId, IsDeleted: false }),
            VariantSchema.countDocuments({ productId, IsActive: true,  IsDeleted: false }),
            VariantSchema.countDocuments({ productId, IsActive: false, IsDeleted: false }),
            categorySchema.find().lean(),
        ]);

    if (!product) return null;

    const [variants, defaultVariant] = await Promise.all([
        VariantSchema.find({ productId, IsDeleted: false })
            .sort({ IsDefault: -1, createdAt: -1 })
            .skip(skip)
            .limit(VARIANT_PAGE_LIMIT)
            .lean(),
        VariantSchema.findOne({ productId, IsDefault: true, IsDeleted: false }).lean(),
    ]);

    return {
        product,
        variants,
        defaultVariant,
        categories,
        totalVariants,
        activeVariants,
        inactiveVariants,
        totalPages:  Math.ceil(totalVariants / VARIANT_PAGE_LIMIT),
        currentPage: page,
        startItem:   skip + 1,
        endItem:     Math.min(skip + VARIANT_PAGE_LIMIT, totalVariants),
    };
};

// ─────────────────────────────────────────────
//  CREATE
// ─────────────────────────────────────────────

/**
 * Validates and creates a new variant.
 *
 * @returns {{ error: string }|{ variant: object }}
 */
export const createVariant = async (productId, fields, imageUrls) => {
    const product = await ProductSchema.findById(productId);
    if (!product) return { error: "Product not found" };

    // Normalise
    const color   = (fields.color || "").trim().toLowerCase();
    const storage = parseNum(fields.storage);
    const RAM     = parseNum(fields.RAM);

    // Image count guard
    if (imageUrls.length < IMAGE_MIN)
        return { error: `At least ${IMAGE_MIN} images are required for a variant` };
    if (imageUrls.length > IMAGE_MAX)
        return { error: `A maximum of ${IMAGE_MAX} images are allowed per variant` };

    // Duplicate configuration check
    const duplicate = await VariantSchema.findOne({
        productId, color, RAM, storage, IsDeleted: false,
    });
    if (duplicate)
        return { error: `A variant with this configuration (${variantLabel(color, RAM, storage)}) already exists.` };

    // SKU uniqueness check
    if (fields.SKU) {
        const skuTaken = await VariantSchema.findOne({ SKU: fields.SKU });
        if (skuTaken) return { error: "SKU already exists" };
    }

    // Default handling
    const existingCount  = await VariantSchema.countDocuments({ productId, IsDeleted: false });
    const shouldBeDefault =
        fields.isDefault === "on" || fields.isDefault === true || existingCount === 0;

    if (shouldBeDefault) {
        await VariantSchema.updateMany({ productId }, { IsDefault: false });
    }

    const variant = await new VariantSchema({
        productId,
        categoryId: product.categoryId,
        color,
        colorCode:  fields.colorCode || "#000000",
        storage,
        RAM,
        stock:     fields.stock ? Number(fields.stock) : 0,
        price:     fields.price ? Number(fields.price) : 0,
        SKU:       fields.SKU || "",
        IsActive:  fields.isActive === "on" || fields.isActive === true,
        IsDefault: shouldBeDefault,
        images:    imageUrls,
    }).save();

    return { variant };
};

// ─────────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────────

/**
 * Validates and updates an existing variant.
 *
 * @returns {{ error: string }|{ variant: object }}
 */
export const updateVariant = async (productId, variantId, fields, newImageUrls) => {
    const [product, variant] = await Promise.all([
        ProductSchema.findById(productId),
        VariantSchema.findById(variantId),
    ]);

    if (!product) return { error: "Product not found" };
    if (!variant) return { error: "Variant not found" };

    // Normalise — fall back to stored values if field is absent
    const color   = (fields.color || variant.color).trim().toLowerCase();
    const storage = parseNum(fields.storage) ?? variant.storage;
    const RAM     = parseNum(fields.RAM)     ?? variant.RAM;

    // Duplicate configuration check (exclude self)
    const duplicate = await VariantSchema.findOne({
        productId,
        _id:       { $ne: variantId },
        color,
        RAM,
        storage,
        IsDeleted: false,
    });
    if (duplicate)
        return { error: `Another variant with this configuration (${variantLabel(color, RAM, storage)}) already exists.` };

    // SKU uniqueness check (exclude self)
    if (fields.SKU) {
        const skuTaken = await VariantSchema.findOne({ SKU: fields.SKU, _id: { $ne: variantId } });
        if (skuTaken) return { error: "SKU already exists" };
    }

    // Image replacement guard
    if (newImageUrls.length > 0) {
        if (newImageUrls.length < IMAGE_MIN)
            return { error: `At least ${IMAGE_MIN} images are required when updating images.` };
        if (newImageUrls.length > IMAGE_MAX)
            return { error: `A maximum of ${IMAGE_MAX} images are allowed when updating images.` };
    }

    // Default handling
    const wantsDefault = fields.isDefault === "on" || fields.isDefault === true;
    if (wantsDefault) {
        await VariantSchema.updateMany(
            { productId, _id: { $ne: variantId } },
            { IsDefault: false }
        );
        variant.IsDefault = true;
    } else {
        const otherDefault = await VariantSchema.findOne({
            productId,
            _id:       { $ne: variantId },
            IsDefault: true,
            IsDeleted: false,
        });
        // Keep this one as default if no other default exists
        variant.IsDefault = !otherDefault;
    }

    // Apply updates
    variant.categoryId = product.categoryId;
    variant.color      = color;
    variant.colorCode  = fields.colorCode || variant.colorCode || "#000000";
    variant.storage    = storage;
    variant.RAM        = RAM;
    variant.stock      = fields.stock !== undefined ? Number(fields.stock) : variant.stock;
    variant.price      = fields.price !== undefined ? Number(fields.price) : variant.price;
    variant.SKU        = fields.SKU || variant.SKU;
    variant.IsActive   = fields.isActive === "on" || fields.isActive === true;
    variant.images     = newImageUrls.length > 0 ? newImageUrls : variant.images;

    await variant.save();
    return { variant };
};

// ─────────────────────────────────────────────
//  TOGGLE ACTIVE
// ─────────────────────────────────────────────

/**
 * Flips the IsActive flag on a variant.
 *
 * @returns {Promise<boolean>} true if the update succeeded
 */
export const toggleVariantActive = async (variantId, isActive) => {
    const result = await VariantSchema.findByIdAndUpdate(variantId, {
        IsActive: isActive === true || isActive === "true",
    });
    return Boolean(result);
};

// ─────────────────────────────────────────────
//  SET DEFAULT
// ─────────────────────────────────────────────

/**
 * Promotes a variant to the product default.
 *
 * @returns {{ error: string }|{ success: true }}
 */
export const setVariantAsDefault = async (variantId) => {
    const variant = await VariantSchema.findById(variantId);
    if (!variant) return { error: "Variant not found" };

    await VariantSchema.updateMany({ productId: variant.productId }, { IsDefault: false });
    variant.IsDefault = true;
    await variant.save();

    return { success: true };
};

// ─────────────────────────────────────────────
//  SOFT DELETE
// ─────────────────────────────────────────────

/**
 * Soft-deletes a variant.
 * If it was the default, promotes the next available variant.
 *
 * @returns {{ error: string }|{ success: true }}
 */
export const softDeleteVariant = async (productId, variantId) => {
    const variant = await VariantSchema.findById(variantId);
    if (!variant) return { error: "Variant not found" };

    if (variant.IsDefault) {
        const nextAvailable = await VariantSchema.findOne({
            productId,
            IsDeleted: false,
            _id: { $ne: variantId },
        });

        if (!nextAvailable)
            return { error: "Can't delete the default variant as it's the only one left." };

        await VariantSchema.findByIdAndUpdate(nextAvailable._id, { IsDefault: true });
    }

    await VariantSchema.findByIdAndUpdate(variantId, {
        IsDeleted: true,
        IsDefault: false,
        IsActive:  false,
        SKU:       `${variant.SKU}-DEL-${Date.now()}`,
    });

    return { success: true };
};