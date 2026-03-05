

const loadProducts = async (req, res) => {  
    try {
        const { page, sort, brand, ram, storage, maxPrice } = req.query;

        const currentPage  = parseInt(page) || 1;
        const itemsPerPage = 12;

        // ── Build filter query (adapt to your DB / ORM) ──
        const filter = { isDeleted: false };

        if (brand) {
            const brands = Array.isArray(brand) ? brand : [brand];
            filter.brand = { $in: brands };           // MongoDB example
        }

        if (ram) {
            const rams = Array.isArray(ram) ? ram : [ram];
            filter.ram = { $in: rams };
        }

        if (storage) {
            const storages = Array.isArray(storage) ? storage : [storage];
            filter.storage = { $in: storages };
        }

        if (maxPrice) {
            filter.price = { $lte: parseInt(maxPrice) };
        }

        // ── Sort ──
        const sortMap = {
            price_asc:  { price: 1 },
            price_desc: { price: -1 },
            rating:     { rating: -1 },
            newest:     { createdAt: -1 },
            name_asc:   { name: 1 },
        };
        const sortQuery = sortMap[sort] || { createdAt: -1 };

        // ── Fetch (replace with your actual DB call) ──
        // const total    = await Product.countDocuments(filter);
        // const products = await Product.find(filter)
        //     .sort(sortQuery)
        //     .skip((currentPage - 1) * itemsPerPage)
        //     .limit(itemsPerPage)
        //     .lean();

        // ── Placeholder (remove when DB is wired up) ──
        const products = [];
        const total    = 0;

        const totalPages = Math.ceil(total / itemsPerPage);

        res.render('user/products/productPage', {
            user:          req.session.user,
            cartItemCount: req.session.cartCount || '0',
            products,
            currentPage,
            totalPages,
            // Pass active filter values back so the view can restore UI state
            selectedBrands:  Array.isArray(brand)   ? brand   : brand   ? [brand]   : [],
            selectedRAM:     Array.isArray(ram)      ? ram     : ram     ? [ram]     : [],
            selectedStorage: Array.isArray(storage)  ? storage : storage ? [storage] : [],
            maxPrice:        maxPrice ? parseInt(maxPrice) : null,
            activeSort:      sort,
            // Build query string to append to pagination links
            sortQuery: sort ? `&sort=${sort}` : '',
        });

    } catch (err) {
        console.error('loadProducts error:', err);
        res.status(500).send('Server error');
    }
};

export { loadProducts };