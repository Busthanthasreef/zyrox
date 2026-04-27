import mongoose from 'mongoose';

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
    discountValue: { // This replaces discountPercentage as a more general field
        type: Number,
        required: true,
        min: 0
    },
    minPurchaseAmount: {
        type: Number,
        default: 0
    },
    maxDiscountAmount: {
        type: Number,
        default: null // For percentage offers
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
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
