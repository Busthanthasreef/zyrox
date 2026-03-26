import userSchema from "../../models/user.js";
import * as productService from "../../services/adminServices/productService.js";


/* ================= LOAD PRODUCTS ================= */

const loadProducts = async (req, res) => {
    try {

        const search = req.query.search || "";
        const statusFilter = req.query.status || "";
        const categoryFilter = req.query.category || "";
        const page = parseInt(req.query.page) || 1;

        const limit = 4;

        const admin = req.session.admin;

        const data = await productService.getProducts({
            search,
            statusFilter,
            categoryFilter,
            page,
            limit
        });

        res.render("admin/products/productManagement", {
            ...data,
            admin,
            limit,
            search,
            statusFilter,
            categoryFilter,
            currentPage: page
        });

        
    } catch (error) {
        console.error(error);
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
            message: error.message
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


/* ================= TOGGLE STATUS ================= */

const toggleProductStatus = async (req, res) => {

    await productService.toggleStatus(req.params.id);

    res.redirect("/admin/products");

};


/* ================= DELETE PRODUCT ================= */

const deleteProduct = async (req, res) => {

    await productService.softDeleteProduct(req.params.id);

    res.redirect("/admin/products");

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