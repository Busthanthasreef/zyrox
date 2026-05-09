import mongoose from 'mongoose';

// Custom validator for percentage discount
const validatePercentageDiscount = function(value) {
    if (this.discountType === 'percentage' && value > 80) {
        throw new Error('Percentage discount exceeds allowed limit');
    }
    return true;
};

// Custom validator for flat discount
const validateFlatDiscount = async function(value) {
    if (this.discountType === 'flat' && this.offerType === 'product' && this.productId) {
        // This validation will be handled in the service layer for better async support
        return true;
    }
    return true;
};

const offerSchema = new mongoose.Schema({
    offerName: {
        type: String,
        required: true,
        trim: true
    },
    offerType: {
        type: String,
        required: true,
        enum: ['product', 'category', 'referral', 'all']
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        default: null
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Categories',
        default: null
    },
    discountType: {
        type: String,
        required: true,
        enum: ['percentage', 'flat'],
        default: 'percentage'
    },
    discountValue: { 
        type: Number,
        required: true,
        min: [0, 'Discount value must be positive'],
        validate: [
            {
                validator: validatePercentageDiscount,
                message: 'Percentage discount exceeds allowed limit'
            }
        ]
    },
    minPurchaseAmount: {
        type: Number,
        default: 0,
        min: [0, 'Minimum purchase amount cannot be negative']
    },
    maxDiscountAmount: {
        type: Number,
        default: null,
        min: [0, 'Maximum discount amount cannot be negative']
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true,
        validate: {
            validator: function(value) {
                return value > this.startDate;
            },
            message: 'End date must be after start date'
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const Offer = mongoose.model('Offer', offerSchema);
export default Offer;
