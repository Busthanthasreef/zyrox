import Coupon from "../../models/coupon.js";

const getCoupons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";
        const statusFilter = req.query.status || "all";

        const query = {
            isDeleted: false,
            code: { $regex: search, $options: "i" }
        };

        if (statusFilter === "active") {
            query.isActive = true;
        } else if (statusFilter === "inactive") {
            query.isActive = false;
        }

        const totalCoupons = await Coupon.countDocuments(query);

        const coupons = await Coupon.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalPages = Math.ceil(totalCoupons / limit) || 1;

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
}

const addCoupon = async (req, res) => {
    try {
        const { couponId,code, description, discountType, discountValue, minCartValue, maxDiscount, usageLimit, validFrom, validTill, isActive } = req.body;

        const existingCoupon = await Coupon.findOne({ code: code.trim().toUpperCase() });
        if (existingCoupon && existingCoupon.isDeleted === true) {

            await Coupon.findByIdAndUpdate(existingCoupon._id, { isDeleted: false })
            return res.json({ success: true, icon: 'success', message: "Coupon restored successfully" });
        }
        
        console.log('iubhjk',couponId)
        const normalizedCode = code.trim().toUpperCase();

          // 4. Check duplicate coupon (excluding current one)
        const duplicateCoupon = await Coupon.findOne({
            code: normalizedCode,
        });

        if (duplicateCoupon) {
            return res.json({
                success: false,
                message: "Coupon already exists"
            });
        }


        // Validation: Percentage cannot exceed 100
        if (discountType === 'percentage' && Number(discountValue) > 100) {
            return res.json({ success: false, message: "Percentage discount cannot exceed 100%" });
        }

        // Validation: Flat discount cannot exceed minCartValue
        if (discountType === 'flat' && Number(minCartValue) > 0 && Number(discountValue) >= Number(minCartValue)) {
            return res.json({ success: false, message: "Flat discount must be less than Minimum Cart Value" });
        }

        const fromDate = new Date(validFrom);
        const tillDate = new Date(validTill);

        if (isNaN(fromDate.getTime()) || isNaN(tillDate.getTime())) {
            return res.json({ success: false, message: "Invalid date format provided" });
        }

        if (fromDate >= tillDate) {
            return res.json({ success: false, message: "Valid From must be before Valid Till" });
        }

        const newCoupon = new Coupon({
            code: code.trim().toUpperCase(),
            description,
            discountType,
            discountValue: Number(discountValue),
            minCartValue: Number(minCartValue) || 0,
            maxDiscount: maxDiscount ? Number(maxDiscount) : null,
            usageLimit: usageLimit ? Number(usageLimit) : null,
            validFrom: fromDate,
            validTill: tillDate,
            isActive: true,
            isDeleted: false,
        });

        await newCoupon.save();
        res.json({ success: true, message: "Coupon added successfully" });
    } catch (error) {
        console.error("Error in addCoupon:", error);
        res.json({ success: false, message: error.message });
    }
}

const editCoupon = async (req, res) => {
    try {
        const {
            couponId,
            code,
            description,
            discountType,
            discountValue,
            minCartValue,
            maxDiscount,
            usageLimit,
            validFrom,
            validTill,
            isActive
        } = req.body;

        // 1. Basic validation
        if (!couponId || !code || !discountType || !discountValue) {
            return res.json({
                success: false,
                message: "Missing required fields"
            });
        }

        // 2. Find existing coupon
        const existingCoupon = await Coupon.findById(couponId);
        if (!existingCoupon) {
            return res.json({
                success: false,
                message: "Coupon not found"
            });
        }

        // 3. Normalize input
        const normalizedCode = code.trim().toUpperCase();

        // 4. Check duplicate coupon (excluding current one)
        const duplicateCoupon = await Coupon.findOne({
            code: normalizedCode,
            _id: { $ne: couponId }
        });

        if (duplicateCoupon) {
            return res.json({
                success: false,
                message: "Coupon code already exists"
            });
        }

        const fromDate = new Date(validFrom);
        const tillDate = new Date(validTill);

        if (isNaN(fromDate.getTime()) || isNaN(tillDate.getTime())) {
            return res.json({ success: false, message: "Invalid date format provided" });
        }

        // 5. Prepare update data safely
        const updateData = {
            code: normalizedCode,
            description: description ? description.trim() : "",
            discountType,
            discountValue: Number(discountValue),
            minCartValue: Number(minCartValue) || 0,
            maxDiscount: maxDiscount ? Number(maxDiscount) : null,
            usageLimit: usageLimit ? Number(usageLimit) : null,
            validFrom: fromDate,
            validTill: tillDate,
            isActive: isActive === true || isActive === 'true'
        };

        // 6. Numeric validation
        if (updateData.discountValue <= 0) {
            return res.json({
                success: false,
                message: "Discount value must be greater than 0"
            });
        }

        if (updateData.discountType === 'percentage' && updateData.discountValue > 100) {
            return res.json({
                success: false,
                message: "Percentage discount cannot exceed 100%"
            });
        }

        if (updateData.minCartValue < 0) {
            return res.json({
                success: false,
                message: "Min cart value cannot be negative"
            });
        }

        if (updateData.discountType === 'flat' && updateData.minCartValue > 0 && updateData.discountValue >= updateData.minCartValue) {
            return res.json({
                success: false,
                message: "Flat discount must be less than Minimum Cart Value"
            });
        }

        // 7. Date validation
        if (updateData.validFrom >= updateData.validTill) {
            return res.json({
                success: false,
                message: "Valid From must be before Valid Till"
            });
        }

        // 8. Check if anything changed
        const isChanged =
            existingCoupon.code !== updateData.code ||
            existingCoupon.description !== updateData.description ||
            existingCoupon.discountType !== updateData.discountType ||
            existingCoupon.discountValue !== updateData.discountValue ||
            existingCoupon.minCartValue !== updateData.minCartValue ||
            existingCoupon.maxDiscount !== updateData.maxDiscount ||
            existingCoupon.usageLimit !== updateData.usageLimit ||
            existingCoupon.validFrom.getTime() !== updateData.validFrom.getTime() ||
            existingCoupon.validTill.getTime() !== updateData.validTill.getTime() ||
            existingCoupon.isActive !== updateData.isActive;

        if (!isChanged) {
            return res.json({
                success: true,
                icon: "info",
                message: "No changes detected"
            });
        }

        // 9. Update coupon
        await Coupon.findByIdAndUpdate(
            couponId,
            updateData,
            { new: true, runValidators: true }
        );

        return res.json({
            success: true,
            message: "Coupon updated successfully"
        });

    } catch (error) {
        console.error("Error in editCoupon:", error);
        return res.json({
            success: false,
            message: "Server error"
        });
    }
};

const toggleCouponStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findById(id);
        if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });

        coupon.isActive = !coupon.isActive;
        await coupon.save();

        res.json({
            success: true,
            message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: coupon.isActive
        });
    } catch (error) {
        console.error("Error toggling coupon status:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}

const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        await Coupon.findByIdAndUpdate(id, { isDeleted: true });
        res.json({ success: true, message: "Coupon deleted successfully" });
    } catch (error) {
        console.error("Error in deleteCoupon:", error);
        res.json({ success: false, message: error.message });
    }
}

export { getCoupons, addCoupon, editCoupon, deleteCoupon, toggleCouponStatus };