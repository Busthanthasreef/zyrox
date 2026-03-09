import userSchema from "../../models/user.js";
import Product from "../../models/product.js";
import Category from "../../models/category.js";
import Variant from "../../models/variant.js";

/* ─── strip non-numeric chars: "8GB" → 8, "256GB" → 256 ── */
const parseSpec = (val) => parseInt(String(val).replace(/[^\d]/g, ""), 10);


/* =====================================
   LOAD PRODUCT LIST
===================================== */
const loadProducts = async (req, res) => {
  try {
    const search         = req.query.search   || "";
    const statusFilter   = req.query.status   || "";
    const categoryFilter = req.query.category || "";
    const page           = parseInt(req.query.page) || 1;
    const limit          = 5;
    const skip           = (page - 1) * limit;

    const admin = req.session.admin;

    // ── Build filter ──────────────────────────────────────────────
    const filter = { IsDeleted: false };

    if (search)         filter.productName = { $regex: search, $options: "i" };
    if (statusFilter)   filter.status      = statusFilter;
    if (categoryFilter) filter.categoryId  = categoryFilter;

    // ── Fetch products ────────────────────────────────────────────
    const totalProducts = await Product.countDocuments(filter);
    const totalPages    = Math.ceil(totalProducts / limit);

    const products = await Product.find(filter)
      .populate("categoryId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // ── Fetch all variants for current page products (active ones only) ──
    const productIds  = products.map(p => p._id);
    const allVariants = await Variant.find({ 
      productId: { $in: productIds },
      IsDeleted: { $ne: true }
    }).lean();

    // ── Group variants by productId ───────────────────────────────
    const variantsByProduct = {};
    allVariants.forEach(v => {
      const key = v.productId.toString();
      if (!variantsByProduct[key]) variantsByProduct[key] = [];
      variantsByProduct[key].push(v);
    });

    const categories = await Category.find({ IsDeleted: false }).lean();

    res.render("admin/products/productManagement", {
      products,
      admin,
      limit,
      variantsByProduct,
      totalProducts,
      categories,
      search,
      statusFilter,
      categoryFilter,
      currentPage: page,
      totalPages,
    });

  } catch (error) {
    console.error("loadProducts:", error);
    res.status(500).send("Server Error");
  }
};


/* =====================================
   LOAD ADD PRODUCT PAGE
===================================== */
const loadAddProduct = async (req, res) => {
  try {
    const admin      = req.session.admin || await userSchema.findOne({ isAdmin: true }).lean();
    const categories = await Category.find({ IsDeleted: false }).lean();
    res.render("admin/products/addProduct", { categories, admin });
  } catch (error) {
    console.error("loadAddProduct:", error);
    res.status(500).send("Server Error");
  }
};


/* =====================================
   ADD PRODUCT  (axios POST → JSON)
===================================== */
const addProduct = async (req, res) => {
  try {
    const { productName, description, category, status } = req.body;

    // variants come as variants[0][color] etc → parsed by express as nested object
    const variants = req.body.variants;
    const v0 = Array.isArray(variants) ? variants[0] : (variants?.["0"] ?? variants);

    // ── Validation ────────────────────────────────────────────────
    if (!productName?.trim())
      return res.status(400).json({ success: false, message: "Product name is required" });

    if (!description?.trim())
      return res.status(400).json({ success: false, message: "Description is required" });

    if (!category)
      return res.status(400).json({ success: false, message: "Please select a category" });

    if (!v0?.color?.trim())
      return res.status(400).json({ success: false, message: "Color is required for variant" });

    if (!v0?.ram)
      return res.status(400).json({ success: false, message: "RAM is required for variant" });

    if (!v0?.storage)
      return res.status(400).json({ success: false, message: "Storage is required for variant" });

    if (!v0?.price || Number(v0.price) < 0)
      return res.status(400).json({ success: false, message: "Enter a valid price" });

    if (v0?.stock === undefined || Number(v0.stock) < 0)
      return res.status(400).json({ success: false, message: "Enter a valid stock quantity" });

    // ── Duplicate check ───────────────────────────────────────────
    const existed = await Product.findOne({
      productName: { $regex: `^${productName.trim()}$`, $options: "i" },
      IsDeleted: false,
    });
    if (existed)
      return res.status(400).json({ success: false, message: "Product already exists" });

    // ── Images ────────────────────────────────────────────────────
    // Support both 'variantImages[0]' (static form) and 'variantImages[]' (axios/cropped)
    const variantImages = (req.files || [])
      .filter(f => f.fieldname.startsWith("variantImages"))
      .map(f => f.path);

    // ── Create product ────────────────────────────────────────────
    const newProduct = await Product.create({
      productName: productName.trim(),
      description: description.trim(),
      categoryId:  category,
      status:      status || "active",
    });

    // ── Create default variant ────────────────────────────────────
    await Variant.create({
      productId:  newProduct._id,
      color:      v0.color.trim(),
      colorCode:  v0.colorHex || "#000000",
      RAM:        parseSpec(v0.ram),
      storage:    parseSpec(v0.storage),
      price:      Number(v0.price),
      stock:      Number(v0.stock),
      SKU:        v0.sku?.trim() || "",
      IsActive:   v0.isActive === "true",
      IsDefault:  true,
      images:     variantImages,
    });

    return res.status(201).json({ success: true, message: "Product added successfully" });

  } catch (error) {
    console.error("addProduct:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


/* =====================================
   LOAD EDIT PRODUCT
===================================== */
const loadEditProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const admin  = req.session.admin || await userSchema.findOne({ isAdmin: true }).lean();

    const product = await Product.findById(id).populate("categoryId").lean();
    if (!product) return res.status(404).send("Product not found");

    const variants   = await Variant.find({ productId: id, IsDeleted: false }).lean();
    const categories = await Category.find({ IsDeleted: false }).lean();

    // Identify the default variant for the edit form
    const defaultVariant = variants.find(v => v.IsDefault) || variants[0];

    res.render("admin/products/editProduct", { 
      product, 
      variants, 
      defaultVariant, 
      categories, 
      admin 
    });

  } catch (error) {
    console.error("loadEditProduct:", error);
    res.status(500).send("Server Error");
  }
};


/* =====================================
   EDIT PRODUCT
===================================== */
const editProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      productName, 
      description, 
      category, 
      status,
      // Variant fields potentially coming from a unified edit form
      color,
      ram,
      storage,
      price,
      stock,
      sku
    } = req.body;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    // Update product
    await Product.findByIdAndUpdate(id, {
      productName: productName.trim(),
      description: description.trim(),
      categoryId:  category,
      status,
    });

    // Update default variant if secondary fields are present
    const defaultVariant = await Variant.findOne({ productId: id, IsDefault: true });
    if (defaultVariant) {
      const updates = {};
      if (color)   updates.color = color.trim();
      if (ram)     updates.RAM = parseSpec(ram);
      if (storage) updates.storage = parseSpec(storage);
      if (price)   updates.price = Number(price);
      if (stock)   updates.stock = Number(stock);
      if (sku)     updates.SKU = sku.trim();

      // Handle images if any were uploaded through the edit form
      const newImages = (req.files || [])
        .filter(f => f.fieldname.startsWith("newImages") || f.fieldname.startsWith("variantImages"))
        .map(f => f.path);

      if (newImages.length > 0) {
        // If we want to replace or merge images, we need logic
        // For now, let's say we replace if any new ones come
        updates.images = newImages;
      }

      await Variant.findByIdAndUpdate(defaultVariant._id, updates);
    }

    if (req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: "Product updated successfully" });
    }
    res.redirect("/admin/products");

  } catch (error) {
    console.error("editProduct:", error);
    if (req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: error.message });
    }
    res.status(500).send("Server Error");
  }
};


/* =====================================
   TOGGLE PRODUCT STATUS
===================================== */
const toggleProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) return res.status(404).send("Product not found");

    product.status = product.status === "active" ? "inactive" : "active";
    await product.save();

    res.redirect("/admin/products");
  } catch (error) {
    console.error("toggleProductStatus:", error);
    res.status(500).send("Server Error");
  }
};


/* =====================================
   SOFT DELETE PRODUCT
===================================== */
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await Product.findByIdAndUpdate(id, { IsDeleted: true });
    res.redirect("/admin/products");
  } catch (error) {
    console.error("deleteProduct:", error);
    res.status(500).send("Server Error");
  }
};


export {
  loadProducts,
  loadAddProduct,
  addProduct,
  loadEditProduct,
  editProduct,
  toggleProductStatus,
  deleteProduct,
};