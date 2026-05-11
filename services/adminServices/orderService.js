import Order from "../../models/order.js";
import User from "../../models/user.js";
import Variant from "../../models/variant.js";
import Wallet from "../../models/wallet.js";
import WalletTransactions from "../../models/walletTransactions.js";

const buildOrderQuery = async ({ search, status, paymentMethod, paymentStatus }) => {
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

        const currentFilters = { ...query };
        query = {
            $and: [
                currentFilters,
                { $or: searchConditions }
            ]
        };
    }

    return query;
};

const buildSortQuery = (sort) => {
    if (sort === "oldest") return { createdAt: 1 };
    if (sort === "priceHigh") return { finalPrice: -1 };
    if (sort === "priceLow") return { finalPrice: 1 };
    if (sort === "orderId") return { orderId: -1 };
    if (sort === "status") return { orderStatus: 1 };
    return { createdAt: -1 }; // default: newest
};

const fetchOrders = async ({ page, limit, search, status, paymentMethod, paymentStatus, sort }) => {
    const skip = (page - 1) * limit;
    const query = await buildOrderQuery({ search, status, paymentMethod, paymentStatus });
    const sortQuery = buildSortQuery(sort);

    const [orders, totalOrdersCount] = await Promise.all([
        Order.find(query)
            .populate("userId", "Name Email Profile_image")
            .sort(sortQuery)
            .skip(skip)
            .limit(limit),
        Order.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalOrdersCount / limit);
    return { orders, totalOrdersCount, totalPages };
};

const fetchOrderStats = async () => {
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

    return {
        totalRevenue: (statsData[0].totalRevenue[0]?.total || 0).toLocaleString('en-IN'),
        totalOrders: statsData[0].totalOrders[0]?.count || 0,
        pendingOrders: statsData[0].pendingOrders[0]?.count || 0,
        returns: statsData[0].returns[0]?.count || 0
    };
};

const fetchReturnRequests = async () => {
    return Order.find({
        $or: [
            { orderStatus: { $in: ["Return Requested", "Cancellation Requested"] } },
            { "items.status": { $in: ["Return Requested", "Cancellation Requested"] } }
        ]
    })
        .populate("userId", "Name Email Profile_image")
        .sort({ updatedAt: -1 });
};

const fetchOrderById = async (orderId) => {
    return Order.findById(orderId)
        .populate("userId", "Name Email Phone_number Profile_image")
        .populate("items.product");
};

const processWalletRefund = async ({ userId, refundAmount, orderId, orderIdStr, description }) => {
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
        Order_id: orderId,
        Description: description
    });
    await newTransaction.save();
};

const changeOrderStatus = async (orderId, status) => {
    const order = await Order.findById(orderId);
    if (!order) return { notFound: true };

    order.orderStatus = status;

    if (status === 'Delivered') {
        order.paymentStatus = 'Paid';
        order.deliveredAt = new Date();
    }

    if (status === 'Cancelled' && order.paymentStatus === 'Pending') {
        order.paymentStatus = 'Payment Cancelled';
    }

    if (['Cancelled', 'Returned'].includes(status)) {
        for (const item of order.items) {
            if (!['Cancelled', 'Returned'].includes(item.status)) {
                if (item.variant) {
                    await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } });
                }
            }
            item.status = status;
            if (status === 'Cancelled') item.cancelledAt = new Date();
            if (status === 'Returned')  item.returnedAt  = new Date();
        }
    } else {
        order.items.forEach(item => {
            if (!['Cancelled', 'Returned', 'Cancellation Requested', 'Return Requested'].includes(item.status)) {
                item.status = status;
                if (status === 'Processing') item.processingAt = new Date();
                if (status === 'Shipped')    item.shippedAt    = new Date();
                if (status === 'Delivered') {
                    item.deliveredAt  = new Date();
                }
            }
        });
    }

    // Wallet refund for full order manual cancel/return
    // COD orders are refunded to wallet if already Paid (delivered); Online/Wallet always refunded if Paid
    if (['Cancelled', 'Returned'].includes(status) && order.paymentStatus === 'Paid') {
        await processWalletRefund({
            userId: order.userId,
            refundAmount: order.finalPrice,
            orderId: order._id,
            description: `Refund for order ${status} manually by Admin (Order #${order.orderId})`
        });
        order.paymentStatus = 'Refunded';
    }

    await order.save();
    return { notFound: false };
};

const processAcceptReturn = async (orderId) => {
    const order = await Order.findById(orderId);
    if (!order) return { notFound: true };

    const oldStatus = order.orderStatus;
    if (oldStatus !== "Return Requested") return { invalidStatus: true };

    order.orderStatus = "Returned";

    for (const item of order.items) {
        if (item.status === oldStatus || !item.status) {
            if (item.variant) {
                await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } });
            }
            item.status = "Returned";
        }
    }

    await order.save();

    // Refund to wallet if order was Paid — covers COD (paid on delivery), Online, and Wallet
    if (order.paymentStatus === 'Paid') {
        await processWalletRefund({
            userId: order.userId,
            refundAmount: order.finalPrice,
            orderId: order._id,
            description: `Refund for Returned Order #${order.orderId}`
        });
        order.paymentStatus = 'Refunded';
        await order.save();
    }

    return { notFound: false, invalidStatus: false };
};

const processDeclineReturn = async (orderId) => {
    const order = await Order.findById(orderId);
    if (!order) return { notFound: true };

    const oldStatus = order.orderStatus;

    if (oldStatus === "Return Requested") {
        order.orderStatus = "Delivered";
        order.items.forEach(item => {
            if (item.status === "Return Requested") {
                item.status = "Delivered";
            }
        });
        await order.save();
        return { notFound: false, declined: true };
    }

    const itemReturnRequests = order.items.filter(i => i.status === "Return Requested");
    if (itemReturnRequests.length > 0) {
        order.items.forEach(item => {
            if (item.status === "Return Requested") {
                item.status = "Delivered";
            }
        });

        if (["Return Requested", "Cancellation Requested"].includes(order.orderStatus)) {
            const hasDelivered = order.items.some(i => i.status === 'Delivered');
            order.orderStatus = hasDelivered ? 'Delivered' : 'Processing';
        }

        await order.save();
        return { notFound: false, declined: true };
    }

    return { notFound: false, declined: false };
};

const processAcceptItemRequest = async (orderId, itemId) => {
    const order = await Order.findById(orderId);
    if (!order) return { notFound: true };

    const item = order.items.id(itemId);
    if (!item) return { itemNotFound: true };

    const oldStatus = item.status;
    if (oldStatus === "Return Requested") {
        item.status = "Returned";
        item.returnedAt = new Date();
    } else if (oldStatus === "Cancellation Requested") {
        item.status = "Cancelled";
        item.cancelledAt = new Date();
    } else {
        return { noPendingRequest: true };
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

        if (order.orderStatus === 'Cancelled' && order.paymentStatus === 'Pending') {
            order.paymentStatus = 'Payment Cancelled';
        }
    }

    await order.save();

    // Wallet refund (item-level) — covers COD (Paid on delivery), Online, and Wallet
    if (order.paymentStatus === 'Paid') {
        const userId = order.userId;

        let refundAmount = item.total;
        if (order.discount > 0 && order.subtotal > 0) {
            const proportion = item.total / order.subtotal;
            const itemTotalDiscount = order.discount * proportion;
            refundAmount = item.total - itemTotalDiscount;
        }

        await processWalletRefund({
            userId,
            refundAmount,
            orderId: order._id,
            description: `Refund for ${item.status} item: ${item.name} in Order #${order.orderId}`
        });

        // If all items are now terminal, mark payment as Refunded
        const allItemsTerminal = order.items.every(i => terminalStatuses.includes(i.status));
        if (allItemsTerminal) {
            order.paymentStatus = 'Refunded';
            await order.save();
        }
    }

    return { notFound: false, itemNotFound: false, noPendingRequest: false };
};

const processDeclineItemRequest = async (orderId, itemId) => {
    const order = await Order.findById(orderId);
    if (!order) return { notFound: true };

    const item = order.items.id(itemId);
    if (!item) return { itemNotFound: true };

    const oldStatus = item.status;
    if (oldStatus === "Return Requested") {
        item.status = "Delivered";
    } else if (oldStatus === "Cancellation Requested") {
        item.status = "Processing";
    } else {
        return { noPendingRequest: true };
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
    return { notFound: false, itemNotFound: false, noPendingRequest: false };
};

export {
    fetchOrders,
    fetchOrderStats,
    fetchReturnRequests,
    fetchOrderById,
    changeOrderStatus,
    processAcceptReturn,
    processDeclineReturn,
    processAcceptItemRequest,
    processDeclineItemRequest
};

/**
 * Updates a single item's status within an order.
 * Skips items that are in terminal or request states.
 * Recalculates the parent order status after the update.
 */
export async function changeItemStatus(orderId, itemId, newStatus) {
    const VALID_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered'];
    if (!VALID_STATUSES.includes(newStatus)) {
        return { invalidStatus: true };
    }

    const order = await Order.findById(orderId);
    if (!order) return { notFound: true };

    const item = order.items.id(itemId);
    if (!item) return { itemNotFound: true };

    // Block update if item is in a terminal or request state
    const BLOCKED = ['Cancelled', 'Returned', 'Cancellation Requested', 'Return Requested'];
    if (BLOCKED.includes(item.status)) {
        return { blocked: true };
    }

    item.status = newStatus;
    if (newStatus === 'Processing') item.processingAt = new Date();
    if (newStatus === 'Shipped')    item.shippedAt    = new Date();
    if (newStatus === 'Delivered') {
        item.deliveredAt = new Date();
    }

    // Recalculate parent order status from all non-terminal items
    const TERMINAL = ['Cancelled', 'Returned'];
    const activeItems = order.items.filter(i => !TERMINAL.includes(i.status));

    if (activeItems.length > 0) {
        // Order status = the "lowest" status among active items
        const STATUS_RANK = { Pending: 0, Processing: 1, Shipped: 2, Delivered: 3 };
        const lowestRank = Math.min(...activeItems.map(i => STATUS_RANK[i.status] ?? 0));
        const lowestStatus = Object.keys(STATUS_RANK).find(k => STATUS_RANK[k] === lowestRank);
        order.orderStatus = lowestStatus;

        if (lowestStatus === 'Delivered') {
            order.paymentStatus = 'Paid';
            order.deliveredAt = new Date();
        }
    }

    await order.save();
    return { notFound: false, itemNotFound: false, blocked: false, invalidStatus: false };
}