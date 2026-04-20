import Order from '../../models/order.js';
import User from '../../models/user.js';
import Variant from '../../models/variant.js';
import Wallet from '../../models/wallet.js';
import WalletTransactions from '../../models/walletTransactions.js';
const getOrdersPage = async (req, res) => {
    try {
        const userId = req.session.user._id;

        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const allOrders = await Order.find({ userId: userId }).sort({ createdAt: -1 });
        const orders = allOrders.slice(skip, skip + limit);

        const totalOrdersCount = allOrders.length;
        const totalPages = Math.ceil(totalOrdersCount / limit);

        const totalItems = allOrders.reduce((acc, order) => {
            const itemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
            return acc + itemsCount;
        }, 0);

        const totalSpent = allOrders.reduce((acc, order) => {
            return acc + (order.totalPrice || 0);
        }, 0);

        res.render('user/orders/myOrders', {
            user: req.session.user,
            orders: orders,
            totalOrders: totalOrdersCount,
            totalItems: totalItems,
            totalSpent: totalSpent.toLocaleString('en-IN'),
            pageTitle: 'My Orders',
            page,
            totalPages
        });

    } catch (error) {
        console.error("Error in getOrdersPage:", error);
        res.status(500).render('error/404', { message: "error found" });
    }
};

const cancelOrder = async (req, res) => {
    try {
        const { orderId, reason } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        if (['Delivered', 'Cancelled', 'Returned'].includes(order.orderStatus)) {
            return res.json({ success: false, message: `Cannot cancel an order that is ${order.orderStatus}` });
        }

        order.orderStatus = 'Cancelled';
        order.cancellationReason = reason;

        // Restore stock and sync item statuses
        for (const item of order.items) {
            if (!['Cancelled', 'Returned'].includes(item.status)) {
                if (item.variant) {
                    await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } });
                }
                item.status = 'Cancelled';
                item.cancellationReason = reason; 
            }
        }

        // Refund Logic
        if (order.paymentStatus === 'Paid' && (order.paymentMethod === 'Online' || order.paymentMethod === 'Wallet')) {
            const refundAmount = order.finalPrice;
            const userId = order.userId;

            let wallet = await Wallet.findOne({ user_id: userId });
            if (!wallet) {
                wallet = await Wallet.create({ user_id: userId, balance: 0 });
            }

            wallet.balance += refundAmount;
            await wallet.save();

            const newTransaction = new WalletTransactions({
                user: userId,
                Amount: refundAmount,
                Payment_status: "Success",
                Wallet_id: wallet._id,
                Payment_date: new Date(),
                Payment_time: new Date(),
                Order_id: order._id,
                Description: `Refund for Cancelled Order #${order.orderId}`
            });
            await newTransaction.save();
            
            order.paymentStatus = 'Refunded';
        }

        await order.save();
        res.json({ success: true, message: "Order cancelled successfully and stock restored." });
    } catch (error) {
        console.error("Error cancelling order:", error);
        res.json({ success: false, message: "Server error" });
    }
};

const cancelItem = async (req, res) => {
    try {
        const { orderId, itemId, reason } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        const item = order.items.id(itemId);
        if (!item) {
            return res.json({ success: false, message: "Item not found" });
        }

        if (['Delivered', 'Cancelled', 'Returned'].includes(item.status)) {
            return res.json({ success: false, message: `Cannot cancel an item that is already ${item.status}` });
        }

        // Restore stock for this item
        if (item.variant) {
            await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } });
        }

        item.status = 'Cancelled';
        item.cancellationReason = reason;

        const terminalStatuses = ['Cancelled', 'Returned'];
        const activeItems = order.items.filter(i => !terminalStatuses.includes(i.status));

        if (activeItems.length === 0) {
            order.orderStatus = 'Cancelled';
            order.cancellationReason = reason;
        }

        // Refund Logic (Item Level)
        if (order.paymentStatus === 'Paid' && (order.paymentMethod === 'Online' || order.paymentMethod === 'Wallet')) {
            const userId = order.userId;
            
            // Calculate proportional refund
            let refundAmount = item.total;
            if (order.couponDiscount > 0 && order.subtotal > 0) {
                const proportion = item.total / order.subtotal;
                const itemCouponDiscount = order.couponDiscount * proportion;
                refundAmount = item.total - itemCouponDiscount;
            }

            let wallet = await Wallet.findOne({ user_id: userId });
            if (!wallet) {
                wallet = await Wallet.create({ user_id: userId, balance: 0 });
            }

            wallet.balance += refundAmount;
            await wallet.save();

            const newTransaction = new WalletTransactions({
                user: userId,
                Amount: refundAmount,
                Payment_status: "Success",
                Wallet_id: wallet._id,
                Payment_date: new Date(),
                Payment_time: new Date(),
                Order_id: order._id,
                Description: `Refund for Cancelled item: ${item.name} in Order #${order.orderId}`
            });
            await newTransaction.save();

            if (activeItems.length === 0) {
                order.paymentStatus = 'Refunded';
            }
        }

        await order.save();
        res.json({ success: true, message: "Item cancelled successfully and stock restored." });
    } catch (error) {
        console.error("Error cancelling item:", error); 
        res.json({ success: false, message: "Server error" });
    }
};

const returnOrder = async (req, res) => {
    try {
        const { orderId, reason } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        if (order.orderStatus !== 'Delivered') {
            return res.json({ success: false, message: "Order must be delivered to be returned" });
        }

        // 7-day return window check
        const deliveredDate = order.deliveredAt || order.updatedAt;
        const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveredDate).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceDelivery > 7) {
            return res.json({ success: false, message: "Return window expired. Returns are only accepted within 7 days of delivery." });
        }

        order.orderStatus = 'Return Requested';
        order.returnReason = reason;

        // Sync individual item statuses
        order.items.forEach(item => {
            if (!['Cancelled', 'Returned'].includes(item.status)) {
                item.status = 'Return Requested';
                item.returnReason = reason; 
            }
        });

        await order.save();

        res.json({ success: true, message: "Return request submitted successfully" });
    } catch (error) {
        console.error("Error returning order:", error);
        res.json({ success: false, message: "Server error" });
    }
};

const returnItem = async (req, res) => {
    try {
        const { orderId, itemId, reason } = req.body;

        const order = await Order.findById(orderId);
        if (!order) return res.json({ success: false, message: "Order not found" });

        const item = order.items.id(itemId);
        if (!item) return res.json({ success: false, message: "Item not found" });

        if (item.status !== 'Delivered') {
            return res.json({ success: false, message: "Only delivered items can be returned" });
        }

        // 7-day return window check
        const deliveredDate = item.deliveredAt || order.deliveredAt || order.updatedAt;
        const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveredDate).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceDelivery > 7) {
            return res.json({ success: false, message: "Return window expired. Returns are only accepted within 7 days of delivery." });
        }

        item.status = 'Return Requested';
        item.returnReason = reason;

        const terminalStatuses = ['Cancelled', 'Returned'];
        const activeItems = order.items.filter(
            i => !terminalStatuses.includes(i.status) && String(i._id) !== String(itemId)
        );

        if (activeItems.length === 0) {
            order.orderStatus = 'Return Requested';
            order.returnReason = reason;
        }

        await order.save();
        res.json({ success: true, message: "Item return requested successfully" });
    } catch (error) {
        console.error("Error returning item:", error);
        res.json({ success: false, message: "Server error" });
    }
};

const getOrdersDetailsPage = async (req, res) => {
    try {
        const orderId = req.query.id;
        const user = req.session.user;

        if (!orderId) {
            return res.redirect('/orders');
        }

        const order = await Order.findById(orderId);

        if (!order) {
            console.log('order not found');
            return res.status(404).render('error/404', { message: "Order not found", isAdminPath: false });
        }

        // Fetch live stock for each variant so the view can show stock status
        const variantIds = order.items.map(i => i.variant).filter(Boolean);
        const variants = await Variant.find({ _id: { $in: variantIds } }, 'stock');
        const stockMap = {};
        variants.forEach(v => { stockMap[String(v._id)] = v.stock; });

        res.render('user/orders/orderDetails', {
            user: user,
            order: order,
            stockMap,
            pageTitle: 'Order Details'
        });

    } catch (error) {
        console.error("Error in getOrdersDetailsPage:", error);
        res.status(500).render('error/404', { message: "error found", isAdminPath: false });
    }
};

const getInvoicePage = async (req, res) => {
    try {
        const orderId = req.query.id;
        const order = await Order.findById(orderId).populate('userId');

        if (!order) {
            return res.status(404).send('Order not found');
        }

        res.render('user/orders/invoice', {
            order: order,
            user: req.session.user
        });
    } catch (error) {
        console.error("Error in getInvoicePage:", error);
        res.status(500).send('Internal Server Error');
    }
};

export {
    getOrdersPage,
    cancelOrder,
    cancelItem,
    returnItem,
    returnOrder,
    getOrdersDetailsPage,
    getInvoicePage
};