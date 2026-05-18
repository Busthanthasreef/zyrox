/* ================================================================
   SEO Middleware
   - Adds performance headers (caching, compression hints)
   - Adds security headers that help SEO
   - Serves dynamic sitemap.xml
================================================================ */

import Product from '../models/product.js';
import Categories from '../models/category.js';

const SITE_URL = process.env.SITE_URL || 'https://zyrox.busthan.shop';

/* ── Performance & SEO headers for static assets ── */
export function seoHeaders(req, res, next) {
  // Tell search engines the canonical domain
  res.setHeader('X-Robots-Tag', 'index, follow');

  // Cache static assets aggressively
  if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }

  // Cache only truly public GET pages (never POST, never auth routes)
  if (
    req.method === 'GET' &&
    !req.path.startsWith('/api') &&
    !req.path.startsWith('/adminUser') &&
    !req.path.startsWith('/signin') &&
    !req.path.startsWith('/signup') &&
    !req.path.startsWith('/otp') &&
    !req.path.startsWith('/forgot') &&
    !req.path.startsWith('/new-password') &&
    !req.path.startsWith('/logout')
  ) {
    const publicPaths = ['/', '/products', '/product/'];
    const isPublic = publicPaths.some(p => req.path === p || req.path.startsWith(p));
    if (isPublic) {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    }
  }

  next();
}

/* ── Dynamic sitemap.xml ── */
export async function serveSitemap(req, res) {
  try {
    const now = new Date().toISOString().split('T')[0];

    // Static pages
    const staticPages = [
      { url: '/',        priority: '1.0', changefreq: 'daily'   },
      { url: '/products', priority: '0.9', changefreq: 'daily'   },
      { url: '/signin',  priority: '0.5', changefreq: 'monthly' },
      { url: '/signup',  priority: '0.5', changefreq: 'monthly' },
    ];

    // Dynamic product pages
    const products = await Product.find({ status: 'active', IsDeleted: false })
      .select('_id updatedAt')
      .lean();

    const productUrls = products.map(p => ({
      url: `/product/${p._id}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: p.updatedAt ? p.updatedAt.toISOString().split('T')[0] : now
    }));

    // Category filter pages
    const categories = await Categories.find({ IsActive: true, IsDeleted: false })
      .select('categoryName')
      .lean();

    const categoryUrls = categories.map(c => ({
      url: `/products?brand=${encodeURIComponent(c.categoryName)}`,
      priority: '0.7',
      changefreq: 'weekly',
      lastmod: now
    }));

    const allUrls = [...staticPages, ...productUrls, ...categoryUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${allUrls.map(page => `  <url>
    <loc>${SITE_URL}${page.url}</loc>
    <lastmod>${page.lastmod || now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap error:', err);
    res.status(500).send('Sitemap generation failed');
  }
}
