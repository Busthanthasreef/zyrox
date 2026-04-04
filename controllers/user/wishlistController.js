import Wishlist from "../../models/wishlist.js";
import Category from "../../models/category.js";
import Product from "../../models/product.js";
import Variant from "../../models/variant.js";
import Cart from "../../models/cart.js"



// const getCartItemCount = async (userId) => {
//     if (!userId) return 0;
//     try {
//         const cart = await Cart.findOne({ User_id: userId }).select("Items").lean();
//         return cart?.Items?.length ?? 0;
//     } catch {
//         return 0;
//     }
// };

const toggleWishlist = async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, message: "Please sign in" });

        const userId = req.session.user._id;
        const { productId } = req.body;

        let wishlist = await Wishlist.findOne({ User_id: userId });
        if (!wishlist) {
            wishlist = new Wishlist({ User_id: userId, Products: [productId] });
            await wishlist.save();
            return res.json({ success: true, action: 'added' });
        }

        const productIndex = wishlist.Products.findIndex(p => p.toString() === productId);
        if (productIndex > -1) {
            wishlist.Products.splice(productIndex, 1);
            await wishlist.save();
            return res.json({ success: true, action: 'removed' });
        } else {
            wishlist.Products.push(productId);
            await wishlist.save();
            return res.json({ success: true, action: 'added' });
        }

    } catch (error) {
        console.error("toggleWishlist error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const loadWishlist = async (req, res) => {
    try {
        if (!req.session.user) return res.redirect("/signin");
        const userId = req.session.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = 8;
        const skip = (page - 1) * limit;

        const [categories, wishlistData] = await Promise.all([
            Category.find({ IsDeleted: false }),
            Wishlist.findOne({ User_id: userId }).populate({
                path: "Products",
                match: { IsDeleted: false }
            })
        ]);

        let wishlistProducts = wishlistData ? wishlistData.Products : [];
        
        // Fetch display variant for each product
        const products = await Promise.all(wishlistProducts.map(async (p) => {
            const variant = await Variant.findOne({ productId: p._id, IsDeleted: false, IsActive: true }).sort({ IsDefault: -1 });
            if (!variant) return null;
            return {
                id: p._id,
                name: p.productName,
                brand: p.brandName || "Zyrox Premium",
                image: (variant.images && variant.images.length > 0) ? variant.images[0] : "/images/placeholder.png",
                price: variant.price,
                oldPrice: variant.oldPrice,
                variantId: variant._id,
                stock: variant.stock,
            };
        }));

        let filteredProducts = products.filter(p => p !== null);

        const sortOption = req.query.sort || 'default';
        if (sortOption === 'price_asc') {
            filteredProducts.sort((a, b) => a.price - b.price);
        } else if (sortOption === 'price_desc') {
            filteredProducts.sort((a, b) => b.price - a.price);
        } else if (sortOption === 'name_asc') {
            filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortOption === 'name_desc') {
            filteredProducts.sort((a, b) => b.name.localeCompare(a.name));
        }

        const totalProducts = filteredProducts.length;
        const totalPages = Math.ceil(totalProducts / limit);
        const paginatedProducts = filteredProducts.slice(skip, skip + limit);
         const cart = await Cart.findOne({ User_id: userId }).select("Items").lean();
        const cartItemCount=cart?.Items?.length ?? 0;
        
        res.render("user/wishlist/wishlist", {
            user: req.session.user,
            userId:req.session.user._id,
            wishlist: paginatedProducts,
            currentPage: page,
            totalPages: totalPages,
            categories,
            cartItemCount,
            currentSort: sortOption
        });
    } catch (error) {
        console.error("loadWishlist error:", error);
        res.redirect("/");
    }
};

export { toggleWishlist, loadWishlist };
