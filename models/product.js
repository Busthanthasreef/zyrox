
import categorySchema from "../../models/category.js"
import variantSchema from "../../models/variant.js"
import productSchema from "../../models/product.js"

const PRICE_MAX      = 219999;
const PRICE_MIN      = 17520;
const ITEMS_PER_PAGE = 12;

const loadProducts = async (req, res) => {
    try {
        const categories = await categorySchema.find();

        // ── Query params ──
        const page          = parseInt(req.query.page) || 1;
        const sortParam     = req.query.sort || '';
        const brandFilter   = req.query.brand
            ? (Array.isArray(req.query.brand)   ? req.query.brand   : [req.query.brand])   : [];
        const ramFilter     = req.query.ram
            ? (Array.isArray(req.query.ram)     ? req.query.ram     : [req.query.ram])     : [];
        const storageFilter = req.query.storage
            ? (Array.isArray(req.query.storage) ? req.query.storage : [req.query.storage]) : [];
        const maxPrice      = parseInt(req.query.maxPrice) || PRICE_MAX;

        // ── PRODUCT QUERY ──
        // Using $or to handle both isListed:true and status:'active'
        // so it works regardless of which field your schema uses
        const productQuery = {
            $or: [
                { isListed: true },
                { status: 'active' },
                { isActive: true }
            ]
        };
        if (brandFilter.length > 0) productQuery.brand = { $in: brandFilter };

        let rawProducts = await productSchema.find(productQuery).lean();
        const productIds = rawProducts.map(p => p._id);

        // ── VARIANT QUERY ──
        // FIX 1: variants use isActive (boolean), NOT status:'active'
        // FIX 2: RAM filter values from frontend are like "4GB","8GB" — strip "GB" for DB number match
        const variantQuery = {
            productId: { $in: productIds },
            isActive:  true,               // ← correct field from your variant schema
            price:     { $lte: maxPrice }
        };

        if (ramFilter.length > 0) {
            // Frontend sends "4GB","8GB" — DB stores as number 4, 8
            const ramNumbers = ramFilter.map(r => parseInt(r.replace('GB', '')));
            variantQuery.RAM = { $in: ramNumbers };
        }
        if (storageFilter.length > 0) {
            // Frontend sends "128GB","256GB" — DB stores as number 128, 256
            const storageNumbers = storageFilter.map(s => parseInt(s.replace('GB', '').replace('TB', '000')));
            variantQuery.storage = { $in: storageNumbers };
        }

        const variants = await variantSchema.find(variantQuery).lean();

        // ── Group variants by productId ──
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
                const pid        = p._id.toString();
                const pVariants  = variantsByProduct[pid];

                // Use default variant, otherwise cheapest
                const defaultVar  = pVariants.find(v => v.isDefault);
                const cheapestVar = pVariants.reduce((a, b) => a.price < b.price ? a : b);
                const displayVar  = defaultVar || cheapestVar;

                // Image: prefer product-level image, fallback to variant image
                const image =
                    (p.images?.length           > 0 ? p.images[0]          : null) ||
                    (displayVar.images?.length  > 0 ? displayVar.images[0] : null) ||
                    '/images/placeholder.png';

                return {
                    id:        pid,
                    name:      p.name      || 'Unnamed',
                    brand:     p.brand     || '',
                    image,
                    // RAM stored as number (8) → display as "8GB"
                    ram:       displayVar.RAM     ? displayVar.RAM     + 'GB' : null,
                    // storage stored as number (128) → display as "128GB"
                    storage:   displayVar.storage ? displayVar.storage + 'GB' : null,
                    price:     displayVar.price   || 0,
                    oldPrice:  displayVar.oldPrice || null,
                    sku:       displayVar.SKU     || '',
                    stock:     displayVar.stock   ?? 0,
                    rating:    p.rating    || null,
                    reviews:   p.reviews   || 0,
                    badge:     p.badge     || null,
                    variantId: displayVar._id.toString(),
                };
            });

        // ── Sort ──
        const sorters = {
            price_asc:  (a, b) => a.price - b.price,
            price_desc: (a, b) => b.price - a.price,
            name_asc:   (a, b) => a.name.localeCompare(b.name),
            name_desc:  (a, b) => b.name.localeCompare(a.name),
        };
        if (sorters[sortParam]) products.sort(sorters[sortParam]);

        // ── Pagination ──
        const totalProducts     = products.length;
        const totalPages        = Math.ceil(totalProducts / ITEMS_PER_PAGE);
        const currentPage       = Math.min(page, totalPages || 1);
        const startIndex        = (currentPage - 1) * ITEMS_PER_PAGE;
        const paginatedProducts = products.slice(startIndex, startIndex + ITEMS_PER_PAGE);

        res.render('user/products/productPage', {
            user:          req.session.user,
            categories,
            cartItemCount: req.session.cartItemCount || 0,
            products:      paginatedProducts,
            totalProducts,
            totalPages,
            currentPage,
            startItem:     totalProducts > 0 ? startIndex + 1 : 0,
            activeFilters: {
                brands:   brandFilter,
                rams:     ramFilter,     // keep as "4GB","8GB" for EJS to restore pills
                storages: storageFilter, // keep as "128GB","256GB" for EJS to restore pills
                maxPrice,
                sort:     sortParam,
            }
        });

    } catch (error) {
        console.error('loadProducts error:', error);
        res.status(500).send('Server error: ' + error.message);
    }
};

export { loadProducts };