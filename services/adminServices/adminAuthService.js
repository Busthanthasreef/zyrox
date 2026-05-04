import userSchema from "../../models/user.js";
import Order from "../../models/order.js";
import User from "../../models/user.js";
import bcrypt from "bcryptjs";
import moment from "moment";


// ─── Auth Services ────────────────────────────────────────────────────────────

export const findAdminByEmail = async (Email) => {
  const user = await userSchema.findOne({ Email, isAdmin: true });
  return user;
};

export const verifyPassword = async (Password, hashedPassword) => {
  return await bcrypt.compare(Password, hashedPassword);
};

export const getAdminUser = async () => {
  return await userSchema.findOne({ isAdmin: true });
};


// ─── Login Validation ─────────────────────────────────────────────────────────

export const validateLoginInput = (Email, Password) => {
  const emailRegex = /^[a-zA-Z0-9+._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!Email) return { valid: false, error: "Email is required" };
  if (!emailRegex.test(Email)) return { valid: false, error: "Invalid email format" };
  if (!Password) return { valid: false, error: "Password is required" };

  return { valid: true };
};


// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export const getDashboardStats = async () => {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [totalOrdersCount, pendingOrdersCount, activeUsersCount, aggRevenue, currentMonthAgg] =
    await Promise.all([
      Order.countDocuments({}),
      Order.countDocuments({ orderStatus: "Pending" }),
      User.countDocuments({ isAdmin: false, isActive: true }),
      Order.aggregate([
        { $match: { orderStatus: "Delivered" } },
        { $group: { _id: null, total: { $sum: "$finalPrice" } } }
      ]),
      Order.aggregate([
        { $match: { orderStatus: "Delivered", createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ])
    ]);

  const totalRevenue = aggRevenue.length > 0 ? aggRevenue[0].total : 0;
  const monthlySales = currentMonthAgg.length > 0 ? currentMonthAgg[0].count : 0;

  return {
    totalRevenue: totalRevenue.toLocaleString("en-IN"),
    totalOrders: totalOrdersCount,
    pendingOrders: pendingOrdersCount,
    activeUsers: activeUsersCount,
    monthlySales
  };
};


// ─── Chart Data ───────────────────────────────────────────────────────────────

export const getChartData = async (filter = "monthly") => {
  let chartLabels = [];
  let chartData = [];
  let chartTitle = "Revenue Overview";

  if (filter === "yearly") {
    const fiveYearsAgo = moment().subtract(4, "years").startOf("year").toDate();
    const yearlyOrders = await Order.aggregate([
      { $match: { orderStatus: "Delivered", createdAt: { $gte: fiveYearsAgo } } },
      { $group: { _id: { $year: "$createdAt" }, sum: { $sum: "$finalPrice" } } },
      { $sort: { _id: 1 } }
    ]);
    chartTitle = "Yearly Revenue Performance";
    for (let i = 4; i >= 0; i--) {
      const yr = moment().subtract(i, "years").year();
      chartLabels.push(yr.toString());
      const found = yearlyOrders.find((o) => o._id === yr);
      chartData.push(found ? found.sum : 0);
    }

  } else if (filter === "weekly") {
    const last7Days = moment().subtract(6, "days").startOf("day").toDate();
    const dailyOrders = await Order.aggregate([
      { $match: { orderStatus: "Delivered", createdAt: { $gte: last7Days } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, sum: { $sum: "$finalPrice" } } },
      { $sort: { _id: 1 } }
    ]);
    chartTitle = "Last 7 Days Performance";
    for (let i = 0; i < 7; i++) {
      const d = moment().subtract(6 - i, "days").format("YYYY-MM-DD");
      chartLabels.push(moment(d).format("ddd"));
      const found = dailyOrders.find((o) => o._id === d);
      chartData.push(found ? found.sum : 0);
    }

  } else {
    const currentYear = new Date().getFullYear();
    const monthlyOrders = await Order.aggregate([
      { $match: { orderStatus: "Delivered", createdAt: { $gte: new Date(currentYear, 0, 1) } } },
      { $group: { _id: { $month: "$createdAt" }, sum: { $sum: "$finalPrice" } } },
      { $sort: { _id: 1 } }
    ]);
    chartTitle = `Monthly Performance (${currentYear})`;
    chartLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    chartData = new Array(12).fill(0);
    monthlyOrders.forEach((o) => {
      if (o._id >= 1 && o._id <= 12) chartData[o._id - 1] = o.sum;
    });
  }

  return { chartLabels, chartData, chartTitle };
};


// ─── Recent Sales ─────────────────────────────────────────────────────────────

export const getRecentSales = async () => {
  const recentOrders = await Order.find({ orderStatus: "Delivered" })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("userId");

  return recentOrders.map((o) => ({
    name: o.userId ? o.userId.Name || o.userId.Email : "Guest",
    email: o.userId ? o.userId.Email : "No email",
    amount: o.finalPrice ? o.finalPrice.toLocaleString("en-IN") : "0"
  }));
};


// ─── Top Products ─────────────────────────────────────────────────────────────

export const getTopProducts = async () => {
  const topProductsAggr = await Order.aggregate([
    { $match: { orderStatus: "Delivered" } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        name: { $first: "$items.name" },
        image: { $first: "$items.image" },
        sales: { $sum: "$items.quantity" },
        revenue: { $sum: "$items.total" }
      }
    },
    { $sort: { sales: -1 } },
    { $limit: 10 }
  ]);

  await Order.populate(topProductsAggr, {
    path: "_id",
    model: "Product",
    select: "categoryId",
    populate: { path: "categoryId", select: "categoryName" }
  });

  return topProductsAggr.map((item) => {
    let catName = "General";
    if (item._id?.categoryId?.categoryName) catName = item._id.categoryId.categoryName;
    return {
      image: item.image || "/images/placeholder.png",
      name: item.name,
      sku:
        typeof item._id === "object" && item._id?._id
          ? item._id._id.toString().substring(0, 8).toUpperCase()
          : "ZYR-PRD",
      category: catName,
      sales: item.sales,
      revenue: item.revenue.toLocaleString("en-IN")
    };
  });
};


// ─── Top Categories ───────────────────────────────────────────────────────────

export const getTopCategories = async () => {
  const topCategoriesAggr = await Order.aggregate([
    { $match: { orderStatus: "Delivered" } },
    { $unwind: "$items" },
    { $lookup: { from: "products", localField: "items.product", foreignField: "_id", as: "prod" } },
    { $unwind: { path: "$prod", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "categories", localField: "prod.categoryId", foreignField: "_id", as: "cat" } },
    { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$cat.categoryName",
        sales: { $sum: "$items.quantity" }
      }
    },
    { $sort: { sales: -1 } },
    { $limit: 10 }
  ]);

  const totalTopCatSales = topCategoriesAggr.reduce((sum, c) => sum + c.sales, 0);

  return topCategoriesAggr.map((c) => ({
    name: c._id || "Uncategorized",
    percent: totalTopCatSales > 0 ? Math.round((c.sales / totalTopCatSales) * 100) : 0,
    sales: c.sales
  }));
};


// ─── Order Status Distribution ────────────────────────────────────────────────

export const getOrderStatusData = async () => {
  const statusAggr = await Order.aggregate([
    { $group: { _id: "$orderStatus", count: { $sum: 1 } } }
  ]);
  return {
    labels: statusAggr.map((s) => s._id),
    counts: statusAggr.map((s) => s.count)
  };
};


// ─── Payment Method Distribution ──────────────────────────────────────────────

export const getPaymentData = async () => {
  const paymentAggr = await Order.aggregate([
    { $group: { _id: "$paymentMethod", count: { $sum: 1 } } }
  ]);
  return {
    labels: paymentAggr.map((p) => p._id),
    counts: paymentAggr.map((p) => p.count)
  };
};