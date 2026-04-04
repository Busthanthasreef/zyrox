import Cart from "../../models/cart.js";
import Address from "../../models/address.js";
import Product from "../../models/product.js";
import Variant from "../../models/variant.js";
import Order from "../../models/order.js";
import categorySchema from "../../models/category.js";

import { v4 as uuidv4 } from 'uuid';


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

        // Transform cart items for the view
        const cartItems = cart.Items.map(item => ({
            product: {
                _id: item.Product_id._id,
                name: item.Product_id.productName,
                images: item.Variant_id.images,
                discountedPrice: item.Variant_id.price,
                originalPrice: item.Variant_id.price + 500, // Placeholder for price before discount
            },
            quantity: item.Quantity,
            selectedColor: item.Variant_id.color,
            selectedStorage: item.Variant_id.storage,
            selectedRam: item.Variant_id.RAM,
            variantId: item.Variant_id._id
        }));

        const subtotal = cartItems.reduce((acc, item) => acc + (item.product.discountedPrice * item.quantity), 0);
        const discount = 0;
        const couponDiscount = 0;
        const shippingCharge = subtotal > 500 ? 0 : 50;
        const tax = 0; // Tax calculation can be added here if needed
        const totalAmount = subtotal - discount - couponDiscount + shippingCharge + tax;



        const orderId = 'ORD-' + uuidv4().slice(0, 8).toUpperCase();


        res.render("user/checkout/checkout", {
            user: req.session.user,
            categories,
            cartItemCount: cart ? cart.Items.length : 0,
            userAddresses,
            orderId,
            cartItems,
            subtotal,
            discount,
            couponDiscount,
            appliedCoupon: null,
            shippingCharge,
            tax,
            totalAmount,
            currentPage: "checkout"
        });
    } catch (error) {
        console.error("Error loading checkout:", error);
        res.redirect("/cart");
    }
};

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { addressId, paymentMethod  } = req.body;

        if (!addressId || !paymentMethod) {
            return res.status(400).json({ success: false, message: "Missing address or payment method" });
        }

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
        
        const address = await Address.findById(addressId);
        if (!address) {
            return res.status(400).json({ success: false, message: "Invalid address" });
        }

        
        const orderItems = cart.Items.map(item => ({
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


        const subtotal = orderItems.reduce((acc, item) => acc + item.total, 0);
        const discount = 0;
        const couponDiscount = 0;
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
            paymentMethod,
            paymentStatus: paymentMethod === "COD" ? "Pending" : "Pending",
            orderStatus: "Order Placed",
            subtotal,
            discount,
            couponDiscount,
            shippingCharge,
            finalPrice,
        });

        // Check stock availability for all items first
        for (const item of cart.Items) {
            const variantId = item.Variant_id._id || item.Variant_id;
            const variant = await Variant.findById(variantId);
            if (!variant) {
                return res.status(400).json({ success: false, message: `Variant for ${item.Product_id.productName} not found` });
            }
            if (variant.stock < item.Quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${item.Product_id.productName}. (Available: ${variant.stock})`
                });
            }
        }
        
        // Update stock
        for (const item of cart.Items) {
            const variantId = item.Variant_id._id || item.Variant_id;
            await Variant.findByIdAndUpdate(variantId, {
                $inc: { stock: -item.Quantity }
            });
        }
        
        await newOrder.save();
        
        // Clear cart
        await Cart.findOneAndDelete({ User_id: userId });
        
        res.json({ success: true, orderId: newOrder.orderId });

    } catch (error) {
        console.error("Error placing order:", error.message);
        res.status(500).json({ success: false, message: " server error" });
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

export { loadCheckout, placeOrder, getOrderSuccess };