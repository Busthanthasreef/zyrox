import userSchema from "../../models/user.js";
import productSchema from "../../models/product.js";
import categorySchema from "../../models/category.js";
import variantSchema from "../../models/variant.js";

/* =====================================
   LOAD PRODUCT LIST (WITH PAGINATION)
===================================== */
const loadProducts = async (req, res) => {

  try {
    const search = req.query.search || "";
    const statusFilter= req.query.status || "";
    const admin = await userSchema.findOne({ isAdmin: true });
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;
    const products = await productSchema.find().populate("Category_id").skip(skip).limit(limit);
    const totalProducts = await productSchema.countDocuments();
    const totalPages = Math.ceil(totalProducts / limit);
    const categories = await categorySchema.find({IsDeleted:false});

    res.render("admin/products/productManagement", {
      admin,
      limit,
      products,
      totalProducts,
      categories,
      search,
      statusFilter,
      categoryFilter: null,
      currentPage: page,
      totalPages
    });

  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
};


/* =====================================
   LOAD ADD PRODUCT PAGE
===================================== */
const loadAddProduct = async (req, res) => {
  try {
    const categories = await categorySchema.find({});
   console.log(categories)
    res.render("admin/products/addProduct", {
      categories
    });

  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error",":",error.message);
  }
};


/* =====================================
   ADD PRODUCT
===================================== */
const addProduct = async (req, res) => {
  try {

    const { productName, description, category, status, variants } = req.body;
    const productImages = req.files ? req.files.filter(f => f.fieldname === 'images').map(file => file.path) : [];

    const existed = await productSchema.findOne({ Product_name: productName });
    if(!productName || !description || !category || !status || !variants) return res.status(401).json({success:false,message:"all Fields are required"})
    if (existed)  return res.status(400).json({success: false, message: "Pruct already exists" });
    if(!variants[0].color) return res.status(400).json({success:false,message:'select an color for default variant'});
    // if(!variants[0])
    
    

    const newProduct = await productSchema.create({
      Product_name: productName,
      Description: description,
      Category_id: category,
      status,
      Product_images: productImages
    });

    await variantSchema.create({
      productId: newProduct._id,
      color: variants[0].color,
      colorCode: variants[0].colorHex,
      price: Number(variants[0].price),
      stock: Number(variants[0].stock),
      sku: variants[0].sku,
      isActive: variants[0].isActive === "true",
      IsDefault: true
    });

    res.redirect("/admin/products");

  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
}


/* =====================================
   LOAD EDIT PRODUCT
===================================== */
const loadEditProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await productSchema
      .findById(id)
      .populate("category");

    const variants = await variantSchema.find({ productId: id });
    const categories = await categorySchema.find();

    res.render("admin/products/editProduct", {
      product,
      variants,
      categories
    });

  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
};


/* =====================================
   EDIT PRODUCT
===================================== */
const editProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { productName, description, category, status } = req.body;

    const product = await productSchema.findById(id);
    let productImages = product.Product_images || [];

    if (req.files && req.files.length > 0) {
      const newImages = req.files.filter(f => f.fieldname === 'images').map(f => f.path);
      if (newImages.length > 0) {
        productImages = newImages; // Replace or append based on your logic, here we replace
      }
    }

    await productSchema.findByIdAndUpdate(id, {
      Product_name: productName,
      Description: description,
      Category_id: category,
      status,
      Product_images: productImages
    });

    res.redirect("/admin/products");

  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
};


export {
  loadProducts,
  loadAddProduct,
  addProduct,
  loadEditProduct,
  editProduct
};