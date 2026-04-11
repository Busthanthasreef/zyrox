import Coupon from "../../models/coupon.js";

const getCoupons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";

        const query = {
            code: { $regex: search, $options: "i" }
        };

        const totalCoupons = await Coupon.find({isDeleted:false}).countDocuments(query);
        const active = {isDeleted:false}
        const coupons = await Coupon.find(query,active)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalPages = Math.ceil(totalCoupons / limit);

        res.render('admin/coupon/couponManagement', {
            user: req.session.admin,
            coupons,
            search,
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
        const { code, description, discountType, discountValue, minCartValue, maxDiscount, usageLimit, validFrom, validTill, isActive } = req.body;

        const existingCoupon = await Coupon.findOne({ code: code.trim().toUpperCase() });
        if (existingCoupon) {
            return res.json({ success: false, icon:'warning',message: "Coupon  already exists" });
        }

        const newCoupon = new Coupon({
            code: code.trim().toUpperCase(),
            description,
            discountType,
            discountValue: Number(discountValue),
            minCartValue: Number(minCartValue) || 0,
            maxDiscount: maxDiscount ? Number(maxDiscount) : null,
            usageLimit: usageLimit ? Number(usageLimit) : null,
            validFrom: new Date(validFrom),
            validTill: new Date(validTill),
            isActive: true,
            isDeleted:false,
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
        const { couponId, code, description, discountType, discountValue, minCartValue, maxDiscount, usageLimit, validFrom, validTill, isActive } = req.body;

        
        const existingCoupon = await Coupon.findOne({ code:code});
        if (existingCoupon) {
            return res.json({ success: false, message: "this Coupon already exists" });
        }
        const updateData = {
            code: code.trim().toUpperCase(),
            description,
            discountType,
            discountValue: Number(discountValue),
            minCartValue: Number(minCartValue) || 0,
            maxDiscount: maxDiscount ? Number(maxDiscount) : null,
            usageLimit: usageLimit ? Number(usageLimit) : null,
            validFrom: new Date(validFrom),
            validTill: new Date(validTill),
            isActive: isActive === true || isActive === 'true'
        };

        await Coupon.findByIdAndUpdate(couponId, updateData);
        res.json({ success: true, message: "Coupon updated successfully" });
    } catch (error) {
        console.error("Error in editCoupon:", error);
        res.json({ success: false, message: error.message });
    }
}

const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        await Coupon.findByIdAndUpdate(id,{isDeleted:true});
        res.json({ success: true, message: "Coupon deleted successfully" });
    } catch (error) {
        console.error("Error in deleteCoupon:", error);
        res.json({ success: false, message: error.message });
    }
}

export { getCoupons, addCoupon, editCoupon, deleteCoupon };