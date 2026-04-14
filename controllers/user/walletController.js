import walletSchema from "../../models/wallet.js";
import categorySchema from "../../models/category.js";
import WalletTransactions from "../../models/walletTransactions.js";
import User from "../../models/user.js";
import Razorpay from "razorpay";
import crypto from "crypto";

const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const getWallet = async (req, res) => {
    try {
        const sessionUser = req.session.user;
        const user = await User.findById(sessionUser._id);
        
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        let wallet = await walletSchema.findOne({ user_id: user._id });

        if (!wallet) {
            wallet = await walletSchema.create({
                user_id: user._id,
                balance: 0
            });
        }

        const transactions = await WalletTransactions.find({ user: user._id })
            .sort({ Payment_date: -1, Payment_time: -1 })
            .skip(skip)
            .limit(limit);

        const totalTransactions = await WalletTransactions.countDocuments({ user: user._id });
        const totalPages = Math.ceil(totalTransactions / limit);

        const categories = await categorySchema.find();
        
        res.render('user/wallet/walletPage', {
            wallet,
            user,
            categories,
            transactions,
            currentPage: page,
            totalPages,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("Error fetching wallet:", error);
        res.status(500).send("Internal Server Error");
    }
}

const createWalletOrder = async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount < 1) {
            return res.status(400).json({ success: false, message: "Invalid amount" });
        }

        const options = {
            amount: Math.round(amount * 100), // convert to paise
            currency: "INR",
            receipt: "wallet_topup_" + Date.now().toString(),
        };

        const order = await razorpayInstance.orders.create(options);
        res.json({ success: true, order });
    } catch (error) {
        console.error("Error creating wallet order:", error);
        res.status(500).json({ success: false, message: "Could not initiate payment" });
    }
};

const verifyWalletPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
        const secret = process.env.RAZORPAY_KEY_SECRET;

        const hmac = crypto.createHmac("sha256", secret);
        hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
        const generated_signature = hmac.digest("hex");

        if (generated_signature === razorpay_signature) {
            const userId = req.session.user._id;

            // Find or create wallet
            let wallet = await walletSchema.findOne({ user_id: userId });
            if (!wallet) {
                wallet = await walletSchema.create({ user_id: userId, balance: 0 });
            }

            // Update balance
            wallet.balance += parseFloat(amount);
            await wallet.save();

            // Create transaction record
            const newTransaction = new WalletTransactions({
                user: userId,
                Amount: parseFloat(amount),
                Payment_status: "Success",
                Wallet_id: wallet._id,
                Payment_date: new Date(),
                Payment_time: new Date(),
                Description: "Wallet Top-up"
            });
            await newTransaction.save();

            res.json({ success: true, message: "Wallet successfully topped up!" });
        } else {
            console.error("Invalid signature during wallet top-up");
            res.status(400).json({ success: false, message: "Invalid payment signature" });
        }
    } catch (error) {
        console.error("Error verifying wallet top-up:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

export { 
    getWallet,
    createWalletOrder,
    verifyWalletPayment 
};
