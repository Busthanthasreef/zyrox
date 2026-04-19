import Product from "../../models/product.js";
import Category from "../../models/category.js";
import Variant from "../../models/variant.js";

const parseSpec = (val) => parseInt(String(val).replace(/[^\d]/g, ""), 10);


/* ================= LOAD PRODUCTS ================= */

const getProducts = async ({ search, statusFilter, categoryFilter, page, limit }) => {

    const skip = (page - 1) * limit;

    const filter = { IsDeleted: false };

    if (search) filter.productName = { $regex: search, $options: "i" };
    if (statusFilter) filter.status = statusFilter;
    if (categoryFilter) filter.categoryId = categoryFilter;

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Product.find(filter)
        .populate("categoryId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const productIds = products.map(p => p._id);

    const allVariants = await Variant.find({
        productId: { $in: productIds },
        IsDeleted: { $ne: true }
    }).lean();

    const variantsByProduct = {};

    allVariants.forEach(v => {
        const key = v.productId.toString();
        if (!variantsByProduct[key]) variantsByProduct[key] = [];
        variantsByProduct[key].push(v);
    });

    const categories = await Category.find({ IsDeleted: false }).lean();

    return {
        products,
        variantsByProduct,
        categories,
        totalProducts,
        totalPages
    };
};


/* ================= ADD PRODUCT ================= */

const createProduct = async (data, files) => {

    const { productName, description, category, status } = data;

    if (!productName || !description || !category) {
        throw new Error("Product name, description, and category are required");
    }

    // Robust extraction of variants (handles both nested and flat body structures)
    let variants = data.variants;
    if (!variants || typeof variants !== 'object') {
        variants = {};
        for (const key in data) {
            if (key.startsWith('variants[')) {
                const match = key.match(/variants\[(\d+)\]\[(\w+)\]/);
                if (match) {
                    const [_, index, field] = match;
                    if (!variants[index]) variants[index] = {};
                    variants[index][field] = data[key];
                }
            }
        }
    }

    const v0 = Array.isArray(variants) ? variants[0] : (variants?.["0"] ?? variants);

    if (!v0 || (!v0.color && !v0.price)) {
        throw new Error("Default variant details (color, price, etc.) are missing or incomplete");
    }

    const existed = await Product.findOne({
        productName: { $regex: `^${productName.trim()}$`, $options: "i" },
        IsDeleted: false,
    });

    if (existed) {
        throw new Error("A product with this name already exists");
    }

    // Extract images correctly from files array
    const variantImages = (files || [])
        .filter(f => f.fieldname === 'variantImages' || f.fieldname === 'variantImages[]' || f.fieldname.startsWith('variantImages'))
        .map(f => f.path);

    if (variantImages.length < 3) {
        throw new Error("At least 3 product images are required for the default variant");
    }

    if (variantImages.length > 5) {
        throw new Error("A maximum of 5 images are allowed per variant");
    }

    const newProduct = await Product.create({
        productName: productName.trim(),
        description: description.trim(),
        categoryId: category,
        status: status || "active",
    });

    try {
        await Variant.create({
            productId: newProduct._id,
            categoryId: category, // Added for convenience
            color: (v0.color || "Default").trim(),
            colorCode: v0.colorHex || "#000000",
            RAM: parseSpec(v0.ram || 0),
            storage: parseSpec(v0.storage || 0),
            price: Number(v0.price || 0),
            stock: Number(v0.stock || 0),
            SKU: v0.sku?.trim() || `SKU-${Date.now()}`,
            IsActive: v0.isActive === "true" || v0.isActive === true,
            IsDefault: true,
            images: variantImages,
        });
    } catch (variantErr) {
        // Rollback product creation if variant fails
        await Product.findByIdAndDelete(newProduct._id);
        throw variantErr;
    }

    return newProduct;
};


/* ================= GET PRODUCT BY ID ================= */

const getProductById = async (id) => {

    const product = await Product.findById(id).populate("categoryId").lean();

    const variants = await Variant.find({
        productId: id,
        IsDeleted: false
    }).lean();

    const categories = await Category.find({ IsDeleted: false }).lean();

    const defaultVariant = variants.find(v => v.IsDefault) || variants[0];

    return {
        product,
        variants,
        defaultVariant,
        categories
    };
};


/* ================= UPDATE PRODUCT ================= */

const updateProduct = async (id, body, files) => {

    const {
        productName,
        description,
        category,
        status,
        color,
        colorHex,
        ram,
        storage,
        price,
        stock,
        sku
    } = body;

    if (!productName || !description) {
        throw new Error("Product name and description are required");
    }

    await Product.findByIdAndUpdate(id, {
        productName: productName.trim(),
        description: description.trim(),
        categoryId: category,
        status: status || "active",
    });

    const defaultVariant = await Variant.findOne({ productId: id, IsDefault: true });

    if (defaultVariant) {

        const updates = {};

        if (color) updates.color = color.trim();
        if (colorHex) updates.colorCode = colorHex.trim();
        if (ram) updates.RAM = parseSpec(ram);
        if (storage) updates.storage = parseSpec(storage);
        if (price) updates.price = Number(price);
        if (stock) updates.stock = Number(stock);
        if (sku) updates.SKU = sku.trim();

        const newImages = (files || [])
            .filter(f => 
                f.fieldname === 'images' || 
                f.fieldname === 'images[]' ||
                f.fieldname.startsWith('newImages') || 
                f.fieldname.startsWith('variantImages')
            )
            .map(f => f.path);

        if (newImages.length > 0) {
            if (newImages.length < 3) {
                throw new Error("At least 3 product images are required when uploading images.");
            }
            if (newImages.length > 5) {
                throw new Error("A maximum of 5 images are allowed. Please ensure you upload between 3 and 5 images.");
            }
            updates.images = newImages;
        }

        await Variant.findByIdAndUpdate(defaultVariant._id, updates);
    }

};


/* ================= TOGGLE STATUS ================= */

const toggleStatus = async (id) => {

    const product = await Product.findById(id);

    product.status = product.status === "active"
        ? "inactive"
        : "active";

    await product.save();
};


/* ================= DELETE PRODUCT ================= */

const softDeleteProduct = async (id) => {

    await Product.findByIdAndUpdate(id, { IsDeleted: true });

};


export {
    getProducts,
    createProduct,
    getProductById,
    updateProduct,
    toggleStatus,
    softDeleteProduct
};