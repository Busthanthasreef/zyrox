import { getUserList, getAdmin, toggleUserStatus, getUserById } from "../../services/adminServices/customerService.js"

const loadUserManagement = async (req, res) => {
  try {
    const { search = "", status: statusFilter = "", sortBy = "newest" } = req.query;
    const page  = parseInt(req.query.page) || 1;
    const limit = 4;

    const [{ users, totalUsers, totalPages }, admin] = await Promise.all([
      getUserList({ search, statusFilter, sortBy, page, limit }),
      getAdmin(),
    ]);

    res.render("admin/users/users", {
      admin,
      users,
      search,
      statusFilter,
      sortBy,
      currentPage: page,
      totalPages,
      totalUsers,
      limit,
    });
  } catch (error) {
    console.error("User management loading error:", error);
    res.status(500).send("Server Error");
  }
};

const userStatus = async (req, res) => {
  try {
    const { id, status } = req.query;

    if (!id || !status) {
      console.log("Invalid request — missing id or status");
      return res.redirect("/adminUser/users");
    }

    await toggleUserStatus(id, status);
    res.redirect("/adminUser/users");
  } catch (error) {
    console.error("User status update error:", error);
    res.status(500).send("Server Error");
  }
};

import Order from "../../models/order.js";

const userDetails = async (req, res) => {
  try {
    const userId = req.query.id;
    const [user, admin, orders] = await Promise.all([
      getUserById(userId),
      getAdmin(),
      Order.find({ userId }).sort({ createdAt: -1 }),
    ]);

    if (!user) return res.redirect("/adminUser/users");

    // Calculate dynamic stats
    const totalOrders = orders.length;
    const totalSpent = orders
      .filter((o) => o.paymentStatus === "Paid")
      .reduce((sum, o) => sum + (o.finalPrice || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

    res.render("admin/users/userDetails", {
      user,
      admin,
      orders,
      stats: { totalOrders, totalSpent, avgOrderValue },
    });
  } catch (error) {
    console.error("User details error:", error);
    res.status(500).send("Server Error");
  }
};

export { loadUserManagement, userStatus, userDetails };