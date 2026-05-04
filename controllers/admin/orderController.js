import Order from "../../models/order.js";
import User from "../../models/user.js";
import Variant from "../../models/variant.js";
import Wallet from "../../models/wallet.js";
import WalletTransactions from "../../models/walletTransactions.js";

const getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";
        const status = req.query.status || "";
        const paymentMethod = req.query.paymentMethod || "";
        const paymentStatus = req.query.paymentStatus || "";
        const sort = req.query.sort || "newest";

        let sortQuery = { createdAt: -1 };
        if (sort === "oldest") sortQuery = { createdAt: 1 };
        else if (sort === "priceHigh") sortQuery = { finalPrice: -1 };
        else if (sort === "priceLow") sortQuery = { finalPrice: 1 };

        let query = {};

        if (status) {
            query.$or = [
                { orderStatus: status },
                { "items.status": status }
            ];
        }
        if (paymentMethod) query.paymentMethod = paymentMethod;
        if (paymentStatus) query.paymentStatus = paymentStatus;

        if (search) {
            const searchConditions = [
                { orderId: { $regex: search, $options: "i" } },
                { paymentMethod: { $regex: search, $options: "i" } },
                { orderStatus: { $regex: search, $options: "i" } }
            ];

            const users = await User.find({
                $or: [
                    { Name: { $regex: search, $options: "i" } },
                    { Email: { $regex: search, $options: "i" } }
                ]
            });

            if (users.length > 0) {
                const userIds = users.map(u => u._id);
                searchConditions.push({ userId: { $in: userIds } });
            }

            // Combine existing filters with search conditions using $and
            const currentFilters = { ...query };
            query = {
                $and: [
                    currentFilters,
                    { $or: searchConditions }
                ]
            };
        }

        if (sort === "orderId") sortQuery = { orderId: -1 };
        else if (sort === "status") sortQuery = { orderStatus: 1 };

        const orders = await Order.find(query)
            .populate("userId", "Name Email Profile_image")
            .sort(sortQuery)
            .skip(skip)
            .limit(limit);

        const totalOrdersCount = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrdersCount / limit);

        const statsData = await Order.aggregate([
            {
                $facet: {
                    totalRevenue: [
                        { $match: { orderStatus: "Delivered" } },
                        { $group: { _id: null, total: { $sum: "$finalPrice" } } }
                    ],
                    totalOrders: [{ $count: "count" }],
                    pendingOrders: [
                        { $match: { orderStatus: "Pending" } },
                        { $count: "count" }
                    ],
                    returns: [
                        {
                            $match: {
                                $or: [
                                    { orderStatus: { $in: ["Return Requested", "Cancellation Requested"] } },
                                    { "items.status": { $in: ["Return Requested", "Cancellation Requested"] } }
                                ]
                            }
                        },
                        { $count: "count" }
                    ]
                }
            }
        ]);

        const stats = {
            totalRevenue: (statsData[0].totalRevenue[0]?.total || 0).toLocaleString('en-IN'),
            totalOrders: statsData[0].totalOrders[0]?.count || 0,
            pendingOrders: statsData[0].pendingOrders[0]?.count || 0,
            returns: statsData[0].returns[0]?.count || 0
        };

        const returnRequests = await Order.find({
            $or: [
                { orderStatus: { $in: ["Return Requested", "Cancellation Requested"] } },
                { "items.status": { $in: ["Return Requested", "Cancellation Requested"] } }
            ]
        })
            .populate("userId", "Name Email Profile_image")
            .sort({ updatedAt: -1 });

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({
                success: true,
                orders,
                page,
                totalPages,
                totalOrdersCount,
                limit,
                search,
                status,
                paymentMethod,
                paymentStatus,
                sort,
                stats,
                returnRequests
            });
        }

        res.render("admin/orders/orders", {
            user: req.session.admin,
            orders,
            currentPage: "orders",
            page,
            totalPages,
            totalOrdersCount,
            limit,
            search,
            status,
            paymentMethod,
            paymentStatus,
            sort,
            stats,
            returnRequests,
            successSwal: req.session.successSwal || null
        });

        delete req.session.successSwal;

    } catch (error) {
        console.error("Error in getOrders:", error);
        res.status(500).send("Internal Server Error");
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.query.id;
        const order = await Order.findById(orderId)
            .populate("userId", "Name Email Phone_number Profile_image")
            .populate("items.product");

        if (!order) {
            return res.status(404).send("Order not found");
        }

        res.render("admin/orders/orderDetails", {
            admin: req.session.admin,
            order,
            currentPage: "orders"
        });
    } catch (error) {
        console.error("Error in getOrderDetails:", error);
        res.status(500).send("Internal Server Error");
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        order.orderStatus = status;

        if (status === 'Delivered') {
            order.paymentStatus = 'Paid';
            order.deliveredAt = new Date();
        }

        if (['Cancelled', 'Returned'].includes(status)) {
            for (const item of order.items) {
                if (!['Cancelled', 'Returned'].includes(item.status)) {
                    if (item.variant) {
                        await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } });
                    }
                }
                item.status = status;
            }
        } else {
            order.items.forEach(item => {
                if (!['Cancelled', 'Returned', 'Cancellation Requested', 'Return Requested'].includes(item.status)) {
                    item.status = status;
                    if (status === 'Delivered') {
                        item.deliveredAt = new Date();
                    }
                }
            });
        }

        // Wallet refund for full order manual cancel/return
        if (['Cancelled', 'Returned'].includes(status) && order.paymentStatus === 'Paid' && (order.paymentMethod === 'Online' || order.paymentMethod === 'Wallet')) {
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
                Description: `Refund for order ${status} manually by Admin (Order #${order.orderId})`
            });
            await newTransaction.save();
            order.paymentStatus = 'Refunded';
        }

        await order.save();
        res.json({ success: true, message: "Order status updated and refund processed if applicable." });
    } catch (error) {
        console.error("Error in updateOrderStatus:", error);
        res.json({ success: false, message: "Internal Server Error" });
    }
};

const acceptReturn = async (req, res) => {
    try {
        const { orderId } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        const oldStatus = order.orderStatus;
        if (oldStatus !== "Return Requested") {
            return res.json({ success: false, message: "No pending return request for this order" });
        }

        order.orderStatus = "Returned";

        // FIX #4: Restore stock BEFORE save, only for items that are transitioning NOW
        // (items whose status matched oldStatus — not items already in a terminal state)
        for (const item of order.items) {
            if (item.status === oldStatus || !item.status) {
                // Restore stock for this item before changing its status
                if (item.variant) {
                    await Variant.findByIdAndUpdate(
                        item.variant,
                        { $inc: { stock: item.quantity } }
                    );
                }
                item.status = "Returned";
            }
        }

        await order.save();

        // Wallet refund
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
                Description: `Refund for Returned Order #${order.orderId}`
            });
            await newTransaction.save();

            order.paymentStatus = 'Refunded';
            await order.save();
        }

        return res.json({ success: true, message: "Return Request accepted. Stock restored and refund credited to wallet if applicable." });
    } catch (error) {
        console.error("Error in acceptReturn:", error);
        return res.json({ success: false, message: "Internal Server Error" });
    }
};

const declineReturn = async (req, res) => {
    try {
        const { orderId } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        const oldStatus = order.orderStatus;

        // FIX #5: Handle both order-level and item-level return requests
        if (oldStatus === "Return Requested") {
            // Full order return decline — revert order and all matching item statuses
            order.orderStatus = "Delivered";
            order.items.forEach(item => {
                if (item.status === "Return Requested") {
                    item.status = "Delivered";
                }
            });
            await order.save();
            return res.json({ success: true, message: "Return request declined." });
        }

        // Check if there are item-level return requests even when order status is something else
        const itemReturnRequests = order.items.filter(i => i.status === "Return Requested");
        if (itemReturnRequests.length > 0) {
            // Decline all item-level return requests on this order
            order.items.forEach(item => {
                if (item.status === "Return Requested") {
                    item.status = "Delivered";
                }
            });

            // Revert order status if it was stuck in a request state
            if (["Return Requested", "Cancellation Requested"].includes(order.orderStatus)) {
                const hasDelivered = order.items.some(i => i.status === 'Delivered');
                order.orderStatus = hasDelivered ? 'Delivered' : 'Processing';
            }

            await order.save();
            return res.json({ success: true, message: "Item return request(s) declined." });
        }

        return res.json({ success: false, message: "No pending return request for this order" });
    } catch (error) {
        console.error("Error in declineReturn:", error);
        return res.json({ success: false, message: "Internal Server Error" });
    }
};

const acceptItemRequest = async (req, res) => {
    try {
        const { orderId, itemId } = req.body;
        const order = await Order.findById(orderId);
        if (!order) return res.json({ success: false, message: "Order not found" });

        const item = order.items.id(itemId);
        if (!item) return res.json({ success: false, message: "Item not found" });

        const oldStatus = item.status;
        if (oldStatus === "Return Requested") {
            item.status = "Returned";
        } else if (oldStatus === "Cancellation Requested") {
            item.status = "Cancelled";
        } else {
            return res.json({ success: false, message: "No pending request for this item" });
        }

        // Restore stock
        if (item.variant) {
            await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } });
        }

        // Recalculate parent order status
        const terminalStatuses = ['Cancelled', 'Returned'];
        const activeItems = order.items.filter(i => !terminalStatuses.includes(i.status));

        if (activeItems.length === 0) {
            const hasReturned = order.items.some(i => i.status === 'Returned');
            order.orderStatus = hasReturned ? 'Returned' : 'Cancelled';
        }

        await order.save();

        // Wallet refund (item-level)
        if (order.paymentStatus === 'Paid' && (order.paymentMethod === 'Online' || order.paymentMethod === 'Wallet')) {
            const userId = order.userId;

            let refundAmount = item.total;
            if (order.discount > 0 && order.subtotal > 0) {
                const proportion = item.total / order.subtotal;
                const itemTotalDiscount = order.discount * proportion;
                refundAmount = item.total - itemTotalDiscount;
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
                Description: `Refund for ${item.status} item: ${item.name} in Order #${order.orderId}`
            });
            await newTransaction.save();

            // If all items are now terminal, mark payment as Refunded
            const allItemsTerminal = order.items.every(i => terminalStatuses.includes(i.status));
            if (allItemsTerminal) {
                order.paymentStatus = 'Refunded';
                await order.save();
            }
        }

        res.json({ success: true, message: "Item request authorized, stock restored, and refund credited to wallet if applicable." });
    } catch (error) {
        console.error("Error in acceptItemRequest:", error);
        res.json({ success: false, message: "Server error" });
    }
};

const declineItemRequest = async (req, res) => {
    try {
        const { orderId, itemId } = req.body;
        const order = await Order.findById(orderId);
        if (!order) return res.json({ success: false, message: "Order not found" });

        const item = order.items.id(itemId);
        if (!item) return res.json({ success: false, message: "Item not found" });

        const oldStatus = item.status;
        if (oldStatus === "Return Requested") {
            item.status = "Delivered";
        } else if (oldStatus === "Cancellation Requested") {
            item.status = "Processing";
        } else {
            return res.json({ success: false, message: "No pending request for this item" });
        }

        // Revert order status if stuck in a request state and no other items still pending
        const pendingRequestStatuses = ['Cancellation Requested', 'Return Requested'];
        if (pendingRequestStatuses.includes(order.orderStatus)) {
            const hasOtherPending = order.items.some(i =>
                pendingRequestStatuses.includes(i.status) && String(i._id) !== String(itemId)
            );
            if (!hasOtherPending) {
                const hasDelivered = order.items.some(i => i.status === 'Delivered');
                order.orderStatus = hasDelivered ? 'Delivered' : 'Processing';
            }
        }

        await order.save();
        res.json({ success: true, message: "Item request declined." });
    } catch (error) {
        console.error("Error in declineItemRequest:", error);
        res.json({ success: false, message: "Server error" });
    }
};

export { getOrders, getOrderDetails, updateOrderStatus, acceptReturn, declineReturn, acceptItemRequest, declineItemRequest };