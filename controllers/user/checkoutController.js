import Category from "../../models/category.js"
import Cart from "../../models/cart.js"
import Product from "../../models/product.js"
import Variant from "../../models/variant.js"
import Address from "../../models/address.js"
import Order from "../../models/order.js"
import Coupon from "../../models/coupon.js"
import Wallet from "../../models/wallet.js";
import WalletTransactions from "../../models/walletTransactions.js";
import { v4 as uuidv4 } from 'uuid';
import Razorpay from "razorpay";
import crypto from "crypto";
import { calculateBestOffer, applyOffer } from "../../utils/offerHelper.js";

const SHIPPING_THRESHOLD = 50;
const SHIPPING_FEE = 30;

/* ── HELPER: CALCULATE ORDER SUMMARY ── */
async function calculateOrderSummary(userId, buyNowItem, appliedCouponCode = null) {
    let subtotal = 0, totalOfferDiscount = 0, orderItems = [];

    if (buyNowItem) {
        const { productId, variantId, quantity } = buyNowItem;
        const product = await Product.findById(productId);
        const variant = await Variant.findById(variantId);

        if (!product || !variant || product.IsDeleted || variant.IsDeleted || product.status !== 'active' || !variant.IsActive) {
            throw new Error("Product or variant is currently unavailable.");
        }
        if (variant.stock < quantity) {
            throw new Error(`Only ${variant.stock} units available for ${product.productName}`);
        }

        const bestOffer = await calculateBestOffer(product._id, product.categoryId, (variant.price || 0));
        const discountedPrice = bestOffer ? applyOffer(variant.price, bestOffer) : variant.price;

        orderItems = [{
            product: product._id, variant: variant._id, name: product.productName, image: (variant.images && variant.images[0]) || "",
            quantity, price: variant.price, total: variant.price * quantity,
            color: variant.color, storage: variant.storage, RAM: variant.RAM
        }];
        subtotal = variant.price * quantity;
        totalOfferDiscount = (variant.price - discountedPrice) * quantity;
    } else {
        const cart = await Cart.findOne({ User_id: userId }).populate("Items.Product_id").populate("Items.Variant_id");
        if (!cart || !cart.Items.length) throw new Error("Your cart is empty.");

        for (const item of cart.Items) {
            const p = item.Product_id, v = item.Variant_id;
            if (!p || !v || p.IsDeleted || v.IsDeleted || p.status !== 'active' || !v.IsActive) continue;

            if (v.stock < item.Quantity) {
                throw new Error(`Insufficient stock for ${p.productName}.`);
            }

            const bestOffer = await calculateBestOffer(p._id, p.categoryId, (v.price || 0));
            const discountedPrice = bestOffer ? applyOffer(v.price, bestOffer) : v.price;

            orderItems.push({
                product: p._id, variant: v._id, name: p.productName, image: (v.images && v.images[0]) || "",
                quantity: item.Quantity, price: v.price, total: v.price * item.Quantity,
                color: v.color, storage: v.storage, RAM: v.RAM
            });
            subtotal += (v.price * item.Quantity);
            totalOfferDiscount += (v.price - discountedPrice) * item.Quantity;
        }
        if (!orderItems.length) throw new Error("No active items in cart.");
    }

    let couponDiscount = 0, couponCode = null;
    const subtotalAfterOffers = subtotal - totalOfferDiscount;

    if (appliedCouponCode) {
        const coupon = await Coupon.findOne({ code: appliedCouponCode, isActive: true, isDeleted: false, validFrom: { $lte: new Date() }, validTill: { $gte: new Date() } });
        if (coupon && subtotalAfterOffers >= coupon.minCartValue) {
            if (!coupon.usedBy.includes(userId)) {
                couponCode = coupon.code;
                couponDiscount = coupon.discountType === 'percentage'
                    ? Math.min((subtotalAfterOffers * coupon.discountValue) / 100, coupon.maxDiscount || Infinity)
                    : coupon.discountValue;
            }
        }
    }

    const shippingCharge = subtotalAfterOffers > SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const finalPrice = Math.max(0, subtotalAfterOffers - couponDiscount + shippingCharge);

    return { subtotal, totalOfferDiscount, couponDiscount, couponCode, shippingCharge, finalPrice, orderItems };
}


const loadCheckout = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const [categories, userAddresses, wallet] = await Promise.all([
            Category.find({ IsDeleted: false }), Address.find({ userId }), Wallet.findOne({ user_id: userId })
        ]);

        const summary = await calculateOrderSummary(userId, null, req.session.appliedCoupon?.code);

        // Prepare cart items for display (compatible with EJS template)
        const displayItems = summary.orderItems.map(item => ({
            product: { _id: item.product, name: item.name, images: [item.image], discountedPrice: item.total / item.quantity - (summary.couponDiscount / summary.orderItems.length), originalPrice: item.price },
            quantity: item.quantity, selectedColor: item.color, selectedStorage: item.storage, selectedRam: item.RAM, variantId: item.variant
        }));

        const coupons = await Coupon.find({
            isActive: true,
            isDeleted: false,
            validFrom: { $lte: new Date() },
            validTill: { $gte: new Date() },
            $or: [{ usageLimit: null },
            { $expr: { $lt: ["$usedCount", "$usageLimit"] } }],
            usedBy: { $ne: userId }
        });

        res.render("user/checkout/checkout", {
            user: req.session.user, categories, walletBalance: wallet?.balance || 0,
            cartItemCount: summary.orderItems.length, userAddresses, orderId: 'ORD-' + uuidv4().slice(0, 8).toUpperCase(),
            coupons, cartItems: displayItems, subtotal: summary.subtotal, discount: summary.totalOfferDiscount,
            couponDiscount: summary.couponDiscount, appliedCoupon: summary.couponCode,
            isCouponApplied: !!summary.couponCode,
            shippingCharge: summary.shippingCharge, tax: 0, totalAmount: summary.finalPrice,
            currentPage: "checkout", isBuyNow: false, razorpayKey: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error("Error loading checkout:", error);
        req.session.errorMessage = error.message;
        res.redirect("/cart");
    }
};

const loadBuyNowCheckout = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { product: qProduct, variant: qVariant, qty: qQty } = req.query;

        let productId = qProduct || req.session.buyNowItem?.productId;
        let variantId = qVariant || req.session.buyNowItem?.variantId;
        let quantity = Math.max(1, parseInt(qQty) || req.session.buyNowItem?.quantity || 1);

        if (!productId || !variantId) return res.redirect('/products');
        req.session.buyNowItem = { productId, variantId, quantity };

        const [categories, userAddresses, wallet] = await Promise.all([
            Category.find({ IsDeleted: false }), Address.find({ userId }), Wallet.findOne({ user_id: userId })
        ]);

        const summary = await calculateOrderSummary(userId, req.session.buyNowItem, req.session.appliedCoupon?.code);

        const displayItems = summary.orderItems.map(item => ({
            product: { _id: item.product, name: item.name, images: [item.image], discountedPrice: item.total / item.quantity, originalPrice: item.price },
            quantity: item.quantity, selectedColor: item.color, selectedStorage: item.storage, selectedRam: item.RAM, variantId: item.variant
        }));

        const coupons = await Coupon.find({
            isActive: true, isDeleted: false,
            validFrom: { $lte: new Date() }, validTill: { $gte: new Date() },
            $or: [{ usageLimit: null }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }],
            usedBy: { $ne: userId }
        });

        res.render("user/checkout/checkout", {
            user: req.session.user, categories, walletBalance: wallet?.balance || 0,
            cartItemCount: 1, userAddresses, orderId: 'ORD-' + uuidv4().slice(0, 8).toUpperCase(),
            cartItems: displayItems, coupons, subtotal: summary.subtotal, discount: summary.totalOfferDiscount,
            couponDiscount: summary.couponDiscount, appliedCoupon: summary.couponCode,
            isCouponApplied: !!summary.couponCode,
            shippingCharge: summary.shippingCharge, tax: 0, totalAmount: summary.finalPrice,
            currentPage: "checkout", isBuyNow: true, razorpayKey: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error("Error loading buy-now checkout:", error);
        res.redirect('/products');
    }
};

const applyCoupon = async (req, res) => {
    try {
        const { code } = req.body, userId = req.session.user._id;
        const summary = await calculateOrderSummary(userId, req.session.buyNowItem, code.trim().toUpperCase());

        if (summary.couponCode) {
            req.session.appliedCoupon = { code: summary.couponCode, discount: summary.couponDiscount };
            res.json({ success: true, message: "Coupon applied", discount: summary.couponDiscount });
        } else {
            res.json({ success: false, message: "Coupon could not be applied to this order." });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || "Server error" });
    }
};

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user._id, { addressId, paymentMethod } = req.body;
        if (!addressId || !paymentMethod) return res.status(400).json({ success: false, message: "Missing required info" });

        const isOnline = ['razorpay', 'online'].includes(paymentMethod.toLowerCase());
        if (isOnline && (!req.session.razorpayPayment || !req.session.razorpayPayment.verified)) {
            return res.status(400).json({ success: false, message: "Payment not verified." });
        }

        const address = await Address.findById(addressId);
        if (!address) return res.status(400).json({ success: false, message: "Invalid address" });

        const summary = await calculateOrderSummary(userId, req.session.buyNowItem, req.session.appliedCoupon?.code);

        if (paymentMethod === 'COD' && summary.finalPrice > 30000) {
            return res.status(400).json({ success: false, message: "COD limited to ₹30,000." });
        }

        const orderId = 'ORD-' + uuidv4().slice(0, 8).toUpperCase();
        let transaction = null;

        if (paymentMethod === 'Wallet') {
            const wallet = await Wallet.findOne({ user_id: userId });
            if (!wallet || wallet.balance < summary.finalPrice) {
                return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
            }

            // Debit wallet
            wallet.balance -= summary.finalPrice;
            await wallet.save();

            // Create transaction record
            const now = new Date();
            transaction = new WalletTransactions({
                user: userId,
                Amount: -summary.finalPrice,
                Payment_status: "Debited",
                Wallet_id: wallet._id,
                Payment_date: now,
                Payment_time: now,
                Description: `Paid for Order #${orderId}`
            });
            await transaction.save();
        }

        const newOrder = await new Order({
            userId, orderId,
            items: summary.orderItems,
            shippingAddress: { fullName: address.name, phone: address.phone, houseName: address.houseName, locality: address.locality, city: address.city, state: address.state, pincode: address.pincode },
            paymentMethod: paymentMethod === 'Wallet' ? 'Wallet' : (isOnline ? 'Online' : 'COD'),
            paymentStatus: (paymentMethod !== 'COD') ? "Paid" : "Pending",
            orderStatus: "Pending", subtotal: summary.subtotal, discount: summary.totalOfferDiscount + summary.couponDiscount,
            couponDiscount: summary.couponDiscount, couponCode: summary.couponCode, shippingCharge: summary.shippingCharge, finalPrice: summary.finalPrice
        }).save();

        // Link transaction to the order
        if (transaction) {
            transaction.Order_id = newOrder._id;
            await transaction.save();
        }

        if (summary.couponCode) {
            const appliedCoupon = await Coupon.findOne({ code: summary.couponCode });
            if (appliedCoupon) {
                appliedCoupon.usedCount += 1;
                if (!appliedCoupon.usedBy.includes(userId)) {
                    appliedCoupon.usedBy.push(userId);
                }
                if (appliedCoupon.usageLimit && appliedCoupon.usedCount >= appliedCoupon.usageLimit) {
                    appliedCoupon.isActive = false;
                }
                await appliedCoupon.save();
            }
        }

        if (req.session.appliedCoupon) delete req.session.appliedCoupon;
        if (req.session.razorpayPayment) delete req.session.razorpayPayment;
        for (const item of summary.orderItems) await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: -item.quantity } });
        if (!req.session.buyNowItem) await Cart.findOneAndDelete({ User_id: userId });
        else delete req.session.buyNowItem;

        res.json({ success: true, orderId: newOrder.orderId });
    } catch (error) {
        console.error("Place Order Error:", error);
        res.status(500).json({ success: false, message: error.message || "Order placement failed." });
    }
};

const getOrderSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user._id;

        const [categories, order] = await Promise.all([
            Category.find({ IsDeleted: false }), Order.findOne({ orderId, userId })
        ]);

        if (!order) return res.redirect("/");

        res.render("user/checkout/orderSuccess", {
            user: req.session.user, userId, categories, order, cartItemCount: 0, currentPage: "checkout"
        });
    } catch (error) {
        res.redirect("/");
    }
};

const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const createRazorpayOrder = async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, message: "Unauthorized" });
        const userId = req.session.user._id;

        const summary = await calculateOrderSummary(userId, req.session.buyNowItem, req.session.appliedCoupon?.code);

        const razorpayOrder = await razorpayInstance.orders.create({
            amount: Math.round(Math.max(1, summary.finalPrice) * 100),
            currency: "INR",
            receipt: "order_rcpt_" + Date.now().toString(),
        });

        res.json({ success: true, order: razorpayOrder, key_id: process.env.RAZORPAY_KEY_ID });
    } catch (error) {
        console.error("Razorpay Order Creation Error:", error);
        res.status(500).json({ success: false, message: "Razorpay initialization failed: " + (error.message || "Unknown error") });
    }
};

const verifyRazorpayPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const secret = process.env.RAZORPAY_KEY_SECRET;

        const hmac = crypto.createHmac("sha256", secret);
        hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
        const generated_signature = hmac.digest("hex");

        if (generated_signature === razorpay_signature) {
            req.session.razorpayPayment = { orderId: razorpay_order_id, paymentId: razorpay_payment_id, verified: true };
            res.json({ success: true, message: "Payment verified successfully" });
        } else {
            res.status(400).json({ success: false, message: "Invalid payment signature" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const removeCoupon = async (req, res) => {
    try {
        delete req.session.appliedCoupon;
        res.json({ success: true, message: "Coupon removed" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const getPaymentFailed = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const [categories, cart] = await Promise.all([
            Category.find({ IsDeleted: false }), Cart.findOne({ User_id: userId })
        ]);
        const cartItemCount = cart ? cart.Items.length : 0;

        res.render('user/checkout/paymentFailed', {
            user: req.session.user, categories, cartItemCount,
            reason: req.query.reason || null, orderId: req.query.orderId || null,
            totalAmount: req.query.amount || null, currentPage: 'checkout',
            isBuyNow: req.query.isBuyNow === 'true'
        });
    } catch (error) {
        res.redirect('/checkout');
    }
};

const recordFailedOrder = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { addressId, reason, amount, isBuyNow } = req.body;

        if (!addressId) return res.status(400).json({ success: false, message: 'Address required' });

        const address = await Address.findById(addressId);
        if (!address) return res.status(400).json({ success: false, message: 'Address not found' });

        const buyNowItem = isBuyNow ? req.session.buyNowItem : null;
        const summary = await calculateOrderSummary(userId, buyNowItem, req.session.appliedCoupon?.code);

        const orderId = 'ORD-' + uuidv4().slice(0, 8).toUpperCase();

        const failedOrder = await new Order({
            userId, orderId,
            items: summary.orderItems,
            shippingAddress: {
                fullName: address.name, phone: address.phone, houseName: address.houseName,
                locality: address.locality, city: address.city, state: address.state, pincode: address.pincode
            },
            paymentMethod: 'Online',
            paymentStatus: 'Failed',
            orderStatus: 'Failed',
            subtotal: summary.subtotal,
            discount: summary.totalOfferDiscount + summary.couponDiscount,
            couponDiscount: summary.couponDiscount,
            couponCode: summary.couponCode,
            shippingCharge: summary.shippingCharge,
            finalPrice: summary.finalPrice,
            paymentFailureReason: reason || 'Payment declined'
        }).save();

        res.json({ success: true, orderId: failedOrder._id, displayOrderId: failedOrder.orderId });
    } catch (error) {
        console.error('recordFailedOrder error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

const retryPayment = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { orderId } = req.body;

        const order = await Order.findOne({ _id: orderId, userId, paymentStatus: 'Failed' });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found or already paid' });

        const razorpayOrder = await razorpayInstance.orders.create({
            amount: Math.round(Math.max(1, order.finalPrice) * 100),
            currency: 'INR',
            receipt: 'retry_' + order.orderId,
        });

        res.json({ success: true, order: razorpayOrder, key_id: process.env.RAZORPAY_KEY_ID, dbOrderId: order._id, amount: order.finalPrice });
    } catch (error) {
        console.error('retryPayment error:', error);
        res.status(500).json({ success: false, message: 'Could not initiate retry payment' });
    }
};

const confirmRetryPayment = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { dbOrderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        // Verify signature
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
        const generated = hmac.digest('hex');

        if (generated !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Payment verification failed' });
        }

        const order = await Order.findOne({ _id: dbOrderId, userId, paymentStatus: 'Failed' });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Mark as paid and restore to normal flow
        order.paymentStatus = 'Paid';
        order.orderStatus = 'Pending';
        order.paymentFailureReason = null;
        await order.save();

        // Deduct stock now that payment is confirmed
        for (const item of order.items) {
            await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: -item.quantity } });
        }

        res.json({ success: true, message: 'Payment successful! Your order is now confirmed.', orderId: order.orderId });
    } catch (error) {
        console.error('confirmRetryPayment error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

export {
    loadCheckout, loadBuyNowCheckout, placeOrder, getOrderSuccess, getPaymentFailed,
    createRazorpayOrder, verifyRazorpayPayment, applyCoupon, removeCoupon,
    recordFailedOrder, retryPayment, confirmRetryPayment
};