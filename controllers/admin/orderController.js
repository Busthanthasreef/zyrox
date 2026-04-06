import Order from "../../models/order.js";
import User from "../../models/user.js";
import Variant from "../../models/variant.js";

const getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
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

        // Return and Cancellation Requests for Notification Bell
        const returnRequests = await Order.find({ orderStatus: { $in: ["Return Requested", "Cancellation Requested"] } })
            .populate("userId", "Name Email Profile_image")
            .sort({ updatedAt: -1 });

        res.render("admin/orders/orders", {
            user: req.session.admin,
            orders,
            currentPage: "orders",
            page,
            totalPages,
            totalOrdersCount,
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
        
        await order.save();
        res.json({ success: true, message: "Order status updated successfully" });
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

        // Mark order as Returned or Cancelled based on request type
        const oldStatus = order.orderStatus;
        if (oldStatus === "Return Requested") {
            order.orderStatus = "Returned";
        } else if (oldStatus === "Cancellation Requested") {
            order.orderStatus = "Cancelled";
        } else {
            return res.json({ success: false, message: "No pending request for this order" });
        }
        await order.save();

        // Restore stock for each item's variant
        for (const item of order.items) {
            if (item.variant) {
                await Variant.findByIdAndUpdate(
                    item.variant,
                    { $inc: { stock: item.quantity } }
                );
            }
        }

        const actionType = oldStatus === "Return Requested" ? "Return" : "Cancellation";
        return res.json({ success: true, message: `${actionType} accepted. Stock has been restored.` });
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
        } else if (oldStatus === "Cancellation Requested") {
            order.orderStatus = "Processing";
        } else {
            return res.json({ success: false, message: "No pending request for this order" });
        }

        await order.save();
        const actionType = oldStatus === "Return Requested" ? "Return" : "Cancellation";
        return res.json({ success: true, message: `${actionType} request declined.` });
    } catch (error) {
        console.error("Error in declineReturn:", error);
        return res.json({ success: false, message: "Internal Server Error" });
    }
};

export { getOrders, getOrderDetails, updateOrderStatus, acceptReturn, declineReturn };