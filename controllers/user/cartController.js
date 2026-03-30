import cartSchema     from "../../models/cart.js";
import productSchema   from "../../models/product.js";
import categorySchema  from "../../models/category.js";
import variantSchema   from "../../models/variant.js";
import wishlistSchema  from "../../models/wishlist.js";
import { validateVariantForCart, MAX_CART_QTY } from "../../services/userServices/productService.js";


/* ═══════════════════════════════════════════════════════════════
   LOAD CART
   - Paginated list of cart items (4 per page)
   - Calculates subtotal across ALL items (not just current page)
═══════════════════════════════════════════════════════════════ */
const loadCart = async (req, res) => {
  try {
    if (!req.session.user) return res.redirect("/signin");

    const userId = req.session.user._id;

    const page  = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip  = (page - 1) * limit;

    const categories = await categorySchema.find({
      IsActive: true,
      IsDeleted: false
    });

    /* ================= GET CART ================= */
    let cart = await cartSchema
      .findOne({ User_id: userId })
      .populate("Items.Product_id")
      .populate("Items.Variant_id");

    /* ================= HANDLE NULL CART ================= */
    if (!cart) {
      return res.render("user/cart/cart", {
        cartItems: [],
        categories,
        subtotal: 0,
        discount: 0,
        shipping: 0,
        total: 0,
        currentPage: 1,
        totalPages: 1,
        cartItemCount: 0,
        user: req.session.user
      });
    }

    /* ================= CLEAN INVALID ITEMS ================= */
    cart.Items = (cart.Items || []).filter(
      item => item.Product_id && item.Variant_id
    );
    await cart.save();

    const totalItems = cart.Items.length;

    /* ================= PAGINATION ================= */
    const paginatedItems = cart.Items.slice(skip, skip + limit);

    /* ================= MAP CART ITEMS ================= */
    const cartItems = paginatedItems.map(item => {
      const prod = item.Product_id;
      const vari = item.Variant_id;

      // Product is inactive if explicitly deactivated OR status !== 'active'
      const isActiveProduct = prod?.IsActive !== false && prod?.status === 'active';
      const isActiveVariant = vari?.IsActive !== false;
      const isInStock       = (vari?.stock || 0) > 0;

      // Admin deactivated either the product or its variant
      const isAdminInactive = !isActiveProduct || !isActiveVariant;
      const isAvailable     = isActiveProduct && isActiveVariant && isInStock;

      return {
        quantity:        item.Quantity,
        productId:       prod?._id,
        variantId:       vari?._id,

        isAvailable,    // 🔥 IMPORTANT (use in frontend)
        isAdminInactive, // true when product/variant is deactivated by admin

        product: {
          name:    prod?.productName,
          image:   vari?.images?.[0] || "/images/placeholder.png",
          price:   isAvailable ? (vari?.price || 0) : 0,
          color:   vari?.color,
          ram:     vari?.RAM,
          storage: vari?.storage,
          stock:   vari?.stock || 0,
        }
      };
    });

    /* ================= SUBTOTAL (ONLY AVAILABLE ITEMS) ================= */
    let subtotal = 0;

    cart.Items.forEach(item => {
      const prod = item.Product_id;
      const vari = item.Variant_id;
      const isActiveProduct = prod?.IsActive !== false && prod?.status === 'active';
      const isActiveVariant = vari?.IsActive !== false;
      const isInStock       = (vari?.stock || 0) > 0;

      if (isActiveProduct && isActiveVariant && isInStock) {
        subtotal += (vari.price || 0) * item.Quantity;
      }
    });

    const discount   = 0;
    const shipping   = 0;
    const total      = subtotal - discount + shipping;
    const totalPages = Math.ceil(totalItems / limit);

    /* ================= RENDER ================= */
    res.render("user/cart/cart", {
      cartItems,
      categories,
      subtotal,
      discount,
      shipping,
      total,
      currentPage:   page,
      totalPages,
      cartItemCount: totalItems,
      user:          req.session.user
    });

  } catch (error) {
    console.error("Cart Load Error:", error);
    res.redirect("/");
  }
};

/* ═══════════════════════════════════════════════════════════════
   ADD TO CART
   - Validates stock before adding
   - If item already in cart → increments quantity
   - Removes the product from wishlist if it was wishlisted
   - Enforces per-item max (MAX_QTY_PER_ITEM)
═══════════════════════════════════════════════════════════════ */
const addToCart = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user?.id;

    if (!userId) {
      return res.status(401).json({
        success:      false,
        requiresAuth: true,
        redirect:     "/signin",
        message:      "Please sign in to add items to cart"
      });
    }

    const { productId, variantId, quantity = 1 } = req.body;
    const requestedQty = Math.max(1, Math.min(parseInt(quantity, 10) || 1, MAX_CART_QTY));

    if (!productId || !/^[a-f\d]{24}$/i.test(productId) ||
        !variantId || !/^[a-f\d]{24}$/i.test(variantId)) {
      return res.status(400).json({ success: false, message: "Invalid product or variant." });
    }

    const { variant, error } = await validateVariantForCart(productId, variantId);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    let cart = await cartSchema.findOne({ User_id: userId });
    if (!cart) {
      cart = new cartSchema({ User_id: userId, Items: [] });
    }

    const existingIndex = cart.Items.findIndex(
      (item) => item.Variant_id.toString() === variantId.toString()
    );
    const existingQty = existingIndex >= 0 ? cart.Items[existingIndex].Quantity : 0;

    if (existingQty >= MAX_CART_QTY) {
      return res.json({
        success:      false,
        limitReached: true,
        currentQty:   existingQty,
        message:      `You can only add up to ${MAX_CART_QTY} units of this product.`,
      });
    }

    const canAdd   = MAX_CART_QTY - existingQty;
    const stockCap = (variant.stock - 1) - existingQty; // 🔥 User requirement: max in cart = stock - 1
    const allowedQty = Math.min(requestedQty, canAdd, stockCap);

    if (allowedQty <= 0) {
      let message = "";
      if (stockCap <= 0) {
        message = variant.stock <= 1 
          ? "This item is currently unavailable for purchase (minimum stock requirement)."
          : `You can only add up to ${variant.stock - 1} units of this product.`;
      } else if (canAdd <= 0) {
        message = `You can only add up to ${MAX_CART_QTY} units of this product.`;
      }

      return res.json({
        success:      false,
        limitReached: true,
        message:      message || "Cannot add more of this item."
      });
    }

    if (existingIndex >= 0) {
      cart.Items[existingIndex].Quantity += allowedQty;
    } else {
      cart.Items.push({
        Product_id: productId,
        Variant_id: variantId,
        Quantity:   allowedQty,
        Price:      variant.price
      });
    }

    await cart.save();

    await wishlistSchema.updateOne(
      { User_id: userId },
      { $pull: { Items: { Product_id: productId } } }
    ).catch(() => {});

    const newQty = existingQty + allowedQty;
    const cartCount = cart.Items.reduce((sum, item) => sum + (item.Quantity || 0), 0);
    req.session.cartItemCount = cartCount;

    return res.json({
      success:      true,
      cartCount:    cartCount,
      newQty:       newQty,
      limitReached: newQty >= MAX_CART_QTY || newQty >= (variant.stock - 1),
      canAddMore:   Math.min(MAX_CART_QTY, variant.stock - 1) - newQty,
      message:      "Item added to cart",
    });

  } catch (error) {
    console.error("addToCart error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

/* ═══════════════════════════════════════════════════════════════
   UPDATE QUANTITY
   - Increment or decrement
   - Validates against real-time stock
   - Enforces MAX_QTY_PER_ITEM cap
   - Returns updated subtotal so client can sync summary
   - User requirement: max items = stock - 1
═══════════════════════════════════════════════════════════════ */
const updateQuantity = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { variantId, productId, quantity } = req.body;
    const newQty = parseInt(quantity, 10);
    const userId = req.session.user._id;

    if (!Number.isInteger(newQty) || newQty < 1) {
      return res.status(400).json({ success: false, message: "Invalid quantity" });
    }

    if (!productId || !/^[a-f\d]{24}$/i.test(productId) ||
        !variantId || !/^[a-f\d]{24}$/i.test(variantId)) {
      return res.status(400).json({ success: false, message: "Invalid product or variant." });
    }

    // Re-fetch using strict logic
    const { variant, error } = await validateVariantForCart(productId, variantId);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const maxAllowed = Math.max(0, variant.stock - 1);
    if (newQty > maxAllowed) {
      return res.status(400).json({
        success: false,
        message: maxAllowed === 0 
          ? "This item is currently unavailable for purchase."
          : `Only ${maxAllowed} unit${maxAllowed > 1 ? "s" : ""} can be added to cart.`
      });
    }
    
    if (newQty > MAX_CART_QTY) {
      return res.status(400).json({
        success: false,
        message: `You can only add up to ${MAX_CART_QTY} units of this product.`
      });
    }

    const cart = await cartSchema.findOne({ User_id: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const itemIndex = cart.Items.findIndex(
      item => item.Variant_id.toString() === variantId.toString()
    );
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: "Item not in cart" });
    }

    cart.Items[itemIndex].Quantity = newQty;
    await cart.save();

    // Recalculate full subtotal
    const populatedCart = await cartSchema
      .findOne({ User_id: userId })
      .populate("Items.Variant_id");

    let subtotal = 0;
    populatedCart.Items.forEach(item => {
      if (item.Variant_id) subtotal += item.Variant_id.price * item.Quantity;
    });

    res.json({
      success:     true,
      message:     "Quantity updated",
      newQuantity: newQty,
      rowTotal:    variant.price * newQty,
      subtotal,
      total:       subtotal  // add shipping/discount logic here if needed
    });

  } catch (error) {
    console.error("updateQuantity error:", error);
    res.status(500).json({ success: false, message: "Failed to update quantity" });
  }
};

/* ═══════════════════════════════════════════════════════════════
   REMOVE ITEM FROM CART
   - Pulls the item from the cart's Items array
   - Returns updated cart count for navbar badge
═══════════════════════════════════════════════════════════════ */
const removeFromCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { variantId, productId } = req.body;
    const userId = req.session.user._id;

    const cart = await cartSchema.findOne({ User_id: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const beforeLen = cart.Items.length;
    cart.Items = cart.Items.filter(
      item => item.Variant_id.toString() !== variantId.toString()
    );

    if (cart.Items.length === beforeLen) {
      return res.status(404).json({ success: false, message: "Item not found in cart" });
    }

    await cart.save();

    const cartItemCount       = cart.Items.length;
    req.session.cartItemCount = cartItemCount;

    res.json({
      success:   true,
      message:   "Item removed from cart",
      cartCount: cartItemCount
    });

  } catch (error) {
    console.error("removeFromCart error:", error);
    res.status(500).json({ success: false, message: "Failed to remove item" });
  }
};

/* ═══════════════════════════════════════════════════════════════
   CLEAR ENTIRE CART  (utility — useful for post-order cleanup)
═══════════════════════════════════════════════════════════════ */
const clearCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const userId = req.session.user._id;
    await cartSchema.findOneAndUpdate(
      { User_id: userId },
      { $set: { Items: [] } }
    );

    req.session.cartItemCount = 0;
    res.json({ success: true, message: "Cart cleared" });

  } catch (error) {
    console.error("clearCart error:", error);
    res.status(500).json({ success: false, message: "Failed to clear cart" });
  }
};

export { loadCart, addToCart, updateQuantity, removeFromCart, clearCart };






// import cartSchema from "../../models/cart.js";
// import productSchema from "../../models/product.js";
// import categorySchema from "../../models/category.js";
// import variantSchema from "../../models/variant.js";

// const loadCart = async (req, res) => {
//   try {
//     if (!req.session.user) return res.redirect("/signin");
//     const userId = req.session.user._id;

//     const page = parseInt(req.query.page) || 1;
//     const limit = 4;
//     const skip = (page - 1) * limit;

//     const categories = await categorySchema.find({ IsActive: true, IsDeleted: false });

//     const cart = await cartSchema.findOne({ User_id: userId })
//       .populate("Items.Product_id")
//       .populate("Items.Variant_id");

//     if (!cart || cart.Items.length === 0) {
//       return res.render("user/cart/cart", {
//         cartItems: [],
//         categories,
//         subtotal: 0,
//         discount: 0,
//         shipping: 0,
//         total: 0,
//         currentPage: 1,
//         totalPages: 1,
//         cartItemCount: 0,
//         user: req.session.user
//       });
//     }

//     const totalItems = cart.Items.length;
//     const paginatedItems = cart.Items.slice(skip, skip + limit);

//     const cartItems = paginatedItems.map(item => ({
//       quantity: item.Quantity,
//       productId: item.Product_id?._id,
//       variantId: item.Variant_id?._id,
//       product: {
//         name: item.Product_id?.productName,
//         image: (item.Variant_id?.images && item.Variant_id.images.length > 0) ? item.Variant_id.images[0] : '/images/placeholder.png',
//         price: item.Variant_id?.price,
//         color: item.Variant_id?.color,
//         ram: item.Variant_id?.RAM,
//         storage: item.Variant_id?.storage,
//         stock: item.Variant_id?.stock
//       }
//     }));

//     let subtotal = 0;
//     cart.Items.forEach(item => {
//       if (item.Variant_id) {
//         subtotal += item.Variant_id.price * item.Quantity;
//       }
//     });

//     const discount = 0;
//     const shipping = 0;
//     const total = subtotal - discount + shipping;
//     const totalPages = Math.ceil(totalItems / limit);

//     res.render("user/cart/cart", {
//       cartItems,
//       subtotal,
//       discount,
//       shipping,
//       total,
//       currentPage: page,
//       totalPages,
//       cartItemCount: totalItems,
//       user: req.session.user
//     });

//   } catch (error) {
//     console.log("Cart Load Error:", error);
//     res.redirect("/");
//   }
// };

// const addToCart = async (req, res) => {
//     try {
//         if (!req.session.user) return res.status(401).json({ success: false, message: "Please sign in to add items to cart" });
        
//         const { productId, variantId } = req.body;
//         const userId = req.session.user._id;

//         const variant = await variantSchema.findById(variantId);
//         if (!variant || variant.stock <= 0) {
//             return res.status(400).json({ success: false, message: "Product variant is out of stock or unavailable" });
//         }

//         let cart = await cartSchema.findOne({ User_id: userId });
        
//         if (!cart) {
//             cart = await cartSchema.create({
//                 User_id: userId,
//                 Items: [{
//                     Product_id: productId,
//                     Variant_id: variantId,
//                     Quantity: 1,
//                     Price: variant.price
//                 }]
//             });
//         } else {
//             const itemIndex = cart.Items.findIndex(item => item.Variant_id.toString() === variantId);
//             if (itemIndex > -1) {
//                 // Check if adding more would exceed stock
//                 if (cart.Items[itemIndex].Quantity + 1 > variant.stock) {
//                     return res.status(400).json({ success: false, message: "Maximum available stock reached" });
//                 }
//                 cart.Items[itemIndex].Quantity += 1;
//             } else {
//                 cart.Items.push({
//                     Product_id: productId,
//                     Variant_id: variantId,
//                     Quantity: 1,
//                     Price: variant.price
//                 });
//             }
//             await cart.save();
//         }

//         const cartItemCount = cart.Items.length;
//         req.session.cartItemCount = cartItemCount;

//         res.json({ success: true, message: "Item added to cart", cartCount: cartItemCount });

//     } catch (error) {
//         console.error("addToCart error:", error);
//         res.status(500).json({ success: false, message: "Failed to add item to cart" });
//     }
// };

// export { loadCart, addToCart };
