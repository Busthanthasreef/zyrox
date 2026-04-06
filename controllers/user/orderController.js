import Order from '../../models/order.js'; // Ensure you are importing the Model, not just the Schema
import User from '../../models/user.js';

const getOrdersPage = async (req, res) => {
    try {
        const userId = req.session.user._id;

        const page = parseInt(req.query.page) || 1;
        const limit = 5;
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
        await order.save();

        res.json({ success: true, message: "Order cancelled successfully" });
    } catch (error) {
        console.error("Error cancelling order:", error);
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
        await order.save();

        res.json({ success: true, message: "Return request submitted successfully" });
    } catch (error) {
        console.error("Error returning order:", error);
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

    
        const order = await Order.findById(orderId)

        if (!order) {
            console.log('order not found')
            return res.status(404).render('error/404', { message: "Order not found",isAdminPath:false });
        }

        res.render('user/orders/orderDetails', {
            user: user,
            order: order,
            pageTitle: 'Order Details'


        });

    } catch (error) {
        console.error("Error in getOrdersDetailsPage:", error);
        res.status(500).render('error/404', { message: "error found",isAdminPath:false });
    }
};

export {
    getOrdersPage,
    cancelOrder,
    returnOrder,
    getOrdersDetailsPage
};