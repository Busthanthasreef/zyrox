import Cart from "../../models/cart.js";
import Address from "../../models/address.js";
import Product from "../../models/product.js";
import Variant from "../../models/variant.js";
import Order from "../../models/order.js";
import categorySchema from "../../models/category.js";
import couponSchema from "../../models/coupon.js";

import { v4 as uuidv4 } from 'uuid';
import Razorpay from "razorpay";
import crypto from "crypto";

const loadCheckout = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const [categories, userAddresses, cart] = await Promise.all([
            categorySchema.find({ IsDeleted: false }),
            Address.find({ userId }),
            Cart.findOne({ User_id: userId }).populate({
                path: "Items.Product_id",
                model: "Product"
            }).populate({
                path: "Items.Variant_id",
                model: "Variant"
            })
        ]);

        if (!cart || cart.Items.length === 0) {
            return res.redirect("/cart");
        }

        // ── STAGE-SPECIFIC VALIDATION ────────────────────────────────────
        // Check if any items in cart are out of stock or unavailable
        for (const item of cart.Items) {
            const product = item.Product_id;
            const variant = item.Variant_id;

            if (!product || !variant || product.IsDeleted || variant.IsDeleted || product.status !== 'active' || !variant.IsActive) {
                req.session.errorMessage = `The item "${product?.productName || 'Unknown Product'}" is no longer available. Please remove it from your cart.`;
                return res.redirect("/cart");
            }

            if (variant.stock < item.Quantity) {
                req.session.errorMessage = `The quantity requested for "${product.productName}" exceeds available stock (${variant.stock} left).`;
                return res.redirect("/cart");
            }
        }
        // ──────────────────────────────────────────────────────────────

        // Transform cart items for the view - with safety checks
        const cartItems = cart.Items.filter(item => item.Product_id && item.Variant_id).map(item => ({
            product: {
                _id: item.Product_id._id,
                name: item.Product_id.productName,
                images: item.Variant_id.images,
                discountedPrice: item.Variant_id.price,
                originalPrice: item.Variant_id.price + 500,
            },
            quantity: item.Quantity,
            selectedColor: item.Variant_id.color,
            selectedStorage: item.Variant_id.storage,
            selectedRam: item.Variant_id.RAM,
            variantId: item.Variant_id._id
        }));

        if (cartItems.length === 0) {
            req.session.errorMessage = "No valid items found in your cart.";
            return res.redirect("/cart");
        }

        const subtotal = cartItems.reduce((acc, item) => acc + (item.product.discountedPrice * item.quantity), 0);
        let couponDiscount = 0;
        let appliedCoupon = null;
        if (req.session.appliedCoupon) {
            appliedCoupon = req.session.appliedCoupon.code;
            couponDiscount = req.session.appliedCoupon.discount;
        }

        const discount = 0;
        const shippingCharge = subtotal > 500 ? 0 : 50;
        const tax = 0; 
        const totalAmount = subtotal - discount - couponDiscount + shippingCharge + tax;

        const coupons = await couponSchema.find({ isActive: true, isDeleted: false });

        const orderId = 'ORD-' + uuidv4().slice(0, 8).toUpperCase();

        res.render("user/checkout/checkout", {
            user: req.session.user,
            categories,
            cartItemCount: cart ? cart.Items.length : 0,
            userAddresses,
            orderId,
            coupons,
            cartItems,
            subtotal,
            discount,
            couponDiscount,
            appliedCoupon,
            shippingCharge,
            tax,
            totalAmount,
            currentPage: "checkout",
            razorpayKey: process.env.RAZORPAY_KEY_ID 
        });
    } catch (error) {
        console.error("Error loading checkout:", error);
        req.session.errorMessage = "An unexpected error occurred while loading checkout.";
        res.redirect("/cart");
    }
};

/* ── BUY NOW CHECKOUT (single item, bypasses cart) ── */
const loadBuyNowCheckout = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { product: productId, variant: variantId, qty } = req.query;
        const quantity = Math.max(1, parseInt(qty) || 1);

        if (!productId || !variantId) {
            return res.redirect('/products');
        }

        const [categories, userAddresses, product, variant] = await Promise.all([
            categorySchema.find({ IsDeleted: false }),
            Address.find({ userId }),
            Product.findById(productId),
            Variant.findById(variantId)
        ]);

        if (!product || !variant || variant.stock < quantity) {
            return res.redirect('/products');
        }

        const cartItems = [{
            product: {
                _id: product._id,
                name: product.productName,
                images: variant.images,
                discountedPrice: variant.price,
                originalPrice: variant.price + 500,
            },
            quantity,
            selectedColor: variant.color,
            selectedStorage: variant.storage,
            selectedRam: variant.RAM,
            variantId: variant._id
        }];

        // Store in session so placeOrder can use it
        req.session.buyNowItem = { productId, variantId, quantity };

        const subtotal = variant.price * quantity;
        
        // Handle applied coupon in Buy Now
        let couponDiscount = 0;
        let appliedCoupon = null;
        if (req.session.appliedCoupon) {
            appliedCoupon = req.session.appliedCoupon.code;
            couponDiscount = req.session.appliedCoupon.discount;
        }

        const discount = 0;
        const shippingCharge = subtotal > 500 ? 0 : 50;
        const tax = 0;
        const totalAmount = subtotal - discount - couponDiscount + shippingCharge + tax;
        const orderId = 'ORD-' + uuidv4().slice(0, 8).toUpperCase();

        // Get cart item count for navbar
        const cart = await Cart.findOne({ User_id: userId });
        const coupons = await couponSchema.find({ isActive: true, isDeleted: false });

        res.render("user/checkout/checkout", {
            user: req.session.user,
            categories,
            cartItemCount: cart ? cart.Items.length : 0,
            userAddresses,
            orderId,
            cartItems,
            coupons,
            subtotal,
            discount,
            couponDiscount,
            appliedCoupon,
            shippingCharge,
            tax,
            totalAmount,
            currentPage: "checkout",
            isBuyNow: true,
            razorpayKey: process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy'
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

        const coupon = await couponSchema.findOne({ 
            code: code.trim().toUpperCase(),
            isActive: true,
            isDeleted: false,
            validFrom: { $lte: new Date() },
            validTill: { $gte: new Date() }
        });

        if (!coupon) {
            return res.json({ success: false, message: "Invalid or expired coupon" });
        }

        // Check min cart value
        const cart = await Cart.findOne({ User_id: userId }).populate('Items.Variant_id');
        let subtotal = 0;
        if (req.session.buyNowItem) {
            const variant = await Variant.findById(req.session.buyNowItem.variantId);
            subtotal = variant.price * req.session.buyNowItem.quantity;
        } else {
            subtotal = cart.Items.reduce((acc, item) => acc + (item.Variant_id.price * item.Quantity), 0);
        }

        if (subtotal < coupon.minCartValue) {
            return res.json({ success: false, message: `Minimum cart value of ₹${coupon.minCartValue} required for this coupon.` });
        }

        // Calculate discount
        let discount = 0;
        if (coupon.discountType === 'percentage') {
            discount = (subtotal * coupon.discountValue) / 100;
            if (coupon.maxDiscount) {
                discount = Math.min(discount, coupon.maxDiscount);
            }
        } else {
            discount = coupon.discountValue;
        }

        req.session.appliedCoupon = {
            code: coupon.code,
            discount: discount
        };

        res.json({ success: true, message: "Coupon applied successfully", discount });
    } catch (error) {
        console.error("Error applying coupon:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { addressId, paymentMethod } = req.body;

        if (!addressId || !paymentMethod) {
            return res.status(400).json({ success: false, message: "Missing address or payment method" });
        }

        // Security check for Razorpay
        if (paymentMethod.toLowerCase() === 'razorpay' || paymentMethod.toLowerCase() === 'online') {
            if (!req.session.razorpayPayment || !req.session.razorpayPayment.verified) {
                return res.status(400).json({ success: false, message: "Payment verification missing. Please pay first." });
            }
            // Clear verification after use
            delete req.session.razorpayPayment;
        }

        const address = await Address.findById(addressId);
        if (!address) {
            return res.status(400).json({ success: false, message: "Invalid address" });
        }

        let orderItems, subtotal;
        if (req.session.buyNowItem) {
            // ── BUY NOW: single item from session ────────────────────────────
            const { productId, variantId, quantity } = req.session.buyNowItem;

            const product = await Product.findById(productId);
            const variant = await Variant.findById(variantId);

            const isActiveProduct = product?.status === 'active' && product?.IsDeleted !== true;
            const isActiveVariant = variant?.IsActive !== false && variant?.IsDeleted !== true;

            if (!product || !variant || !isActiveProduct || !isActiveVariant) {
                return res.status(400).json({ success: false, message: "Product/variant not found or unavailable" });
            }
            if (variant.stock < quantity) {
                return res.status(400).json({ success: false, message: `Insufficient stock. Available: ${variant.stock}` });
            }

            orderItems = [{
                product: product._id,
                variant: variant._id,
                name: product.productName,
                image: variant.images[0],
                quantity,
                price: variant.price,
                total: variant.price * quantity,
                color: variant.color,
                storage: variant.storage,
                RAM: variant.RAM,
            }];

            subtotal = variant.price * quantity;
        } else {
            // ── NORMAL CART CHECKOUT ──────────────────────────────────────────
            const cart = await Cart.findOne({ User_id: userId }).populate({
                path: "Items.Product_id",
                model: "Product"
            }).populate({
                path: "Items.Variant_id",
                model: "Variant"
            });

            if (!cart || cart.Items.length === 0) {
                return res.status(400).json({ success: false, message: "Cart is empty" });
            }

            // Check stock first
            for (const item of cart.Items) {
                const vari = item.Variant_id;
                if (!vari || vari.stock < item.Quantity) {
                    return res.status(400).json({ 
                        success: false, 
                        message: `Insufficient stock for ${item.Product_id?.productName || 'one of the items'}.` 
                    });
                }
            }

            orderItems = cart.Items.map(item => ({
                product: item.Product_id._id,
                variant: item.Variant_id._id,
                name: item.Product_id.productName,
                image: item.Variant_id.images[0],
                quantity: item.Quantity,
                price: item.Variant_id.price,
                total: item.Variant_id.price * item.Quantity,
                color: item.Variant_id.color,
                storage: item.Variant_id.storage,
                RAM: item.Variant_id.RAM,
            }));

            subtotal = orderItems.reduce((acc, item) => acc + item.total, 0);
        }

        let couponDiscount = 0;
        let couponCode = null;
        if (req.session.appliedCoupon) {
            couponDiscount = req.session.appliedCoupon.discount;
            couponCode = req.session.appliedCoupon.code;
            delete req.session.appliedCoupon;
        }

        const discount = 0; // Other discounts
        const shippingCharge = subtotal > 500 ? 0 : 50;
        const tax = 0;
        const finalPrice = subtotal - discount - couponDiscount + shippingCharge + tax;
        const orderId = 'ORD-' + uuidv4().slice(0, 8).toUpperCase();

        const newOrder = new Order({
            userId,
            orderId,
            items: orderItems,
            shippingAddress: {
                fullName: address.name,
                phone: address.phone,
                houseName: address.houseName,
                locality: address.locality,
                city: address.city,
                state: address.state,
                pincode: address.pincode,
                type: address.addressType,
            },
            paymentMethod: (paymentMethod.toLowerCase() === 'razorpay' || paymentMethod.toLowerCase() === 'online') ? 'Online' : (paymentMethod === 'Wallet' ? 'Wallet' : 'COD'),
            paymentStatus: (paymentMethod.toLowerCase() === 'razorpay' || paymentMethod.toLowerCase() === 'online' || paymentMethod.toLowerCase() === 'wallet') ? "Paid" : "Pending",
            orderStatus: "Pending",
            subtotal,
            discount: discount + couponDiscount,
            couponDiscount,
            couponCode,
            shippingCharge,
            finalPrice,
        });

        // ── SAVE ORDER ATOMICALLY ──────────────────────────────────────────
        await newOrder.save();

        // ── DEDUCT STOCK ONLY AFTER SUCCESSFUL SAVE ───────────────────────
        if (req.session.buyNowItem) {
            const { variantId, quantity } = req.session.buyNowItem;
            await Variant.findByIdAndUpdate(variantId, { $inc: { stock: -quantity } });
            delete req.session.buyNowItem;
        } else {
            for (const item of orderItems) {
                await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: -item.quantity } });
            }
            // Clear cart
            await Cart.findOneAndDelete({ User_id: userId });
        }

        res.json({ success: true, orderId: newOrder.orderId });

    } catch (error) {
        console.error("Error placing order:", error.message);
        res.status(500).json({ success: false, message: "Order placement failed. " + error.message });
    }
};



const getOrderSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user._id;

        const [categories, order] = await Promise.all([
            categorySchema.find({ IsDeleted: false }),
            Order.findOne({ orderId, userId })
        ]);

        if (!order) {
            return res.redirect("/");
        }

        res.render("user/checkout/orderSuccess", {
            user: req.session.user,
            userId,
            categories,
            order,
            cartItemCount: 0,
            currentPage: "checkout"
        });
    } catch (error) {
        console.error("Error loading success page:", error);
        res.redirect("/");
    }
};


const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET 
});

const createRazorpayOrder = async (req, res) => {
    try {
        const userId = req.session.user._id;
        
        // RECALCULATE AMOUNT FROM SERVER (Security: don't trust frontend amount)
        let subtotal = 0;
        if (req.session.buyNowItem) {
            const { variantId, quantity } = req.session.buyNowItem;
            const variant = await Variant.findById(variantId);
            if (!variant || variant.stock < quantity) {
                return res.status(400).json({ success: false, message: "Product no longer available in this quantity." });
            }
            subtotal = variant.price * quantity;
        } else {
            const cart = await Cart.findOne({ User_id: userId }).populate('Items.Variant_id');
            if (!cart || cart.Items.length === 0) {
                return res.status(400).json({ success: false, message: "Cart is empty." });
            }
            for (const item of cart.Items) {
                if (!item.Variant_id || item.Variant_id.stock < item.Quantity) {
                    return res.status(400).json({ success: false, message: `Insufficient stock for ${item.Product_id?.productName || 'one of the items'}.` });
                }
                subtotal += (item.Variant_id.price * item.Quantity);
            }
        }

        let couponDiscount = 0;
        if (req.session.appliedCoupon) {
            couponDiscount = req.session.appliedCoupon.discount;
        }

        const discount = 0;
        const shippingCharge = subtotal > 500 ? 0 : 50;
        const tax = 0;
        const finalPrice = subtotal - discount - couponDiscount + shippingCharge + tax;

        const options = {
            amount: Math.round(finalPrice * 100), // convert to paise
            currency: "INR",
            receipt: "order_rcpt_" + Date.now().toString(),
        };

        const razorpayOrder = await razorpayInstance.orders.create(options);
        res.json({ 
            success: true, 
            order: razorpayOrder, 
            key_id: process.env.RAZORPAY_KEY_ID 
        });
    } catch (error) {
        console.error("Error creating razorpay order:", error);
        res.status(500).json({ success: false, message: "Could not initiate Razorpay order." });
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
            // Secure the session so placeOrder knows it was verified
            req.session.razorpayPayment = {
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                verified: true
            };
            res.json({ success: true, message: "Payment verified successfully" });
        } else {
            res.status(400).json({ success: false, message: "Invalid payment signature" });
        }
    } catch (error) {
        console.error("Error verifying payment:", error);
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

export { 
    loadCheckout, 
    loadBuyNowCheckout, 
    placeOrder, 
    getOrderSuccess, 
    createRazorpayOrder, 
    verifyRazorpayPayment,
    applyCoupon,
    removeCoupon
};