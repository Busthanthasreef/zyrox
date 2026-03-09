import productSchema from "../../models/product.js"
import categorySchema from "../../models/category.js"
import variantSchema from "../../models/variant.js"

const PRICE_MIN = 0;
const PRICE_MAX = 219999;
const ITEMS_PER_PAGE = 12;

const loadProducts = async (req, res) => {
    try {
        const categories = await categorySchema.find({ IsActive: true, IsDeleted: { $ne: true } });

        // Use categories as "brands" for the sidebar with counts
        const brands = await Promise.all(categories.map(async (c) => {
            const count = await productSchema.countDocuments({
                categoryId: c._id,
                status: 'active',
                IsDeleted: { $ne: true }
            });
            return { name: c.categoryName, count };
        }));
        brands.sort((a, b) => a.name.localeCompare(b.name));

        const allVariantsForSidebar = await variantSchema.find({
            IsDeleted: { $ne: true }
        }).lean();

        const colors = [...new Set(allVariantsForSidebar.map(v => v.color).filter(Boolean))].sort();
        const rams = [...new Set(allVariantsForSidebar.map(v => v.RAM).filter(Boolean))].sort((a, b) => a - b);
        const storages = [...new Set(allVariantsForSidebar.map(v => v.storage).filter(Boolean))].sort((a, b) => a - b);

        // ── Query params ──
        const page = parseInt(req.query.page) || 1;
        const sortParam = req.query.sort || '';
        const search = req.query.search || '';
        const brandFilter = req.query.brand ? (Array.isArray(req.query.brand) ? req.query.brand : [req.query.brand]) : [];
        const ramFilter = req.query.ram ? (Array.isArray(req.query.ram) ? req.query.ram : [req.query.ram]) : [];
        const storageFilter = req.query.storage ? (Array.isArray(req.query.storage) ? req.query.storage : [req.query.storage]) : [];
        const colorFilter = req.query.color ? (Array.isArray(req.query.color) ? req.query.color : [req.query.color]) : [];
        const maxPrice = parseInt(req.query.maxPrice) || PRICE_MAX;

        // ── Build product query ──
        const productQuery = {
            status: 'active',
            IsDeleted: { $ne: true }
        };

        if (search) {
            productQuery.productName = { $regex: search, $options: 'i' };
        }

        if (brandFilter.length > 0) {
            const filteredCatIds = categories
                .filter(c => brandFilter.includes(c.categoryName))
                .map(c => c._id);
            productQuery.categoryId = { $in: filteredCatIds };
        }

        // ── Fetch products ──
        let rawProducts = await productSchema.find(productQuery).lean();

        // ── Fetch all active variants for these products ──
        const productIds = rawProducts.map(p => p._id);

        const variantQuery = {
            productId: { $in: productIds },
            IsDeleted: { $ne: true },
            price: { $lte: maxPrice }
        };

        if (ramFilter.length > 0) {
            variantQuery.RAM = { $in: ramFilter.map(r => parseInt(r)) };
        }
        if (storageFilter.length > 0) {
            variantQuery.storage = { $in: storageFilter.map(s => parseInt(s)) };
        }
        if (colorFilter.length > 0) {
            variantQuery.color = { $in: colorFilter };
        }

        const variants = await variantSchema.find(variantQuery).lean();

        // ── Map variants by productId ──
        const variantsByProduct = {};
        variants.forEach(v => {
            const pid = v.productId.toString();
            if (!variantsByProduct[pid]) variantsByProduct[pid] = [];
            variantsByProduct[pid].push(v);
        });

        // ── Shape products for the template ──
        let products = rawProducts
            .filter(p => variantsByProduct[p._id.toString()]?.length > 0)
            .map(p => {
                const pid = p._id.toString();
                const pVariants = variantsByProduct[pid];
                const displayVariant = pVariants.find(v => v.IsDefault) || pVariants[0];

                const brandObj = categories.find(c => c._id.toString() === p.categoryId?.toString());

                return {
                    id: p._id.toString(),
                    name: p.productName,
                    brand: brandObj ? brandObj.categoryName : 'Generic',
                    image: (displayVariant.images && displayVariant.images.length > 0)
                        ? displayVariant.images[0]
                        : '/images/placeholder.png',
                    ram: displayVariant.RAM,
                    storage: displayVariant.storage,
                    price: displayVariant.price,
                    oldPrice: displayVariant.oldPrice || null,
                    stock: displayVariant.stock,
                    rating: p.rating || 0,
                    badge: p.badge || null,
                    variantId: displayVariant._id.toString(),
                };
            });

        // ── Sort ──
        if (sortParam === 'price_asc') products.sort((a, b) => a.price - b.price);
        if (sortParam === 'price_desc') products.sort((a, b) => b.price - a.price);
        if (sortParam === 'name_asc') products.sort((a, b) => a.name.localeCompare(b.name));
        if (sortParam === 'name_desc') products.sort((a, b) => b.name.localeCompare(a.name));

        // ── Pagination ──
        const totalProducts = products.length;
        const totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE);
        const currentPage = Math.min(page, totalPages || 1);
        const paginatedProducts = products.slice(
            (currentPage - 1) * ITEMS_PER_PAGE,
            currentPage * ITEMS_PER_PAGE
        );

        res.render('user/products/productPage', {
            user: req.session.user,
            categories,
            cartItemCount: req.session.cartItemCount || 0,
            products: paginatedProducts,
            totalProducts,
            totalPages,
            currentPage,
            activeFilters: {
                brands: brandFilter,
                rams: ramFilter,
                storages: storageFilter,
                colors: colorFilter,
                maxPrice,
                sort: sortParam,
                search,
            },
            sidebarData: {
                brands,
                colors,
                rams,
                storages
            }
        });

    } catch (error) {
        console.error('loadProducts error:', error);
        res.status(500).send('Server error');
    }
};


const loadProductDetails = async (req, res) => {
    try {
        const categories = await categorySchema.find({ IsActive: true, IsDeleted: { $ne: true } });
        const productId = req.params.id;
        const variantIdReq = req.query.variant;

        let variantQuery = {
            productId: productId,
            IsDeleted: { $ne: true }
        };

        if (variantIdReq && variantIdReq !== 'undefined' && variantIdReq !== 'null') {
            variantQuery = {
                _id: variantIdReq,
                IsDeleted: { $ne: true }
            };
        }

        const variant = await variantSchema.findOne(variantQuery)
            .populate({
                path: 'productId',
                model: 'Product',
                populate: { path: 'categoryId', model: 'Categories' }
            })
            .lean();

        // Redirect if product or variant is missing, or if product is blocked/deleted
        if (!variant || !variant.productId || variant.productId.IsDeleted || variant.productId.status !== 'active') {
            return res.redirect('/products');
        }

        // Check if category is active
        if (variant.productId.categoryId && (!variant.productId.categoryId.IsActive || variant.productId.categoryId.IsDeleted)) {
            return res.redirect('/products');
        }

        const otherVariants = await variantSchema.find({
            productId: productId,
            IsDeleted: { $ne: true }
        }).lean();

        // Fetch Related Products (same category, excluding current product)
        const relatedProductsRaw = await productSchema.find({
            categoryId: variant.productId.categoryId._id,
            _id: { $ne: productId },
            status: 'active',
            IsDeleted: { $ne: true }
        }).limit(4).lean();

        // Populate related products with their default variants
        const relatedProducts = await Promise.all(relatedProductsRaw.map(async (p) => {
            const v = await variantSchema.findOne({ productId: p._id, IsDeleted: { $ne: true }, IsDefault: true }) 
                    || await variantSchema.findOne({ productId: p._id, IsDeleted: { $ne: true } });
            if (!v) return null;
            return {
                ...p,
                displayVariant: v
            };
        }));

        res.render('user/products/productDetails', {
            user: req.session.user,
            categories,
            cartItemCount: req.session.cartItemCount || 0,
            variant,
            otherVariants,
            relatedProducts: relatedProducts.filter(Boolean)
        });

    } catch (error) {
        console.error('loadProductDetails error:', error.message);
        res.status(500).send('Server error');
    }
};

export { loadProducts, loadProductDetails };