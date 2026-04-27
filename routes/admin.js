import express from "express";
import * as adminController from "../controllers/admin/adminController.js";
import * as costomerController from "../controllers/admin/customerController.js";
import { isAdminAuthenticated, isAdminGuest } from "../middlewares/auth.js";
import * as productController from "../controllers/admin/productController.js";
import * as variantController from "../controllers/admin/variantController.js";
import * as categoryController from "../controllers/admin/categoryController.js";
import * as orderController from "../controllers/admin/orderController.js";
import * as couponController from "../controllers/admin/couponController.js";
import * as offerController from "../controllers/admin/offerController.js";
import upload from "../middlewares/multer.js";

const adminRoutes = express.Router();
adminRoutes.get("/", isAdminGuest, adminController.loadLogin);
adminRoutes.post("/", isAdminGuest, adminController.login);

adminRoutes.get("/dashboard", isAdminAuthenticated, adminController.dashboard);

adminRoutes.get("/users", isAdminAuthenticated, costomerController.loadUserManagement);
adminRoutes.post("/users/status", isAdminAuthenticated, costomerController.userStatus);
adminRoutes.get("/users/details", isAdminAuthenticated, costomerController.userDetails);

adminRoutes.get("/categories", isAdminAuthenticated, categoryController.loadCategories);
adminRoutes.post("/categories-add", isAdminAuthenticated, categoryController.addCategory);
adminRoutes.put("/categories/:id", isAdminAuthenticated, categoryController.editCategory);
adminRoutes.patch("/categories/delete/:id", isAdminAuthenticated, categoryController.deleteCategory);

adminRoutes.get("/products", isAdminAuthenticated, productController.loadProducts);
adminRoutes.get("/products-add", isAdminAuthenticated, productController.loadAddProduct);
adminRoutes.get("/products-edit/:id", isAdminAuthenticated, productController.loadEditProduct);

adminRoutes.post("/products-add", isAdminAuthenticated, upload.any(), productController.addProduct);
adminRoutes.post("/products-edit/:id", isAdminAuthenticated, upload.any(), productController.editProduct);
adminRoutes.get("/products-delete/:id", isAdminAuthenticated, productController.deleteProduct)

adminRoutes.get('/products/:id/variants-delete/:variantId', isAdminAuthenticated,variantController.deleteVariant);
adminRoutes.get('/products/:id/variants', isAdminAuthenticated, variantController.loadVariantListing);
adminRoutes.post('/products/:id/variants-add', isAdminAuthenticated, upload.array('images', 5), variantController.addVariant);
adminRoutes.post('/products/:id/variants-edit/:variantId', isAdminAuthenticated, upload.array('images', 5), variantController.editVariant);
adminRoutes.patch('/variants/:variantId/set-default', isAdminAuthenticated, variantController.setDefaultVariant);

adminRoutes.get('/orders',isAdminAuthenticated,orderController.getOrders)
adminRoutes.get('/orders/details',isAdminAuthenticated,orderController.getOrderDetails);
adminRoutes.post('/orders/update-status', isAdminAuthenticated, orderController.updateOrderStatus);
adminRoutes.post('/orders/accept-return', isAdminAuthenticated, orderController.acceptReturn);
adminRoutes.post('/orders/decline-return', isAdminAuthenticated, orderController.declineReturn);
adminRoutes.post('/orders/accept-item-request', isAdminAuthenticated, orderController.acceptItemRequest);
adminRoutes.post('/orders/decline-item-request', isAdminAuthenticated, orderController.declineItemRequest);

adminRoutes.get('/coupons', isAdminAuthenticated, couponController.getCoupons);
adminRoutes.post('/coupons/add', isAdminAuthenticated, couponController.addCoupon);
adminRoutes.post('/coupons/edit', isAdminAuthenticated, couponController.editCoupon);
adminRoutes.delete('/coupons/delete/:id', isAdminAuthenticated, couponController.deleteCoupon);

// Offer Routes
adminRoutes.get('/offers', isAdminAuthenticated, offerController.getOffers);
adminRoutes.post('/offers/add-product', isAdminAuthenticated, offerController.addProductOffer);
adminRoutes.post('/offers/add-category', isAdminAuthenticated, offerController.addCategoryOffer);
adminRoutes.post('/offers/add-referral', isAdminAuthenticated, offerController.addReferralOffer);
adminRoutes.post('/offers/add-all', isAdminAuthenticated, offerController.addAllOffer);
adminRoutes.put('/offers/edit/:id', isAdminAuthenticated, offerController.editOffer);
adminRoutes.patch('/offers/toggle/:id', isAdminAuthenticated, offerController.toggleOfferStatus);
adminRoutes.delete('/offers/delete/:id', isAdminAuthenticated, offerController.deleteOffer);

// Sales Report
import * as salesReportController from "../controllers/admin/salesReportController.js";
adminRoutes.get('/sales-report', isAdminAuthenticated, salesReportController.getSalesReport);
adminRoutes.get('/sales-report/export/excel', isAdminAuthenticated, salesReportController.exportExcel);
adminRoutes.get('/sales-report/export/pdf', isAdminAuthenticated, salesReportController.exportPDF);


adminRoutes.get("/logout", isAdminAuthenticated, adminController.logout);


export default adminRoutes;
// 