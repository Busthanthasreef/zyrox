import Order from '../../models/order.js';
import User from '../../models/user.js';
import Variant from '../../models/variant.js';

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
        res.status(500).render('error/500', { message: "ഓർഡറുകൾ ലോഡ് ചെയ്യുന്നതിൽ പിശക് സംഭവിച്ചു." });
    }
};

const cancelOrder = async (req, res) => {
    try {
        const { orderId, reason } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        if (order.orderStatus === 'Delivered') {
            return res.json({ success: false, message: "Cannot cancel a delivered order" });
        }

        order.orderStatus = 'Cancellation Requested';
        order.cancellationReason = reason;

        // Sync individual item statuses
        order.items.forEach(item => {
            if (!['Cancelled', 'Returned'].includes(item.status)) {
                item.status = 'Cancellation Requested';
                item.cancellationReason = reason; 
            }
        });

        await order.save();
        res.json({ success: true, message: "Cancellation request submitted for the entire order" });
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

        if (item.status === 'Delivered') {
            return res.json({ success: false, message: "Cannot cancel a delivered item" });
        }

        // Mark the item as cancellation requested
        item.status = 'Cancellation Requested';
        item.cancellationReason = reason;

        // Count items that are still "active" (not already cancelled/returned)
        // If this is the only active item, escalate the order status too
        const terminalStatuses = ['Cancelled', 'Returned'];
        const activeItems = order.items.filter(
            i => !terminalStatuses.includes(i.status) && String(i._id) !== String(itemId)
        );

        if (activeItems.length === 0) {
            // All remaining items are now being cancelled — update order status as well
            order.orderStatus = 'Cancellation Requested';
            order.cancellationReason = reason;
        }

        await order.save();

        res.json({ success: true, message: "Item cancellation requested successfully" });
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