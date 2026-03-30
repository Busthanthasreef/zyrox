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

    const { productName, description, category, status, variants } = data;

    const v0 = Array.isArray(variants) ? variants[0] : (variants?.["0"] ?? variants);

    const existed = await Product.findOne({
        productName: { $regex: `^${productName.trim()}$`, $options: "i" },
        IsDeleted: false,
    });

    if (existed) {
        throw new Error("Product already exists");
    }

    const variantImages = (files || [])
        .filter(f => f.fieldname.startsWith("variantImages"))
        .map(f => f.path);

    const newProduct = await Product.create({
        productName: productName.trim(),
        description: description.trim(),
        categoryId: category,
        status: status || "active",
    });

    await Variant.create({
        productId: newProduct._id,
        color: v0.color.trim(),
        colorCode: v0.colorHex || "#000000",
        RAM: parseSpec(v0.ram),
        storage: parseSpec(v0.storage),
        price: Number(v0.price),
        stock: Number(v0.stock),
        SKU: v0.sku?.trim() || "",
        IsActive: v0.isActive === "true",
        IsDefault: true,
        images: variantImages,
    });

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

    await Product.findByIdAndUpdate(id, {
        productName: productName.trim(),
        description: description.trim(),
        categoryId: category,
        status,
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
            .filter(f => f.fieldname.startsWith("newImages") || f.fieldname.startsWith("variantImages"))
            .map(f => f.path);

        if (newImages.length > 0) {
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