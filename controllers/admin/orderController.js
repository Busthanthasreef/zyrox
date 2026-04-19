import Order from "../../models/order.js";
import User from "../../models/user.js";
import Variant from "../../models/variant.js";
import Wallet from "../../models/wallet.js";
import WalletTransactions from "../../models/walletTransactions.js";

const getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 3;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";

        let query = {};
        if (search) {
            query = {
                $or: [
                    { orderId: { $regex: search, $options: "i" } },
                    { paymentMethod: { $regex: search, $options: "i" } },
                    { orderStatus: { $regex: search, $options: "i" } }
                ]
            };
            
            // Search by user name or email
            const users = await User.find({
                $or: [
                    { Name: { $regex: search, $options: "i" } },
                    { Email: { $regex: search, $options: "i" } }
                ]
            });
            
            if (users.length > 0) {
                const userIds = users.map(u => u._id);
                query.$or.push({ userId: { $in: userIds } });
            }
        }

        const orders = await Order.find(query)
            .populate("userId", "Name Email Profile_image")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalOrdersCount = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrdersCount / limit);

        // Stats calculation
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
                        { $match: { orderStatus: { $in: ["Returned", "Return Requested"] } } },
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

        // Return and Cancellation Requests for Notification Bell (Both order-level and item-level)
        const returnRequests = await Order.find({
            $or: [
                { orderStatus: { $in: ["Return Requested", "Cancellation Requested"] } },
                { "items.status": { $in: ["Return Requested", "Cancellation Requested"] } }
            ]
        })
            .populate("userId", "Name Email Profile_image")
            .sort({ updatedAt: -1 });

        res.render("admin/orders/orders", {
            user: req.session.admin,
            orders,
            currentPage: "orders",
            page,
            totalPages,
            totalOrdersCount,
            limit,
            search,
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
        }

        // Propagate status to items for terminal states
        if (['Cancelled', 'Returned'].includes(status)) {
            for (const item of order.items) {
                // If the item wasn't already in a terminal state, restore stock
                if (!['Cancelled', 'Returned'].includes(item.status)) {
                    if (item.variant) {
                        await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } });
                    }
                }
                item.status = status;
            }
        } else {
            // For other statuses (Processing, Shipped), only update items that don't have a granular status override
            order.items.forEach(item => {
                if (!['Cancelled', 'Returned', 'Cancellation Requested', 'Return Requested'].includes(item.status)) {
                    item.status = status;
                }
            });
        }
        
        // ── WALLET REFUND LOGIC (Full Order Manual Update) ─────────────────
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

        // Mark order as Returned or Cancelled
        const oldStatus = order.orderStatus;
        if (oldStatus === "Return Requested") {
            order.orderStatus = "Returned";
         } else {
            return res.json({ success: false, message: "No pending request for this order" });
        }

        // Sync individual item statuses to the final terminal state
        order.items.forEach(item => {
            if (item.status === oldStatus || !item.status) {
                item.status = order.orderStatus;
            }
        });

        await order.save();

        // Restore stock only for items that are transition to a terminal state right now
        for (const item of order.items) {
            if (item.status === order.orderStatus && item.variant) {
                await Variant.findByIdAndUpdate(
                    item.variant,
                    { $inc: { stock: item.quantity } }
                );
            }
        }

        // ── WALLET REFUND LOGIC ──────────────────────────────────────────
        // If payment was already made, refund the total amount to wallet
        if (order.paymentStatus === 'Paid' && (order.paymentMethod === 'Online' || order.paymentMethod === 'Wallet')) {
            const refundAmount = order.finalPrice;
            const userId = order.userId;

            // Find or create wallet
            let wallet = await Wallet.findOne({ user_id: userId });
            if (!wallet) {
                wallet = await Wallet.create({ user_id: userId, balance: 0 });
            }

            // Update balance
            wallet.balance += refundAmount;
            await wallet.save();

            // Create transaction record
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

        const actionType = oldStatus === "Return Requested" ? "Return Request" : " ";
        return res.json({ success: true, message: `${actionType} accepted. Stock restored and refund credited to wallet if applicable.` });
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
        if (oldStatus === "Return Requested") {
            order.orderStatus = "Delivered";
        } else {
            return res.json({ success: false, message: "No pending request for this order" });
        }

        // Revert individual item statuses if they were following the order request
        order.items.forEach(item => {
            if (item.status === oldStatus) {
                item.status = order.orderStatus;
            }
        });

        await order.save();
        const actionType = oldStatus === "Return Requested" ? "Return" : " ";
        return res.json({ success: true, message: `${actionType} request declined.` });
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

        // Recalculate parent order status if needed
        const terminalStatuses = ['Cancelled', 'Returned'];
        const activeItems = order.items.filter(i => !terminalStatuses.includes(i.status));
        
        if (activeItems.length === 0) {
            // All items are terminal. The wrapper order should reflect the terminal status of the majority, or just "Returned" / "Cancelled"
            // For simplicity, if everything is terminal, we can mark the order as either 'Cancelled' or 'Returned'.
            const hasReturned = order.items.some(i => i.status === 'Returned');
            order.orderStatus = hasReturned ? 'Returned' : 'Cancelled';
        }

        await order.save();

        // ── WALLET REFUND LOGIC (ITEM LEVEL) ──────────────────────────────
        // If payment was already made, refund the item's proportional amount
        if (order.paymentStatus === 'Paid' && (order.paymentMethod === 'Online' || order.paymentMethod === 'Wallet')) {
            const userId = order.userId;
            
            // Calculate proportional refund
            // item.total - proportional coupon discount
            let refundAmount = item.total;
            if (order.couponDiscount > 0 && order.subtotal > 0) {
                const proportion = item.total / order.subtotal;
                const itemCouponDiscount = order.couponDiscount * proportion;
                refundAmount = item.total - itemCouponDiscount;
            }

            // Find or create wallet
            let wallet = await Wallet.findOne({ user_id: userId });
            if (!wallet) {
                wallet = await Wallet.create({ user_id: userId, balance: 0 });
            }

            // Update balance
            wallet.balance += refundAmount;
            await wallet.save();

            // Create transaction record
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

            // If it was the last item and all items are terminal, we might want to mark the payment as Refunded
            // but usually partial refund is still 'Paid' or 'Partially Refunded'. 
            // For now, if all items are terminal, mark the order payment as Refunded.
            const terminalStatuses = ['Cancelled', 'Returned'];
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

        // If the wrapper order is stuck in "Cancellation Requested" or "Return Requested", revert it
        const pendingRequestStatuses = ['Cancellation Requested', 'Return Requested'];
        if (pendingRequestStatuses.includes(order.orderStatus)) {
            const hasOtherPending = order.items.some(i => pendingRequestStatuses.includes(i.status) && String(i._id) !== String(itemId));
            if (!hasOtherPending) {
                // Determine fallback status
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