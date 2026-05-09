import mongoose from "mongoose";

// Custom validator for percentage discount
const validatePercentageDiscount = function(value) {
    let discountType;
    if (this instanceof mongoose.Document) {
        discountType = this.discountType;
    } else if (this.getUpdate) {
        const update = this.getUpdate();
        discountType = update.discountType || (update.$set ? update.$set.discountType : null);
    }
    
    if (discountType === 'percentage' && value > 99) {
        throw new Error('Percentage discount cannot exceed 99%');
    }
    return true;
};

// Custom validator for flat discount
const validateFlatDiscount = function(value) {
    let discountType, minCartValue;
    if (this instanceof mongoose.Document) {
        discountType = this.discountType;
        minCartValue = this.minCartValue;
    } else if (this.getUpdate) {
        const update = this.getUpdate();
        discountType = update.discountType || (update.$set ? update.$set.discountType : null);
        minCartValue = update.minCartValue !== undefined ? update.minCartValue : (update.$set ? update.$set.minCartValue : null);
    }

    if (discountType === 'flat' && minCartValue > 0) {
        const maxAllowed = minCartValue * 0.99; 
        if (value > maxAllowed) {
            throw new Error('Flat discount exceeds maximum allowed amount (99% of min cart)');
        }
    }
    return true;
};

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
        min: [0.01, 'Discount value must be greater than 0'],
        validate: [
            {
                validator: validatePercentageDiscount,
                message: 'Percentage discount exceeds allowed limit'
            },
            {
                validator: validateFlatDiscount,
                message: 'Flat discount validation failed'
            }
        ]
    },
    minCartValue: {
        type: Number,
        default: 0,
        min: [0, 'Minimum cart value cannot be negative']
    },
    maxDiscount: {
        type: Number,
        default: null,
        min: [0, 'Maximum discount cannot be negative']
    },
    validFrom: {
        type: Date,
        default: Date.now,
    },
    validTill: {
        type: Date,
        required: true,
        validate: {
            validator: function(value) {
                let fromDate;
                if (this instanceof mongoose.Document) {
                    fromDate = this.validFrom;
                } else if (this.getUpdate) {
                    const update = this.getUpdate();
                    fromDate = update.validFrom || (update.$set ? update.$set.validFrom : null);
                }
                
                if (!fromDate) return true; 
                return new Date(value) > new Date(fromDate);
            },
            message: 'Valid till date must be after valid from date'
        }
    },
    usageLimit: {
        type: Number,
        default: null, // null = unlimited
        min: [1, 'Usage limit must be at least 1 if specified']
    },
    usedCount: {
        type: Number,
        default: 0,
        min: [0, 'Used count cannot be negative']
    },
    usedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    isActive: {
        type: Boolean,
        default: true,
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const Coupon = mongoose.model("Coupon", couponSchema);
export default Coupon;
