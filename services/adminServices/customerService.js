import userSchema from "../../models/user.js";
import Order from "../../models/order.js";

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Fetches a paginated, filtered, and sorted list of non-admin users.
 */
const getUserList = async ({ search = "", statusFilter = "", sortBy = "newest", page = 1, limit = 4 }) => {
  const safeSearch = escapeRegex(search);

  const query = {
    isAdmin: false,
    $or: [
      { Name: { $regex: safeSearch, $options: 'i' } },
      { Email: { $regex: safeSearch, $options: 'i' } },
    ],
  };

  if (statusFilter === 'active') {
    query.isActive = true;
  } else if (statusFilter === 'blocked') {
    query.isActive = false;
  }

  const sortMap = {
    name_asc: { Name: 1 },
    name_desc: { Name: -1 },
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
  };
  const sortObj = sortMap[sortBy] ?? { createdAt: -1 };

  const [users, totalUsers] = await Promise.all([
    userSchema.find(query).sort(sortObj).skip((page - 1) * limit).limit(limit).exec(),
    userSchema.countDocuments(query),
  ]);

  const usersWithOrders = await Promise.all(users.map(async (user) => {
    const totalOrders = await Order.countDocuments({ userId: user._id });
    return { ...user.toObject(), totalOrders };
  }));

  return { users: usersWithOrders, totalUsers, totalPages: Math.ceil(totalUsers / limit) };
};

/**
 * Fetches the admin user document.
 */
const getAdmin = async () => {
  return userSchema.findOne({ isAdmin: true });
};

/**
 * Toggles a user's active/blocked status.
 * @param {string} id   - User ObjectId
 * @param {string} status - "block" | "unblock"
 */
const toggleUserStatus = async (id, status) => {
  const isActive = status !== "block";
  return userSchema.findByIdAndUpdate(id, { isActive }, { returnDocument: 'after' });
};

/**
 * Fetches a single user by ID.
 */
const getUserById = async (id) => {
  return userSchema.findById(id);
};

export { getUserList, getAdmin, toggleUserStatus, getUserById };