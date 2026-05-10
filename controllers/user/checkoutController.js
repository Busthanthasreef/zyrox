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
import { sendOrderConfirmationEmail } from "../../utils/emailHelper.js";

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

        // Check Category Status
        const category = await Category.findById(product.categoryId);
        if (!category || category.IsDeleted || category.IsActive === false) {
            throw new Error(`The category for "${product.productName}" is currently unavailable.`);
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
            
            // STRICT VALIDATION: If any item in cart is no longer active/available, we must fail the summary calculation
            if (!p || p.IsDeleted || p.status !== 'active') {
                throw new Error(`The product "${p?.productName || 'Unknown Product'}" is no longer available.`);
            }
            if (!v || v.IsDeleted || v.IsActive === false) {
                throw new Error(`The variant for "${p.productName}" is no longer available.`);
            }

            // Check Category Status
            const cat = await Category.findById(p.categoryId);
            if (!cat || cat.IsDeleted || cat.IsActive === false) {
                throw new Error(`The category for "${p.productName}" is currently unavailable.`);
            }

            if (v.stock < item.Quantity) {
                throw new Error(`Insufficient stock for ${p.productName}. Only ${v.stock} units left.`);
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
            const limitReached = coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit;
            if (!limitReached && !coupon.usedBy.includes(userId)) {
                couponCode = coupon.code;
                couponDiscount = coupon.discountType === 'percentage'
                    ? Math.min((subtotalAfterOffers * coupon.discountValue) / 100, coupon.maxDiscount || Infinity)
                    : coupon.discountValue;
            }
        }
    }

    const shippingCharge = subtotalAfterOffers > SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const finalPrice = Math.round(Math.max(0, subtotalAfterOffers - couponDiscount + shippingCharge) * 100) / 100;

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
        const { code } = req.body;
        const userId = req.session.user._id;

        if (!code || !code.trim()) {
            return res.json({ success: false, message: "Please enter a coupon code." });
        }

        const normalizedCode = code.trim().toUpperCase();

        // Step 1: Find the coupon at all
        const coupon = await Coupon.findOne({ code: normalizedCode, isDeleted: false });
        if (!coupon) {
            return res.json({ success: false, message: `Coupon "${normalizedCode}" does not exist.` });
        }

        // Step 2: Check active status
        if (!coupon.isActive) {
            return res.json({ success: false, message: "This coupon is currently inactive." });
        }

        // Step 3: Check validity window
        const now = new Date();
        if (coupon.validFrom > now) {
            const startDate = new Date(coupon.validFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            return res.json({ success: false, message: `This coupon is not valid yet. It starts from ${startDate}.` });
        }
        if (coupon.validTill < now) {
            return res.json({ success: false, message: "This coupon has expired." });
        }

        // Step 4: Check usage limit
        if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
            return res.json({ success: false, message: "This coupon's usage limit has been reached." });
        }

        // Step 5: Check if user already used it
        const alreadyUsed = coupon.usedBy.some(id => id.toString() === userId.toString());
        if (alreadyUsed) {
            return res.json({ success: false, message: "You have already used this coupon." });
        }

        // Step 6: Calculate summary and check minimum cart value
        const summary = await calculateOrderSummary(userId, req.session.buyNowItem, normalizedCode);

        if (!summary.couponCode) {
            // Coupon passed all checks but wasn't applied — only reason left is min cart value
            const minVal = coupon.minCartValue > 0 ? `₹${coupon.minCartValue}` : null;
            if (minVal) {
                return res.json({ success: false, message: `Minimum purchase of ${minVal} required to use this coupon.` });
            }
            return res.json({ success: false, message: "This coupon could not be applied to your current order." });
        }

        req.session.appliedCoupon = { code: summary.couponCode, discount: summary.couponDiscount };
        return res.json({ success: true, message: "Coupon applied successfully!", discount: summary.couponDiscount });

    } catch (error) {
        console.error("applyCoupon error:", error);
        res.status(500).json({ success: false, message: error.message || "Server error while applying coupon." });
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

        const appliedCouponCode = req.session.appliedCoupon?.code;
        const summary = await calculateOrderSummary(userId, req.session.buyNowItem, appliedCouponCode);

        // Strict Coupon Validation Check
        if (appliedCouponCode && !summary.couponCode) {
            return res.status(400).json({ 
                success: false, 
                message: "The applied coupon is no longer valid, has expired, or its usage limit has been reached. Please review your order." 
            });
        }

        if (paymentMethod === 'COD' && summary.finalPrice > 30000) {
            return res.status(400).json({ success: false, message: "COD limited to ₹30,000." });
        }

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
                Description: `Paid for Order` // Description will be updated with orderId below
            });
            await transaction.save();
        }

        let order;
        const existingFailedOrderId = req.session.lastFailedOrderId;

        if (existingFailedOrderId) {
            order = await Order.findOne({ _id: existingFailedOrderId, userId, orderStatus: 'Failed' });
        }

        if (order) {
            // Update existing failed order
            order.items = summary.orderItems;
            order.shippingAddress = { 
                fullName: address.name, phone: address.phone, houseName: address.houseName, 
                locality: address.locality, city: address.city, state: address.state, pincode: address.pincode 
            };
            order.paymentMethod = paymentMethod === 'Wallet' ? 'Wallet' : (isOnline ? 'Online' : 'COD');
            order.paymentStatus = (paymentMethod !== 'COD') ? "Paid" : "Pending";
            order.orderStatus = "Pending";
            order.subtotal = summary.subtotal;
            order.discount = summary.totalOfferDiscount + summary.couponDiscount;
            order.couponDiscount = summary.couponDiscount;
            order.couponCode = summary.couponCode;
            order.shippingCharge = summary.shippingCharge;
            order.finalPrice = summary.finalPrice;
            order.paymentFailureReason = null;
            await order.save();
            
            delete req.session.lastFailedOrderId;
        } else {
            // Create new order
            const orderId = 'ORD-' + uuidv4().slice(0, 8).toUpperCase();
            order = await new Order({
                userId, orderId,
                items: summary.orderItems,
                shippingAddress: { 
                    fullName: address.name, phone: address.phone, houseName: address.houseName, 
                    locality: address.locality, city: address.city, state: address.state, pincode: address.pincode 
                },
                paymentMethod: paymentMethod === 'Wallet' ? 'Wallet' : (isOnline ? 'Online' : 'COD'),
                paymentStatus: (paymentMethod !== 'COD') ? "Paid" : "Pending",
                orderStatus: "Pending", 
                subtotal: summary.subtotal, 
                discount: summary.totalOfferDiscount + summary.couponDiscount,
                couponDiscount: summary.couponDiscount, 
                couponCode: summary.couponCode, 
                shippingCharge: summary.shippingCharge, 
                finalPrice: summary.finalPrice
            }).save();
        }

        // Update transaction with the order ID and description
        if (transaction) {
            transaction.Order_id = order._id;
            transaction.Description = `Paid for Order #${order.orderId}`;
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

        // Send confirmation email (async, don't await to avoid blocking response)
        sendOrderConfirmationEmail(req.session.user.Email, order);

        res.json({ success: true, orderId: order.orderId });
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

        const appliedCouponCode = req.session.appliedCoupon?.code;
        const summary = await calculateOrderSummary(userId, req.session.buyNowItem, appliedCouponCode);

        // Strict Coupon Validation Check
        if (appliedCouponCode && !summary.couponCode) {
            return res.status(400).json({ 
                success: false, 
                message: "The applied coupon is no longer valid, has expired, or its usage limit has been reached. Please review your order." 
            });
        }

        // Razorpay limit check (typically 5,00,000 INR)
        const totalPaise = Math.round(Math.max(1, summary.finalPrice) * 100);
        if (totalPaise > 50000000) { // 5,00,000 * 100
            return res.status(400).json({ 
                success: false, 
                message: "Order amount exceeds Razorpay's maximum limit of ₹5,00,000. Please use a different payment method or contact support." 
            });
        }

        const razorpayOrder = await razorpayInstance.orders.create({
            amount: totalPaise,
            currency: "INR",
            receipt: "order_rcpt_" + Date.now().toString(),
        });

        res.json({ success: true, order: razorpayOrder, key_id: process.env.RAZORPAY_KEY_ID });
    } catch (error) {
        console.error("Razorpay Order Creation Error:", error);
        const errorMsg = error.error?.description || error.message || "Unknown error";
        res.status(500).json({ success: false, message: "Razorpay initialization failed: " + errorMsg });
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
        
        req.session.lastFailedOrderId = failedOrder._id;

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

        // Check availability and stock for all items
        for (const item of order.items) {
            const variant = await Variant.findById(item.variant).populate('productId');
            if (!variant || variant.IsDeleted || variant.IsActive === false) {
                return res.status(400).json({ success: false, message: `Item "${item.name}" is no longer available.` });
            }
            if (!variant.productId || variant.productId.IsDeleted || variant.productId.status !== 'active') {
                return res.status(400).json({ success: false, message: `Product "${item.name}" is no longer available.` });
            }
            const cat = await Category.findById(variant.productId.categoryId);
            if (!cat || cat.IsDeleted || cat.IsActive === false) {
                return res.status(400).json({ success: false, message: `Category for "${item.name}" is currently unavailable.` });
            }
            if (variant.stock < item.quantity) {
                return res.status(400).json({ success: false, message: `Only ${variant.stock} units of "${item.name}" are available. You need ${item.quantity}.` });
            }
        }

        const totalPaise = Math.round(Math.max(1, order.finalPrice) * 100);
        if (totalPaise > 50000000) {
            return res.status(400).json({ 
                success: false, 
                message: "Order amount exceeds Razorpay's maximum limit of ₹5,00,000." 
            });
        }

        const razorpayOrder = await razorpayInstance.orders.create({
            amount: totalPaise,
            currency: 'INR',
            receipt: 'retry_' + order.orderId,
        });

        res.json({ success: true, order: razorpayOrder, key_id: process.env.RAZORPAY_KEY_ID, dbOrderId: order._id, amount: order.finalPrice });
    } catch (error) {
        console.error('retryPayment error:', error);
        const errorMsg = error.error?.description || error.message || "Could not initiate retry payment";
        res.status(500).json({ success: false, message: errorMsg });
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

        if (req.session.lastFailedOrderId && req.session.lastFailedOrderId.toString() === order._id.toString()) {
            delete req.session.lastFailedOrderId;
        }

        // Deduct stock now that payment is confirmed
        for (const item of order.items) {
            const variant = await Variant.findById(item.variant);
            if (!variant || variant.stock < item.quantity) {
                // If we reach here, user already paid but stock ran out in last seconds. 
                // We proceed with order but log error/admin notify. 
                // For this project, we'll still deduct even if it goes negative or just cap at 0
                await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: -item.quantity } });
            } else {
                await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: -item.quantity } });
            }
        }

        // Send confirmation email
        sendOrderConfirmationEmail(req.session.user.Email, order);

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