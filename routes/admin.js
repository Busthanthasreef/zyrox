import express from "express";
import * as adminController from "../controllers/admin/adminController.js";
import * as costomerController from "../controllers/admin/customerController.js";
import { isAdminAuthenticated, isAdminGuest } from "../middlewares/auth.js";

const adminRoutes= express.Router();

adminRoutes.get("/", isAdminGuest, adminController.loadLogin);
adminRoutes.post("/", isAdminGuest, adminController.login);

adminRoutes.get("/dashboard", isAdminAuthenticated, adminController.dashboard);
adminRoutes.get("/users",isAdminAuthenticated, costomerController.loadUserManagement);


adminRoutes.get("/users/details", isAdminAuthenticated, costomerController.userDetails);
adminRoutes.post("/users/status",isAdminAuthenticated, costomerController.userStatus);
adminRoutes.get("/logout", isAdminAuthenticated, adminController.logout);

export default adminRoutes;