import userSchema from "../../models/user.js";

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const loadUserManagement = async (req, res) => {
  try {
    const search = req.query.search || "";
    const statusFilter = req.query.status || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const safeSearch = escapeRegex(search);

    const query = {
      isAdmin: false,
      $or: [
        { Name: { $regex: safeSearch, $options: 'i' } },
        { Email: { $regex: safeSearch, $options: 'i' } }
      ]
    };

    if (statusFilter === 'active') {
      query.isActive = true;
    } else if (statusFilter === 'blocked') {
      query.isActive = false;
    }
    const admin=await userSchema.findOne({isAdmin:true})

    const users = await userSchema.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    const totalUsers = await userSchema.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);

    res.render("admin/users/users", {
      admin,
      users,
      search,
      statusFilter,
      currentPage: page,
      totalPages,
      totalUsers,
      limit
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
      console.log("Invalid request");
      return res.redirect("/admin/users");
    }

    const isActive = status === "block" ? false : true;
    await userSchema.findByIdAndUpdate(id, { isActive });

    const referer = req.get("Referrer") || "/admin/users";
    res.redirect(referer);

  } catch (error) {
    console.error("User status update error:", error);
    res.status(500).send("Server Error");
  }
};

const userDetails = async (req, res) => {
  try {
    const userId = req.query.id;
    const user = await userSchema.findById(userId);

    if (!user) {
      return res.redirect("/admin/users");
    }

    res.render("admin/users/userDetails", { user });

  } catch (error) {
    console.error("User details error:", error);
    res.status(500).send("Server Error");
  }
};

export { loadUserManagement, userStatus, userDetails };