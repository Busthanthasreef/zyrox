import productSchema from "../../models/product.js"
import categorySchema from "../../models/category.js"
import variantSchema from "../../models/variant.js"

const PRICE_MIN = 0;
const PRICE_MAX = 219999;
const ITEMS_PER_PAGE = 12;

const loadProducts = async (req, res) => {
    try {
        const categories = await categorySchema.find();

        // ── Query params ──
        const page = parseInt(req.query.page) || 1;
        const sortParam = req.query.sort || '';
        const brandFilter = req.query.brand ? (Array.isArray(req.query.brand) ? req.query.brand : [req.query.brand]) : [];
        const ramFilter = req.query.ram ? (Array.isArray(req.query.ram) ? req.query.ram : [req.query.ram]) : [];
        const storageFilter = req.query.storage ? (Array.isArray(req.query.storage) ? req.query.storage : [req.query.storage]) : [];
        const maxPrice = parseInt(req.query.maxPrice) || PRICE_MAX;

        // ── Build product query ──
        const productQuery = { status: 'active' };
        if (brandFilter.length > 0) {
            productQuery.brand = { $in: brandFilter };
        }

        // ── Fetch products ──
        let rawProducts = await productSchema.find(productQuery).lean();

        // ── Fetch all active variants for these products ──
        const productIds = rawProducts.map(p => p._id);

        const variantQuery = {
            productId: { $in: productIds },
            status: 'active',
            price: { $lte: maxPrice }
        };
        if (ramFilter.length > 0) {
            variantQuery.RAM = { $in: ramFilter.map(r => parseInt(r)) };
        }
        if (storageFilter.length > 0) {
            variantQuery.storage = { $in: storageFilter.map(s => parseInt(s)) };
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
        // Each product gets the cheapest/default variant's data merged in

        let products = rawProducts .filter(p => variantsByProduct[p._id.toString()]?.length > 0).map(p => {
                const pid = p._id.toString();
                const pVariants = variantsByProduct[pid];

                // Prefer default variant, else cheapest
                const defaultVariant = pVariants.find(v => v.isDefault) || pVariants[0];
                const cheapestVariant = pVariants.reduce((a, b) => a.price < b.price ? a : b);
                const displayVariant = defaultVariant || cheapestVariant;

                // Pick display image
                const image = (p.images && p.images.length > 0)
                    ? p.images[0]
                    : (displayVariant.images && displayVariant.images.length > 0)
                        ? displayVariant.images[0]
                        : '/images/placeholder.png';

                return {
                    id: p._id.toString(),
                    name: p.name,
                    brand: p.brand || '',
                    image,
                    ram: displayVariant.RAM ? displayVariant.RAM + 'GB' : null,
                    storage: displayVariant.storage ? displayVariant.storage + 'GB' : null,
                    price: displayVariant.price || 0,
                    oldPrice: displayVariant.oldPrice || null,
                    sku: displayVariant.SKU || '',
                    stock: displayVariant.stock || 0,
                    rating: p.rating || null,
                    reviews: p.reviews || 0,
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
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const paginatedProducts = products.slice(startIndex, startIndex + ITEMS_PER_PAGE);

        res.render('user/products/productPage', {
            user: req.session.user,
            categories,
            cartItemCount: req.session.cartItemCount || 0,
            products: paginatedProducts,
            totalProducts,
            totalPages,
            currentPage,
            startItem: totalProducts > 0 ? startIndex + 1 : 0,
            activeFilters: {
                brands: brandFilter,
                rams: ramFilter,
                storages: storageFilter,
                maxPrice,
                sort: sortParam,
            }
        });

    } catch (error) {
        console.error('loadProducts error:', error.message);
        res.status(500).send('Server error');
    }
};

export { loadProducts };