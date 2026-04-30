import categorySchema from "../../models/category.js";
import productSchema from "../../models/product.js";
import mongoose from "mongoose";

/* ================= LOAD CATEGORIES ================= */

export const getCategoriesService = async (page, search, statusFilter, sortBy) => {

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

  const filteredCount = await categorySchema.countDocuments(query);
  const totalPages = Math.ceil(filteredCount / limit) || 1;

  const totalCategories = await categorySchema.countDocuments({ IsDeleted: false });
  const activeCategories = await categorySchema.countDocuments({ IsActive: true, IsDeleted: false });
  const inActiveCategories = await categorySchema.countDocuments({ IsActive: false, IsDeleted: false });

  // ✅ AGGREGATION WITH PRODUCT COUNT
  const categories = await categorySchema.aggregate([
    { $match: query },

    { $sort: sortObj },
    { $skip: skip },
    { $limit: limit },

    {
      $lookup: {
        from: "products", // standard Mongoose pluralization
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
              cond: {
                $and: [
                  { $eq: ["$$prod.IsDeleted", false] }   // only count non-deleted products
                ]
              }
            }
          }
        }
      }
    },

    {
      $project: {
        products: 0 // remove product array (optimization)
      }
    }
  ]);

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

  const normalizedName = categoryName.trim().toLowerCase();

  const deleted = await categorySchema.findOne({
    categoryName: normalizedName,
    IsDeleted: true
  });

  if (deleted) {
    deleted.IsDeleted = false;
    deleted.IsActive = status;
    await deleted.save();

    return {
      statusCode: 200,
      response: {
        success: true,
        message: "Category restored successfully"
      }
    };
  }

  const exists = await categorySchema.findOne({
    categoryName: normalizedName,
    IsDeleted: false
  });

  if (exists) {
    return {
      statusCode: 409,
      response: {
        success: false,
        message: "Category already exists"
      }
    };
  }

  await categorySchema.create({
    categoryName: normalizedName,
    IsActive: status,
    IsDeleted: false
  });

  return {
    statusCode: 201,
    response: {
      success: true,
      message: "Category created successfully"
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

  const normalizedName = categoryName.trim().toLowerCase();

  const duplicate = await categorySchema.findOne({
    _id: { $ne: id },
    categoryName: normalizedName,
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
    categoryName: normalizedName,
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



