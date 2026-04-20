import mongoose from "mongoose";

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
    },
    description: {
        type: String,
        required: true,
    },
    discountType: {
        type: String,
        enum: ["percentage", "flat"],
        default: "flat",
    },
    discountValue: {
        type: Number,
        required: true,
    },
    minCartValue: {
        type: Number,
        default: 0,
    },
    maxDiscount: {
        type: Number,
        default: null,
    },
    validFrom: {
        type: Date,
        default: Date.now,
    },
    validTill: {
        type: Date,
        required: true,
    },
    usageLimit: {
        type: Number,
        default: null, // null = unlimited
    },
    usedCount: {
        type: Number,
        default: 0,
    },
    usedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    isActive: {
        type: Boolean,
        default: true,
    },
    isDeleted:{
        type:Boolean,
        default:false
    }
}, { timestamps: true });

const Coupon = mongoose.model("Coupon", couponSchema);
export default Coupon;
