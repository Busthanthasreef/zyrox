import express from "express";
import * as adminController from "../controllers/admin/adminController.js";
import * as costomerController from "../controllers/admin/customerController.js";
import { isAdminAuthenticated, isAdminGuest } from "../middlewares/auth.js";
import * as productController from "../controllers/admin/productController.js"
import * as categoryController from "../controllers/admin/categoryController.js"
import upload from "../middlewares/multer.js";
const adminRoutes = express.Router();
adminRoutes.get("/", isAdminGuest, adminController.loadLogin);
adminRoutes.post("/", isAdminGuest, adminController.login);

adminRoutes.get("/dashboard", isAdminAuthenticated, adminController.dashboard);

adminRoutes.get("/users", isAdminAuthenticated, costomerController.loadUserManagement);
adminRoutes.post("/users/status", isAdminAuthenticated, costomerController.userStatus);
adminRoutes.get("/users/details", isAdminAuthenticated, costomerController.userDetails);

adminRoutes.get("/categories",isAdminAuthenticated,categoryController.loadCategories);
adminRoutes.post("/categories-add",isAdminAuthenticated,categoryController.addCategory);
adminRoutes.put("/categories/:id",isAdminAuthenticated,categoryController.editCategory);
adminRoutes.patch("/categories/delete/:id",isAdminAuthenticated,categoryController.deleteCategory);

adminRoutes.get("/products", isAdminAuthenticated, productController.loadProducts);
adminRoutes.get("/products-add", isAdminAuthenticated, productController.loadAddProduct);

adminRoutes.post("/products-add", isAdminAuthenticated, upload.any(), productController.addProduct);
adminRoutes.get("/products/:id", isAdminAuthenticated, productController.loadEditProduct);
adminRoutes.post("/products-edit", isAdminAuthenticated, upload.any(), productController.editProduct);

adminRoutes.get("/logout", isAdminAuthenticated, adminController.logout);

export default adminRoutes;