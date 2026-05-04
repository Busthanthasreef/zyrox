import {getCategoriesService,createCategoryService,updateCategoryService,deleteCategoryService, toggleCategoryStatusService} from "../../services/adminServices/categoryService.js";

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ================= LOAD CATEGORIES ================= */

const loadCategories = async (req, res) => {
  try {

    const page = parseInt(req.query.page) || 1;
    const search = req.query.search || "";
    const statusFilter = req.query.status || "";
    const countFilter = req.query.countFilter || "";
    const sortBy = req.query.sortBy || "newest";

    const safeSearch = escapeRegex(search);

    const data = await getCategoriesService(page, safeSearch, statusFilter, sortBy, countFilter);

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({
        success: true,
        ...data,
        search,
        statusFilter,
        countFilter,
        sortBy
      });
    }

    res.render("admin/category/Categories", {
      admin: req.session.admin,
      ...data,
      search,
      statusFilter,
      countFilter,
      sortBy
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};


/* ================= ADD CATEGORY ================= */

const addCategory = async (req, res) => {
  try {

    const { categoryName } = req.body;
    const status = req.body.status === true || req.body.status === "true";

    const result = await createCategoryService(categoryName, status);

    return res.status(result.statusCode).json(result.response);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};


/* ================= EDIT CATEGORY ================= */

const editCategory = async (req, res) => {
  try {

    const { id } = req.params;
    const { categoryName, status } = req.body;

    const result = await updateCategoryService(id, categoryName, status);

    return res.status(result.statusCode).json(result.response);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Update failed"
    });
  }
};


/* ================= DELETE CATEGORY ================= */

const deleteCategory = async (req, res) => {
  try {

    const id = req.params.id;

    const result = await deleteCategoryService(id);

    return res.status(result.statusCode).json(result.response);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Delete failed"
    });
  }
};


/* ================= TOGGLE CATEGORY STATUS ================= */
const toggleCategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await toggleCategoryStatusService(id);
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Toggle failed" });
  }
};


export {
  loadCategories,
  addCategory,
  editCategory,
  deleteCategory,
  toggleCategoryStatus
};