import categorySchema from "../../models/category.js";
import productSchema from "../../models/product.js";
import mongoose from "mongoose";

/* ================= LOAD CATEGORIES ================= */

export const getCategoriesService = async (page, search, statusFilter, sortBy, countFilter) => {

  const query = { IsDeleted: false };

  if (search) {
    const isObjectId = mongoose.Types.ObjectId.isValid(search);
    query.$or = [
      { categoryName: { $regex: search, $options: "i" } }
    ];
    if (isObjectId) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(search) });
    }
  }

  if (statusFilter === "active") {
    query.IsActive = true;
  } else if (statusFilter === "blocked") {
    query.IsActive = false;
  }

  let sortObj = { createdAt: -1 };
  if (sortBy === "name_asc") sortObj = { categoryName: 1 };
  if (sortBy === "name_desc") sortObj = { categoryName: -1 };
  if (sortBy === "newest") sortObj = { createdAt: -1 };
  if (sortBy === "oldest") sortObj = { createdAt: 1 };

  const limit = 4;
  const skip = (page - 1) * limit;

  const pipeline = [
    { $match: query },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "categoryId",
        as: "products"
      }
    },
    {
      $addFields: {
        productCount: {
          $size: {
            $filter: {
              input: "$products",
              as: "prod",
              cond: { $eq: ["$$prod.IsDeleted", false] }
            }
          }
        }
      }
    }
  ];

  if (countFilter === "has_products") {
    pipeline.push({ $match: { productCount: { $gt: 0 } } });
  } else if (countFilter === "no_products") {
    pipeline.push({ $match: { productCount: { $eq: 0 } } });
  }

  const filteredCategoriesResult = await categorySchema.aggregate([...pipeline, { $count: "total" }]);
  const filteredCount = filteredCategoriesResult.length > 0 ? filteredCategoriesResult[0].total : 0;
  const totalPages = Math.ceil(filteredCount / limit) || 1;

  pipeline.push({ $sort: sortObj });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });
  pipeline.push({ $project: { products: 0 } });

  const categories = await categorySchema.aggregate(pipeline);

  const totalCategories = await categorySchema.countDocuments({ IsDeleted: false });
  const activeCategories = await categorySchema.countDocuments({ IsActive: true, IsDeleted: false });
  const inActiveCategories = await categorySchema.countDocuments({ IsActive: false, IsDeleted: false });

  return {
    categories,
    limit,
    totalPages,
    currentPage: page,
    totalCategories,
    activeCategories,
    inActiveCategories
  };
};


/* ================= CREATE CATEGORY ================= */

export const createCategoryService = async (categoryName, status) => {

  if (!categoryName || !categoryName.trim()) {
    return {
      statusCode: 400,
      response: {
        success: false,
        message: "Category name cannot be blank"
      }
    };
  }

  const trimmedName = categoryName.trim();

  // Validate: letters and spaces only, min 2 chars
  if (trimmedName.length < 2) {
    return {
      statusCode: 400,
      response: {
        success: false,
        message: "Category name must be at least 2 characters"
      }
    };
  }

  // Check for deleted category with same name (case-insensitive) — restore it
  const deleted = await categorySchema.findOne({
    categoryName: trimmedName,
    IsDeleted: true
  });

  if (deleted) {
    deleted.IsDeleted = false;
    deleted.IsActive = status;
    deleted.categoryName = trimmedName;
    await deleted.save();

    return {
      statusCode: 200,
      response: {
        success: true,
        message: `"${trimmedName}" restored successfully`,
        category: { _id: deleted._id, categoryName: deleted.categoryName }
      }
    };
  }

  // Check for existing active category (case-insensitive)
  const exists = await categorySchema.findOne({
    categoryName: { $regex: new RegExp(`^${trimmedName}$`, "i") },
    IsDeleted: false
  });

  if (exists) {
    return {
      statusCode: 409,
      response: {
        success: false,
        message: `Category "${trimmedName}" already exists`
      }
    };
  }

  const newCategory = await categorySchema.create({
    categoryName: trimmedName,
    IsActive: status,
    IsDeleted: false
  });

  return {
    statusCode: 201,
    response: {
      success: true,
      message: `Category "${trimmedName}" created successfully`,
      category: { _id: newCategory._id, categoryName: newCategory.categoryName }
    }
  };
};


/* ================= UPDATE CATEGORY ================= */

export const updateCategoryService = async (id, categoryName, status) => {

  if (!categoryName || !categoryName.trim()) {
    return {
      statusCode: 400,
      response: {
        success: false,
        message: "Category name cannot be blank"
      }
    };
  }

  const trimmedName = categoryName.trim();

  const duplicate = await categorySchema.findOne({
    _id: { $ne: id },
    categoryName: { $regex: new RegExp(`^${trimmedName}$`, "i") },
    IsDeleted: false
  });

  if (duplicate) {
    return {
      statusCode: 409,
      response: {
        success: false,
        message: "Another category with this name already exists"
      }
    };
  }

  const isActive = status === true || status === "true";

  await categorySchema.findByIdAndUpdate(id, {
    categoryName: trimmedName,
    IsActive: isActive
  });

  await productSchema.updateMany(
    { categoryId: id },
    { status: isActive ? "active" : "inactive" }
  );

  return {
    statusCode: 200,
    response: {
      success: true,
      message: "Category updated successfully"
    }
  };
};


/* ================= DELETE CATEGORY ================= */

export const deleteCategoryService = async (id) => {

  await categorySchema.findByIdAndUpdate(id, {
    IsDeleted: true,
    IsActive: false
  });

  await productSchema.updateMany(
    { categoryId: id },
    { IsDeleted: true, status: "inactive" }
  );

  return {
    statusCode: 200,
    response: {
      success: true,
      message: "Category deleted successfully"
    }
  };
};


/* ================= TOGGLE CATEGORY STATUS ================= */

export const toggleCategoryStatusService = async (id) => {
  const category = await categorySchema.findById(id);
  if (!category) {
    return {
      statusCode: 404,
      response: { success: false, message: "Category not found" }
    };
  }

  const newStatus = !category.IsActive;
  category.IsActive = newStatus;
  await category.save();

  await productSchema.updateMany(
    { categoryId: id },
    { status: newStatus ? "active" : "inactive" }
  );

  return {
    statusCode: 200,
    response: {
      success: true,
      message: `Category ${newStatus ? "activated" : "deactivated"} successfully`,
      isActive: newStatus
    }
  };
};
