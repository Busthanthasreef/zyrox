import crypto from 'crypto';
import User from '../models/user.js';

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
        const rewardAmount = 100; // Hardcoded reward for now, could be dynamic
        const referrer = await User.findById(referrerId);
        if (referrer) {
            referrer.referralRewards += rewardAmount;
            referrer.referredUsers.push(newUserId);
            await referrer.save();
            
            // Note: Wallet update should happen here too if wallet model is used
            return true;
        }
        return false;
    } catch (error) {
        console.error("Error rewarding referrer:", error);
        return false;
    }
};
