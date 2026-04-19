import User from "../../models/user.js";
import Order from "../../models/order.js";
import {
  findAdminByEmail,
  verifyPassword,
  getAdminUser
} from "../../services/adminServices/adminAuthService.js";
import moment from "moment";


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



const dashboard = async (req, res) => {
  try {
    const user = await getAdminUser();
    const successSwal = req.session.successSwal;
    delete req.session.successSwal;

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // 1. Stats
    const totalOrdersCount = await Order.countDocuments({});
    const pendingOrdersCount = await Order.countDocuments({ orderStatus: "Pending" });
    const activeUsersCount = await User.countDocuments({ isAdmin: false, isActive: true });
    
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

    // 2. Chart Logic with Filters 
    const filter = req.query.filter || 'monthly';
    let chartLabels = [];
    let chartData = [];
    let chartTitle = "Revenue Overview";

    if (filter === 'yearly') {
        const fiveYearsAgo = moment().subtract(4, 'years').startOf('year').toDate();
        const yearlyOrders = await Order.aggregate([
            { $match: { orderStatus: "Delivered", createdAt: { $gte: fiveYearsAgo } } },
            { $group: { _id: { $year: "$createdAt" }, sum: { $sum: "$finalPrice" } } },
            { $sort: { _id: 1 } }
        ]);
        chartTitle = "Yearly Revenue Performance";
        for (let i = 4; i >= 0; i--) {
            const yr = moment().subtract(i, 'years').year();
            chartLabels.push(yr.toString());
            const found = yearlyOrders.find(o => o._id === yr);
            chartData.push(found ? found.sum : 0);
        }
    } else if (filter === 'weekly') {
        const last7Days = moment().subtract(6, 'days').startOf('day').toDate();
        const dailyOrders = await Order.aggregate([
            { $match: { orderStatus: "Delivered", createdAt: { $gte: last7Days } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, sum: { $sum: "$finalPrice" } } },
            { $sort: { _id: 1 } }
        ]);
        chartTitle = "Last 7 Days Performance";
        for (let i = 0; i < 7; i++) {
            const d = moment().subtract(6 - i, 'days').format('YYYY-MM-DD');
            chartLabels.push(moment(d).format('ddd'));
            const found = dailyOrders.find(o => o._id === d);
            chartData.push(found ? found.sum : 0);
        }
    } else {
        // Default Monthly
        const currentYear = new Date().getFullYear();
        const monthlyOrders = await Order.aggregate([
            { $match: { orderStatus: "Delivered", createdAt: { $gte: new Date(currentYear, 0, 1) } } },
            { $group: { _id: { $month: "$createdAt" }, sum: { $sum: "$finalPrice" } } },
            { $sort: { _id: 1 } }
        ]);
        chartTitle = "Monthly Performance (" + currentYear + ")";
        chartLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        chartData = new Array(12).fill(0);
        monthlyOrders.forEach(o => { if (o._id >= 1 && o._id <= 12) chartData[o._id - 1] = o.sum; });
    }

    // 3. Recent Sales
    const recentOrders = await Order.find({ orderStatus: "Delivered" })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('userId');
      
    const recentSales = recentOrders.map(o => {
        return {
            name: o.userId ? (o.userId.Name || o.userId.Email) : "Guest",
            email: o.userId ? o.userId.Email : "No email",
            amount: o.finalPrice ? o.finalPrice.toLocaleString('en-IN') : "0"
        }
    });

    // 4. Best Selling Products (Top 10)
    const topProductsAggr = await Order.aggregate([
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
      { $limit: 10 }
    ]);
    await Order.populate(topProductsAggr, { path: '_id', model: 'Product', select: 'categoryId', populate: { path: "categoryId", select: "categoryName" } });
    
    const topProducts = topProductsAggr.map(item => {
        let catName = "General";
        if(item._id && item._id.categoryId && item._id.categoryId.categoryName) catName = item._id.categoryId.categoryName;
        return {
            image: item.image || '/images/placeholder.png',
            name: item.name,
            sku: typeof item._id === 'object' && item._id._id ? item._id._id.toString().substring(0,8).toUpperCase() : "ZYR-PRD",
            category: catName,
            sales: item.sales,
            revenue: item.revenue.toLocaleString('en-IN')
        }
    });

    // 5. Best Selling Categories (Top 10)
    const topCategoriesAggr = await Order.aggregate([
      { $match: { orderStatus: "Delivered" } },
      { $unwind: "$items" },
      { $lookup: { from: "products", localField: "items.product", foreignField: "_id", as: "prod" } },
      { $unwind: { path: "$prod", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "categories", localField: "prod.categoryId", foreignField: "_id", as: "cat" } },
      { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
      { $group: {
          _id: "$cat.categoryName",
          sales: { $sum: "$items.quantity" }
      }},
      { $sort: { sales: -1 } },
      { $limit: 10 }
    ]);
    
    let totalTopCatSales = 0;
    topCategoriesAggr.forEach(c => totalTopCatSales += c.sales);
    
    const topCategories = topCategoriesAggr.map(c => ({
        name: c._id || "Uncategorized",
        percent: totalTopCatSales > 0 ? Math.round((c.sales / totalTopCatSales) * 100) : 0,
        sales: c.sales
    }));
    // 7. Order Status Distribution (Chart Data)
    const statusAggr = await Order.aggregate([
      { $group: { _id: "$orderStatus", count: { $sum: 1 } } }
    ]);
    const orderStatusData = { labels: statusAggr.map(s => s._id), counts: statusAggr.map(s => s.count) };

    // 8. Payment Method Distribution (Chart Data)
    const paymentAggr = await Order.aggregate([
      { $group: { _id: "$paymentMethod", count: { $sum: 1 } } }
    ]);
    const paymentData = { labels: paymentAggr.map(p => p._id), counts: paymentAggr.map(p => p.count) };

    return res.render("admin/home/dashboard", { 
        user, 
        successSwal, 
        stats, 
        chartLabels, 
        chartData,
        chartTitle,
        filter,
        recentSales,
        topProducts,
        topCategories,
        orderStatusData,
        paymentData
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