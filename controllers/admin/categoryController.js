import categorySchema from "../../models/category.js";
import productSchema from "../../models/product.js";

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ================= LOAD CATEGORIES ================= */

const loadCategories = async (req, res) => {
    try {
        const page         = parseInt(req.query.page) || 1;
        const search       = req.query.search       || "";
        const statusFilter = req.query.status        || "";
        const safeSearch   = escapeRegex(search);

        // Base query — never show deleted docs
        const query = { IsDeleted: false };

        // Search on categoryName only (no Email field on categories)
        if (safeSearch) {
            query.categoryName = { $regex: safeSearch, $options: 'i' };
        }

        // Status filter — correct field casing: IsActive (not isActive)
        if (statusFilter === 'active') {
            query.IsActive = true;
        } else if (statusFilter === 'blocked') {
            query.IsActive = false;
        }

        const limit = 4;

        // Paginate against the FILTERED query so page count is always accurate
        const filteredCount = await categorySchema.countDocuments(query);
        const totalPages    = Math.ceil(filteredCount / limit) || 1;

        // Global stats — always unfiltered
        const totalCategories    = await categorySchema.countDocuments({ IsDeleted: false });
        const activeCategories   = await categorySchema.countDocuments({ IsActive: true,  IsDeleted: false });
        const inActiveCategories = await categorySchema.countDocuments({ IsActive: false, IsDeleted: false });

        const categories = await categorySchema
            .find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        res.render("admin/category/Categories", {
            admin: req.session.admin,
            categories,
            limit,
            totalPages,
            currentPage:      page,
            totalCategories,
            activeCategories,
            inActiveCategories,
            // Pass back so the EJS view can pre-fill the search box and filter dropdown
            search,
            statusFilter,
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};


/* ================= ADD CATEGORY ================= */

const addCategory = async (req, res) => {
    try {
        const { categoryName } = req.body;
        const status = req.body.status === true || req.body.status === "true";

        if (!categoryName || !categoryName.trim()) {
            return res.status(400).json({
                success: false,
                message: "Category name cannot be blank"
            });
        }

        const normalizedName = categoryName.trim().toLowerCase();

        // Restore a soft-deleted category if the name matches
        const deleted = await categorySchema.findOne({
            categoryName: normalizedName,
            IsDeleted:    true
        });

        if (deleted) {
            deleted.IsDeleted = false;
            deleted.IsActive  = status;
            await deleted.save();

            return res.status(200).json({
                success: true,
                message: "Category restored successfully"
            });
        }

        // Reject live duplicates
        const exists = await categorySchema.findOne({
            categoryName: normalizedName,
            IsDeleted:    false
        });

        if (exists) {
            return res.status(409).json({
                success: false,
                message: "Category already exists"
            });
        }

        await categorySchema.create({
            categoryName: normalizedName,
            IsActive:     status,
            IsDeleted:    false,
        });

        return res.status(201).json({
            success: true,
            message: "Category created successfully"
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};


/* ================= EDIT CATEGORY ================= */

const editCategory = async (req, res) => {
    try {
        const { id }                  = req.params;
        const { categoryName, status } = req.body;

        if (!categoryName || !categoryName.trim()) {
            return res.status(400).json({
                success: false,
                message: "Category name cannot be blank"
            });
        }

        const normalizedName = categoryName.trim().toLowerCase();

        // Prevent saving a name that already belongs to a different category
        const duplicate = await categorySchema.findOne({
            _id:          { $ne: id },
            categoryName: normalizedName,
            IsDeleted:    false
        });

        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: "Another category with this name already exists"
            });
        }

        const isActive = status === true || status === "true";
        await categorySchema.findByIdAndUpdate(id, {
            categoryName: normalizedName,
            IsActive:     isActive
        });

        // Sync product status with category status
        await productSchema.updateMany(
            { categoryId: id },
            { status: isActive ? 'active' : 'inactive' }
        );

        return res.json({
            success: true,
            message: "Category updated successfully"
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Update failed"
        });
    }
};


/* ================= DELETE CATEGORY (SOFT DELETE) ================= */

const deleteCategory = async (req, res) => {
    try {
        const id = req.params.id;
        await categorySchema.findByIdAndUpdate(id, { IsDeleted: true, IsActive: false });

        // Soft delete all products under this deleted category
        await productSchema.updateMany(
            { categoryId: id },
            { IsDeleted: true, status: 'inactive' }
        );

        return res.status(200).json({
            success: true,
            message: "Category deleted successfully"
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Delete failed"
        });
    }
};


export {
    loadCategories,
    addCategory,
    editCategory,
    deleteCategory
};