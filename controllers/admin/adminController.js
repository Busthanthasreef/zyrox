import {
  findAdminByEmail,
  verifyPassword,
  getAdminUser
} from "../../services/adminServices/adminAuthService.js";


const loadLogin = async (req, res) => {

  const adminError = req.session.adminError;
  const formData = req.session.adminFormData || {};

  delete req.session.adminError;
  delete req.session.adminFormData;

  const errors = {};

  if (adminError) {
    errors.general = adminError;
  }

  return res.render("admin/auth/signInPage", { errors, formData });

};


const login = async (req, res) => {

  try {

    const Email = req.body.email || req.body.Email;
    const Password = req.body.password || req.body.Password;

    if (!Email || !Password) {
      req.session.adminError = "Email and Password are required";
      req.session.adminFormData = { email: Email };
      return res.redirect("/admin");
    }

    const user = await findAdminByEmail(Email);

    if (!user) {
      req.session.adminError = "Admin account not found";
      return res.redirect("/admin");
    }

    const passwordMatch = await verifyPassword(Password, user.Password);

    if (!passwordMatch) {
      req.session.adminError = "Incorrect Email or Password";
      req.session.adminFormData = { Email };
      return res.redirect("/admin");
    }

    req.session.admin = {
      Email: user.Email,
      Name: user.Name
    };

    req.session.successSwal = "Login Successful";

    return res.redirect("/admin/dashboard");

  } catch (error) {

    console.log("Login Error:", error.message);
    res.status(500).send("Server Error");

  }

};


import Order from "../../models/order.js";
import User from "../../models/user.js";

const dashboard = async (req, res) => {
  try {
    const user = await getAdminUser();
    const successSwal = req.session.successSwal;
    delete req.session.successSwal;

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // 1. Stats
    const totalOrdersCount = await Order.countDocuments({});
    const pendingOrdersCount = await Order.countDocuments({ orderStatus: "Pending" });
    const activeUsersCount = await User.countDocuments({ IsActive: true });
    
    // Revenue Pipeline
    const aggRevenue = await Order.aggregate([
      { $match: { orderStatus: "Delivered" } },
      { $group: { _id: null, total: { $sum: "$finalPrice" } } }
    ]);
    const totalRevenue = aggRevenue.length > 0 ? aggRevenue[0].total : 0;

    const currentMonthAgg = await Order.aggregate([
      { $match: { orderStatus: "Delivered", createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, count: { $sum: 1 } } }
    ]);
    const monthlySales = currentMonthAgg.length > 0 ? currentMonthAgg[0].count : 0;

    const stats = {
      totalRevenue: totalRevenue.toLocaleString('en-IN'),
      totalOrders: totalOrdersCount,
      pendingOrders: pendingOrdersCount,
      activeUsers: activeUsersCount,
      monthlySales: monthlySales
    };

    // 2. Chart Data 
    const currentYear = new Date().getFullYear();
    const yearlyOrders = await Order.aggregate([
      { $match: { orderStatus: "Delivered", createdAt: { $gte: new Date(currentYear, 0, 1) } } },
      { $group: { _id: { $month: "$createdAt" }, sum: { $sum: "$finalPrice" } } }
    ]);
    const chartDataMap = new Array(12).fill(0);
    yearlyOrders.forEach(o => {
        chartDataMap[o._id - 1] = o.sum;
    });

    // 3. Recent Sales
    const recentOrders = await Order.find({ orderStatus: "Delivered" })
      .sort({ createdAt: -1 })
      .limit(4)
      .populate('userId');
      
    const recentSales = recentOrders.map(o => {
        return {
            name: o.userId ? (o.userId.Name || o.userId.Email) : "Guest",
            email: o.userId ? o.userId.Email : "",
            amount: o.finalPrice ? o.finalPrice.toLocaleString('en-IN') : "0"
        }
    });

    // 4. Trending Products
    const trendingAggr = await Order.aggregate([
      { $match: { orderStatus: "Delivered" } },
      { $unwind: "$items" },
      { $group: {
          _id: "$items.product",
          name: { $first: "$items.name" },
          image: { $first: "$items.image" },
          sales: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.total" }
      }},
      { $sort: { sales: -1 } },
      { $limit: 5 }
    ]);
    // Populate product category if possible, or just default to "Product"
    await Order.populate(trendingAggr, { path: '_id', model: 'Product', select: 'categoryId', populate: { path: "categoryId", select: "categoryName" } });
    
    const trendingProducts = trendingAggr.map(item => {
        let catName = "General";
        if(item._id && item._id.categoryId && item._id.categoryId.categoryName){
           catName = item._id.categoryId.categoryName;
        }
        return {
            image: item.image || '/images/placeholder.png',
            name: item.name,
            sku: typeof item._id === 'object' && item._id._id ? item._id._id.toString().substring(0,8).toUpperCase() : "ZYR-PRD",
            category: catName,
            sales: item.sales,
            revenue: item.revenue.toLocaleString('en-IN')
        }
    });

    // 5. Top Categories
    const catAggr = await Order.aggregate([
      { $match: { orderStatus: "Delivered" } },
      { $unwind: "$items" },
      { $lookup: { from: "products", localField: "items.product", foreignField: "_id", as: "prod" } },
      { $unwind: { path: "$prod", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "categories", localField: "prod.categoryId", foreignField: "_id", as: "cat" } },
      { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
      { $group: {
          _id: "$cat.categoryName",
          rev: { $sum: "$items.total" }
      }},
      { $sort: { rev: -1 } }
    ]);
    
    let totalCatRev = 0;
    catAggr.forEach(c => totalCatRev += c.rev);
    
    const topCategories = catAggr.slice(0, 5).map(c => {
        return {
            name: c._id || "Uncategorized",
            percent: totalCatRev > 0 ? Math.round((c.rev / totalCatRev) * 100) : 0
        }
    });

    return res.render("admin/home/dashboard", { 
        user, 
        successSwal, 
        stats, 
        dashboardChartData: chartDataMap,
        recentSales,
        trendingProducts,
        topCategories
    });

  } catch (error) {
    console.log("Dashboard Error:", error.message);
    res.status(500).send("Server Error");
  }

};


const logout = (req, res) => {

 delete req.session.admin;
  res.redirect('/admin')
};


export { loadLogin, login, dashboard, logout };