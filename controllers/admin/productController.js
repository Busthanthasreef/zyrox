import userSchema from "../../models/user.js";
import * as productService from "../../services/adminServices/productService.js";


/* ================= LOAD PRODUCTS ================= */

const loadProducts = async (req, res) => {
    try {

        const search = req.query.search || "";
        const statusFilter = req.query.status || "";
        const categoryFilter = req.query.category || "";
        const sortBy = req.query.sortBy || "newest";
        const page = parseInt(req.query.page) || 1;

        const limit = 4;

        const admin = req.session.admin;

        const data = await productService.getProducts({
            search,
            statusFilter,
            categoryFilter,
            sortBy,
            page,
            limit
        });

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({
                success: true,
                ...data,
                limit,
                search,
                statusFilter,
                categoryFilter,
                sortBy,
                currentPage: page
            });
        }

        res.render("admin/products/productManagement", {
            ...data,
            admin,
            limit,
            search,
            statusFilter,
            categoryFilter,
            sortBy,
            currentPage: page
        });
    } catch (error) {
        console.error(error);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(500).json({ success: false, message: "Server Error" });
        }
        res.status(500).send("Server Error");
    }
};


/* ================= LOAD ADD PRODUCT ================= */

const loadAddProduct = async (req, res) => {

    const admin = req.session.admin
        || await userSchema.findOne({ isAdmin: true }).lean();

    const data = await productService.getProducts({
        search: "",
        statusFilter: "",
        categoryFilter: "",
        page: 1,
        limit: 5
    });

    res.render("admin/products/addProduct", {
        categories: data.categories,
        admin
    });

};


/* ================= ADD PRODUCT ================= */

const addProduct = async (req, res) => {

    try {

        await productService.createProduct(req.body, req.files);

        res.status(201).json({
            success: true,
            message: "Product added successfully"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "error"
        });

    }

};


/* ================= LOAD EDIT PRODUCT ================= */

const loadEditProduct = async (req, res) => {

    try {

        const { id } = req.params;

        const admin = req.session.admin
            || await userSchema.findOne({ isAdmin: true }).lean();

        const data = await productService.getProductById(id);

        res.render("admin/products/editProduct", {
            ...data,
            admin
        });

    } catch (error) {

        res.status(500).send("Server Error");

    }

};


/* ================= EDIT PRODUCT ================= */

const editProduct = async (req, res) => {

    try {

        const { id } = req.params;

        await productService.updateProduct(id, req.body, req.files);

        res.json({
            success: true,
            message: "Product updated successfully"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};


const toggleProductStatus = async (req, res) => {
    try {
        const result = await productService.toggleStatus(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


/* ================= DELETE PRODUCT ================= */

const deleteProduct = async (req, res) => {

    await productService.softDeleteProduct(req.params.id);

    res.redirect("/adminUser/products");

};


export {
    loadProducts,
    loadAddProduct,
    addProduct,
    loadEditProduct,
    editProduct,
    toggleProductStatus,
    deleteProduct
};