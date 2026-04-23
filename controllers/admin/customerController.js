import userSchema from "../../models/user.js";

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const loadUserManagement = async (req, res) => {
  try {
    const search = req.query.search || "";
    const statusFilter = req.query.status || "";
    const sortBy = req.query.sortBy || "newest";
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

    let sortObj = { createdAt: -1 };
    if (sortBy === "name_asc") sortObj = { Name: 1 };
    if (sortBy === "name_desc") sortObj = { Name: -1 };
    if (sortBy === "newest") sortObj = { createdAt: -1 };
    if (sortBy === "oldest") sortObj = { createdAt: 1 };

    const users = await userSchema.find(query)
      .sort(sortObj)
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
      sortBy,
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

   
    res.redirect("/admin/users");

  } catch (error) {
    console.error("User status update error:", error);
    res.status(500).send("Server Error");
  }
};

const userDetails = async (req, res) => {
  try {
    const userId = req.query.id;
    const user = await userSchema.findById(userId);
    const admin = await userSchema.findOne({isAdmin:true});

    if (!user) {
      return res.redirect("/admin/users");
    }

    res.render("admin/users/userDetails", { user,admin });

  } catch (error) {
    console.error("User details error:", error);
    res.status(500).send("Server Error");
  }
};

export { loadUserManagement, userStatus, userDetails };