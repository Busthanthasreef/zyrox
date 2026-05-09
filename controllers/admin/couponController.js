import {
    fetchCoupons,
    createCoupon,
    updateCoupon,
    toggleStatus,
    softDeleteCoupon
} from "../../services/adminServices/couponService.js";

const getCoupons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const search = req.query.search || "";
        const statusFilter = req.query.status || "all";

        const { coupons, totalCoupons, totalPages } = await fetchCoupons({ 
            page, 
            search, 
            statusFilter 
        });

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({
                success: true,
                coupons,
                totalCoupons,
                totalPages,
                currentPage: page,
                search,
                statusFilter
            });
        }

        res.render('admin/coupon/couponManagement', {
            user: req.session.admin,
            coupons,
            totalCoupons,
            search,
            statusFilter,
            currentPage: page,
            totalPages
        });
    } catch (error) {
        console.error("Error in getCoupons:", error);
        res.status(500).send("Internal Server Error");
    }
};

const addCoupon = async (req, res) => {
    try {
        const result = await createCoupon(req.body);
        
        if (result.success) {
            return res.json({
                success: true,
                icon: result.icon || 'success',
                message: result.message
            });
        } else {
            return res.json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        console.error("Error in addCoupon:", error);
        res.json({ 
            success: false, 
            message: "Server error occurred while adding coupon" 
        });
    }
};

const editCoupon = async (req, res) => {
    try {
        const result = await updateCoupon(req.body);
        
        return res.json({
            success: result.success,
            icon: result.icon || (result.success ? 'success' : 'error'),
            message: result.message
        });
    } catch (error) {
        console.error("Error in editCoupon:", error);
        return res.json({
            success: false,
            message: "Server error occurred while updating coupon"
        });
    }
};

const toggleCouponStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await toggleStatus(id);
        
        if (result.status === 404) {
            return res.status(404).json({
                success: false,
                message: result.message
            });
        }

        res.json({
            success: result.success,
            message: result.message,
            isActive: result.isActive
        });
    } catch (error) {
        console.error("Error toggling coupon status:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error occurred while toggling coupon status" 
        });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await softDeleteCoupon(id);
        
        res.json({
            success: result.success,
            message: result.message
        });
    } catch (error) {
        console.error("Error in deleteCoupon:", error);
        res.json({ 
            success: false, 
            message: "Server error occurred while deleting coupon" 
        });
    }
};

export { getCoupons, addCoupon, editCoupon, deleteCoupon, toggleCouponStatus };