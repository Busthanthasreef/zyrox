import {
    fetchOrders,
    fetchOrderStats,
    fetchReturnRequests,
    fetchOrderById,
    changeOrderStatus,
    processAcceptReturn,
    processDeclineReturn,
    processAcceptItemRequest,
    processDeclineItemRequest
} from "../../services/adminServices/orderService.js";

const getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const search = req.query.search || "";
        const status = req.query.status || "";
        const paymentMethod = req.query.paymentMethod || "";
        const paymentStatus = req.query.paymentStatus || "";
        const sort = req.query.sort || "newest";

        const { orders, totalOrdersCount, totalPages } = await fetchOrders({ page, limit, search, status, paymentMethod, paymentStatus, sort });
        const stats = await fetchOrderStats();
        const returnRequests = await fetchReturnRequests();

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
        const order = await fetchOrderById(orderId);

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

        const result = await changeOrderStatus(orderId, status);
        if (result.notFound) {
            return res.json({ success: false, message: "Order not found" });
        }

        res.json({ success: true, message: "Order status updated and refund processed if applicable." });
    } catch (error) {
        console.error("Error in updateOrderStatus:", error);
        res.json({ success: false, message: "Internal Server Error" });
    }
};

const acceptReturn = async (req, res) => {
    try {
        const { orderId } = req.body;

        const result = await processAcceptReturn(orderId);
        if (result.notFound) return res.json({ success: false, message: "Order not found" });
        if (result.invalidStatus) return res.json({ success: false, message: "No pending return request for this order" });

        return res.json({ success: true, message: "Return Request accepted. Stock restored and refund credited to wallet if applicable." });
    } catch (error) {
        console.error("Error in acceptReturn:", error);
        return res.json({ success: false, message: "Internal Server Error" });
    }
};

const declineReturn = async (req, res) => {
    try {
        const { orderId } = req.body;

        const result = await processDeclineReturn(orderId);
        if (result.notFound) return res.json({ success: false, message: "Order not found" });
        if (!result.declined) return res.json({ success: false, message: "No pending return request for this order" });

        return res.json({ success: true, message: "Return request declined." });
    } catch (error) {
        console.error("Error in declineReturn:", error);
        return res.json({ success: false, message: "Internal Server Error" });
    }
};

const acceptItemRequest = async (req, res) => {
    try {
        const { orderId, itemId } = req.body;

        const result = await processAcceptItemRequest(orderId, itemId);
        if (result.notFound) return res.json({ success: false, message: "Order not found" });
        if (result.itemNotFound) return res.json({ success: false, message: "Item not found" });
        if (result.noPendingRequest) return res.json({ success: false, message: "No pending request for this item" });

        res.json({ success: true, message: "Item request authorized, stock restored, and refund credited to wallet if applicable." });
    } catch (error) {
        console.error("Error in acceptItemRequest:", error);
        res.json({ success: false, message: "Server error" });
    }
};

const declineItemRequest = async (req, res) => {
    try {
        const { orderId, itemId } = req.body;

        const result = await processDeclineItemRequest(orderId, itemId);
        if (result.notFound) return res.json({ success: false, message: "Order not found" });
        if (result.itemNotFound) return res.json({ success: false, message: "Item not found" });
        if (result.noPendingRequest) return res.json({ success: false, message: "No pending request for this item" });

        res.json({ success: true, message: "Item request declined." });
    } catch (error) {
        console.error("Error in declineItemRequest:", error);
        res.json({ success: false, message: "Server error" });
    }
};

export { getOrders, getOrderDetails, updateOrderStatus, acceptReturn, declineReturn, acceptItemRequest, declineItemRequest };