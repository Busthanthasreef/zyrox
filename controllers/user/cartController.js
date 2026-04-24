import cartSchema     from "../../models/cart.js";
import productSchema   from "../../models/product.js";
import categorySchema  from "../../models/category.js";
import variantSchema   from "../../models/variant.js";
import wishlistSchema  from "../../models/wishlist.js";
import { validateVariantForCart, MAX_CART_QTY } from "../../services/userServices/productService.js";
import { calculateBestOffer, applyOffer } from "../../utils/offerHelper.js";



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
        hasUnavailableItems: false,
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
    const cartItems = await Promise.all(paginatedItems.map(async (item) => {
      const prod = item.Product_id;
      const vari = item.Variant_id;

      const isActiveProduct = prod?.status === 'active' && prod?.IsDeleted !== true;
      const isActiveVariant = vari?.IsActive !== false && vari?.IsDeleted !== true;
      const isInStock       = (vari?.stock || 0) > 0;

      const isAdminInactive = !isActiveProduct || !isActiveVariant;
      const isAvailable     = isActiveProduct && isActiveVariant && isInStock;
      
      const originalPrice = vari?.price || 0;
      let discountedPrice = originalPrice;
      
      if (isAvailable) {
        const bestOffer = await calculateBestOffer(prod._id, prod.categoryId, originalPrice);
        discountedPrice = bestOffer ? applyOffer(originalPrice, bestOffer) : originalPrice;
      }

      return {
        quantity:        item.Quantity,
        productId:       prod?._id,
        variantId:       vari?._id,

        isAvailable,    
        isAdminInactive,
        
        product: {
          name:          prod?.productName,
          image:         vari?.images?.[0] || "/images/placeholder.png",
          originalPrice: originalPrice,
          price:         discountedPrice,
          color:         vari?.color,
          ram:           vari?.RAM,
          storage:       vari?.storage,
          stock:         vari?.stock || 0,
        }
      };
    }));

    /* ================= SUBTOTAL & GLOBAL AVAILABILITY ================= */
    let subtotal = 0;
    let totalOfferDiscount = 0;
    let hasUnavailableItems = false;

    for (const item of cart.Items) {
      const prod = item.Product_id;
      const vari = item.Variant_id;
      
      const isActiveProduct = prod?.status === 'active' && prod?.IsDeleted !== true;
      const isActiveVariant = vari?.IsActive !== false && vari?.IsDeleted !== true;
      const isInStock       = (vari?.stock || 0) >= item.Quantity;

      if (isActiveProduct && isActiveVariant && isInStock) {
        const originalPrice = vari.price || 0;
        const bestOffer = await calculateBestOffer(prod._id, prod.categoryId, originalPrice);
        const discountedPrice = bestOffer ? applyOffer(originalPrice, bestOffer) : originalPrice;
        
        subtotal += originalPrice * item.Quantity;
        totalOfferDiscount += (originalPrice - discountedPrice) * item.Quantity;
      } else {
        hasUnavailableItems = true;
      }
    }

    const discount   = totalOfferDiscount;
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
      hasUnavailableItems,
      user:          req.session.user
    });

  } catch (error) {
    console.error("Cart Load Error:", error);
    res.redirect("/");
  }
};

/* ═══════════════════════════════════════════════════════════════
   ADD TO CART
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

    // Validate IDs
    if (!productId || !/^[a-f\d]{24}$/i.test(productId) ||
        !variantId || !/^[a-f\d]{24}$/i.test(variantId)) {
      return res.status(400).json({ success: false, message: "Invalid product or variant." });
    }

    // Validate variant exists and is purchasable
    const { variant, error } = await validateVariantForCart(productId, variantId);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    // Get or create cart
    let cart = await cartSchema.findOne({ User_id: userId });
    if (!cart) {
      cart = new cartSchema({ User_id: userId, Items: [] });
    }

    // Find existing item for this variant
    const existingIndex = cart.Items.findIndex(
      (item) => item.Variant_id.toString() === variantId.toString()
    );
    const existingQty = existingIndex >= 0 ? cart.Items[existingIndex].Quantity : 0;

    // Hard cap: already at or over MAX_CART_QTY
    if (existingQty >= MAX_CART_QTY) {
      return res.json({
        success:      false,
        limitReached: true,
        currentQty:   existingQty,
        message:      `You can only add up to ${MAX_CART_QTY} units of this product.`,
      });
    }

    // FIX: stockCap uses Math.max(0, ...) to prevent negative values
    const canAdd     = MAX_CART_QTY - existingQty;
    const stockCap   = Math.max(0, variant.stock - existingQty);
    const allowedQty = Math.min(requestedQty, canAdd, stockCap);

    if (allowedQty <= 0) {
      let message = "";
      if (stockCap <= 0) {
        message = `Only ${variant.stock} unit${variant.stock === 1 ? "" : "s"} available and you already have ${existingQty} in your cart.`;
      } else if (canAdd <= 0) {
        message = `You can only add up to ${MAX_CART_QTY} units of this product.`;
      } else {
        message = "Cannot add more of this item.";
      }

      return res.json({
        success:      false,
        limitReached: true,
        message
      });
    }

    // Update or insert item
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

    // Remove from wishlist (best-effort, non-fatal)
    await wishlistSchema.updateOne(
      { User_id: userId },
      { $pull: { Products: productId } }
    ).catch(() => {});

    const newQty = existingQty + allowedQty;

    // FIX: cartCount = distinct items in cart, not sum of quantities
    const cartCount = cart.Items.length;
    req.session.cartItemCount = cartCount;

    return res.json({
      success:      true,
      cartCount,                                              // distinct item count for navbar badge
      newQty,                                                 // total units of THIS variant in cart
      limitReached: newQty >= MAX_CART_QTY || newQty >= variant.stock,
      canAddMore:   Math.min(MAX_CART_QTY, variant.stock) - newQty,
      message:      "Item added to cart",
    });

  } catch (error) {
    console.error("addToCart error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

/* ═══════════════════════════════════════════════════════════════
   UPDATE QUANTITY
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

    const { variant, error } = await validateVariantForCart(productId, variantId);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const maxAllowed = Math.max(0, variant.stock);
    if (newQty > maxAllowed) {
      return res.status(400).json({
        success: false,
        message: maxAllowed === 0 
          ? "This item is currently unavailable for purchase."
          : `Only ${maxAllowed} unit${maxAllowed > 1 ? "s" : ""} available.`
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

    // Recalculate totals
    const populatedCart = await cartSchema
      .findOne({ User_id: userId })
      .populate("Items.Variant_id")
      .populate("Items.Product_id");

    let subtotal = 0;
    let totalOfferDiscount = 0;
    
    for (const item of populatedCart.Items) {
      const prod = item.Product_id;
      const vari = item.Variant_id;
      if (prod && vari) {
        const originalPrice   = vari.price || 0;
        const bestOffer       = await calculateBestOffer(prod._id, prod.categoryId, originalPrice);
        const discountedPrice = bestOffer ? applyOffer(originalPrice, bestOffer) : originalPrice;
        
        subtotal           += originalPrice   * item.Quantity;
        totalOfferDiscount += (originalPrice - discountedPrice) * item.Quantity;
      }
    }

    res.json({
      success:     true,
      message:     "Quantity updated",
      newQuantity: newQty,
      subtotal,
      discount:    totalOfferDiscount,
      total:       subtotal - totalOfferDiscount
    });

  } catch (error) {
    console.error("updateQuantity error:", error);
    res.status(500).json({ success: false, message: "Failed to update quantity" });
  }
};

/* ═══════════════════════════════════════════════════════════════
   REMOVE ITEM FROM CART
═══════════════════════════════════════════════════════════════ */
const removeFromCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { variantId } = req.body;
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
   CLEAR ENTIRE CART
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