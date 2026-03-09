import VariantSchema from '../../models/variant.js';
import ProductSchema from '../../models/product.js';
import categorySchema from '../../models/category.js';
import cloudinary from '../../config/cloudinary.js';

/* =====================================
   LOAD VARIANT LISTING
===================================== */
const loadVariantListing = async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const product = await ProductSchema.findById(id).lean();
        if (!product) return res.status(404).send("Product not found");

        const totalVariants = await VariantSchema.countDocuments({ productId: id, IsDeleted: false });
        const activeVariants = await VariantSchema.countDocuments({ productId: id, IsActive: true, IsDeleted: false });
        const inactiveVariants = await VariantSchema.countDocuments({ productId: id, IsActive: false, IsDeleted: false });
        const totalPages = Math.ceil(totalVariants / limit);

        const variants = await VariantSchema.find({ productId: id ,IsDeleted:false})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const categories = await categorySchema.find().lean();

        res.render("admin/products/variantListing", {
            product,
            variants,
            categories,
            totalVariants,
            activeVariants,
            inactiveVariants,
            totalPages,
            currentPage: page,
            startItem: skip + 1,
            endItem: Math.min(skip + limit, totalVariants),
            user: req.session.user,
            successMsg: (() => {
                const m = req.session.successMsg;
                delete req.session.successMsg;
                return m;
            })(),
            errorMsg: (() => {
                const m = req.session.errorMsg;
                delete req.session.errorMsg;
                return m;
            })()
        });
    } catch (err) {
        console.error("loadVariantListing error:", err);
        res.status(500).send("Server Error");
    }
};

/* =====================================
   ADD VARIANT
===================================== */
const addVariant = async (req, res) => {
    try {
        const { id: productId } = req.params;
        const { color, storage, RAM, stock, price, SKU, isActive, isDefault } = req.body;

        const product = await ProductSchema.findById(productId);
        if (!product) return res.status(404).send("Product not found");

        if (SKU) {
            const existingSKU = await VariantSchema.findOne({ SKU });
            if (existingSKU) {
                req.session.errorMsg = "SKU already exists";
                return res.redirect(`/admin/products/${productId}/variants`);
            }
        }

        // images are already uploaded by multer-storage-cloudinary
        const imageUrls = (req.files || []).map(f => f.path);

        if (isDefault === "on" || isDefault === true) {
            await VariantSchema.updateMany({ productId }, { IsDefault: false });
        }

        const existingCount = await VariantSchema.countDocuments({ productId });
        const shouldBeDefault = (isDefault === "on") || existingCount === 0;

        const newVariant = new VariantSchema({
            productId,
            color: color || "",
            colorCode: req.body.colorCode || "#000000",
            storage: storage ? Number(storage) : undefined,
            RAM: RAM ? Number(RAM) : undefined,
            stock: stock ? Number(stock) : 0,
            price: price ? Number(price) : 0,
            SKU: SKU || "",
            IsActive: isActive === "on" || isActive === true,
            IsDefault: shouldBeDefault,
            images: imageUrls
        });

        await newVariant.save();
        req.session.successMsg = "Variant added successfully";
        res.redirect(`/admin/products/${productId}/variants`);

    } catch (err) {
        console.error("addVariant error:", err);
        req.session.errorMsg = "Failed to add variant";
        res.redirect(`/admin/products/${req.params.id}/variants`);
    }
};

/* =====================================
   EDIT VARIANT
===================================== */
const editVariant = async (req, res) => {
    try {
        const { id: productId, variantId } = req.params;
        const { color, storage, RAM, stock, price, SKU, isActive, isDefault } = req.body;

        const variant = await VariantSchema.findById(variantId);
        if (!variant) return res.status(404).send("Variant not found");

        let imageUrls = variant.images || [];

        // If new images uploaded, we add/replace depending on frontend implementation
        // For simplicity here, if new images come, we replace all (matching variantListing model)
        if (req.files && req.files.length > 0) {
            imageUrls = req.files.map(f => f.path);
            // Optional: delete old images from cloudinary if you want to be clean
        }

        if (isDefault === "on" || isDefault === true) {
            await VariantSchema.updateMany(
                { productId, _id: { $ne: variantId } },
                { IsDefault: false }
            );
            variant.IsDefault = true;
        } else {
            // Note: Ensuring at least one default might be needed, 
            // but for now we follow the user's toggle.
            variant.IsDefault = false;
        }

        variant.color     = color || variant.color;
        variant.colorCode = req.body.colorCode || variant.colorCode || "#000000";
        variant.storage   = storage ? Number(storage) : variant.storage;
        variant.RAM       = RAM ? Number(RAM) : variant.RAM;
        variant.stock     = stock !== undefined ? Number(stock) : variant.stock;
        variant.price     = price !== undefined ? Number(price) : variant.price;
        variant.SKU       = SKU || variant.SKU;
        variant.IsActive  = isActive === "on" || isActive === true;
        variant.images    = imageUrls;

        await variant.save();
        req.session.successMsg = "Variant updated successfully";
        res.redirect(`/admin/products/${productId}/variants`);

    } catch (err) {
        console.error("editVariant error:", err);
        req.session.errorMsg = "Failed to update variant";
        res.redirect(`/admin/products/${req.params.id}/variants`);
    }
};

/* =====================================
   TOGGLE VARIANT ACTIVE STATUS
===================================== */
const toggleVariant = async (req, res) => {
    try {
        const { variantId } = req.params;
        const { isActive }  = req.body;
        await VariantSchema.findByIdAndUpdate(variantId, {
            IsActive: isActive === true || isActive === "true"
        });
        res.json({ success: true });
    } catch (err) {
        console.error("toggleVariant error:", err);
        res.json({ success: false });
    }
};

/* =====================================
   SET DEFAULT VARIANT
===================================== */
const setDefaultVariant = async (req, res) => {
    try {
        const { variantId } = req.params;
        const variant = await VariantSchema.findById(variantId);
        if (!variant) return res.json({ success: false, message: "Variant not found" });

        await VariantSchema.updateMany(
            { productId: variant.productId },
            { IsDefault: false }
        );
        variant.IsDefault = true;
        await variant.save();
        res.json({ success: true });
    } catch (err) {
        console.error("setDefaultVariant error:", err);
        res.json({ success: false });
    }
};

/* =====================================
   SOFT DELETE VARIANT
===================================== */
const deleteVariant = async (req, res) => {
    try {
        const { id, variantId } = req.params;
        const variant = await VariantSchema.findById(variantId);

        if (!variant) {
            req.session.errorMsg = "Variant not found";
            return res.redirect(`/admin/products/${id}/variants`);
        }

        // If deleting the default variant
        if (variant.IsDefault) {
            // Find another variant to make it default
            const nextAvailable = await VariantSchema.findOne({
                productId: id,
                IsDeleted: false,
                _id: { $ne: variantId }
            });

            if (!nextAvailable) {
                req.session.errorMsg = "Can't delete the default variant as it's the only one left.";
                return res.redirect(`/admin/products/${id}/variants`);
            }

            // Assign new default
            await VariantSchema.findByIdAndUpdate(nextAvailable._id, { IsDefault: true });
        }

        // Soft delete the current variant
        await VariantSchema.findByIdAndUpdate(variantId, { 
            IsDeleted: true,
            IsDefault: false,
            IsActive: false,
            SKU: `${variant.SKU}-DEL-${Date.now()}`
        });

        req.session.successMsg = "Variant deleted successfully";
        res.redirect(`/admin/products/${id}/variants`);
    } catch (err) {
        console.error("deleteVariant error:", err);
        req.session.errorMsg = "Failed to delete variant";
        res.redirect(`/admin/products/${req.params.id}/variants`);
    }
};

export {
    loadVariantListing,
    addVariant,
    editVariant,
    toggleVariant,
    setDefaultVariant,
    deleteVariant
};
