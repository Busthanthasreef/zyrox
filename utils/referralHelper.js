import crypto from 'crypto';
import User from '../models/user.js';
import Offer from '../models/offer.js';

/**
 * Generates a unique referral code.
 */
export const generateReferralCode = async () => {
    let code;
    let isUnique = false;
    while (!isUnique) {
        code = crypto.randomBytes(4).toString('hex').toUpperCase(); // e.g. "A1B2C3D4"
        const existing = await User.findOne({ referralCode: code });
        if (!existing) isUnique = true;
    }
    return code;
};

/**
 * Handles referral rewards.
 */
export const rewardReferrer = async (referrerId, newUserId) => {
    try {
        const now = new Date();
        const referralOffer = await Offer.findOne({
            offerType: 'referral',
            isActive: true,
            isDeleted: false,
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        const rewardAmount = referralOffer ? referralOffer.discountValue : 500; // Default to 500 if no offer
        
        const referrer = await User.findById(referrerId);
        if (referrer) {
            referrer.referralRewards += rewardAmount;
            referrer.referredUsers.push(newUserId);
            await referrer.save();
            
            return rewardAmount; // Return the amount so controller can update wallet
        }
        return 0;
    } catch (error) {
        console.error("Error rewarding referrer:", error);
        return 0;
    }
};
