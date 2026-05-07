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

const userDetails = async (req, res) => {
  try {
    const [user, admin] = await Promise.all([
      getUserById(req.query.id),
      getAdmin(),
    ]);

    if (!user) return res.redirect("/adminUser/users");

    res.render("admin/users/userDetails", { user, admin });
  } catch (error) {
    console.error("User details error:", error);
    res.status(500).send("Server Error");
  }
};

export { loadUserManagement, userStatus, userDetails };