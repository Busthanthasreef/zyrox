// Uses Node 18+ built-in fetch (no import needed)
import Product from '../../models/product.js';
import Variant from '../../models/variant.js';
import Categories from '../../models/category.js';
import Offer from '../../models/offer.js';
import Coupon from '../../models/coupon.js';
import Order from '../../models/order.js';
import Wallet from '../../models/wallet.js';
import userSchema from '../../models/user.js';

/* ================================================================
   Zyro AI Chat Controller — FULLY INTELLIGENT
   - Injects REAL product catalog with specs into every prompt
   - Gemini 2.0 Flash with 1.5 Flash fallback
   - Personalized user context
   - Smart intent fallback when no API key
================================================================ */

/* ─────────────────────────────────────────────────────────────────
   FETCH FULL STORE CONTEXT — products + specs + offers + user
───────────────────────────────────────────────────────────────── */
async function getStoreContext(userId = null) {
  try {
    const now = new Date();

    // ── Categories (brands) ──
    const categories = await Categories.find({ IsActive: true, IsDeleted: false })
      .select('categoryName').lean();
    const categoryNames = categories.map(c => c.categoryName).join(', ');

    // ── Full product catalog with specs ──
    // Fetch all active products with their highlights, description, rating
    const products = await Product.find({ status: 'active', IsDeleted: false })
      .populate('categoryId', 'categoryName')
      .select('productName description highlights rating reviewsCount categoryId')
      .lean();

    // For each product, get its cheapest and best variant (highest RAM)
    const productCatalog = [];
    for (const product of products) {
      const variants = await Variant.find({
        productId: product._id,
        IsActive: true,
        IsDeleted: false,
        stock: { $gt: 0 }
      })
        .select('RAM storage price color stock')
        .sort({ price: 1 })
        .lean();

      if (variants.length === 0) continue;

      // Get price range
      const minPrice = variants[0].price;
      const maxPrice = variants[variants.length - 1].price;

      // Get unique RAM options
      const ramOptions = [...new Set(variants.map(v => v.RAM))].sort((a, b) => a - b);
      const storageOptions = [...new Set(variants.map(v => v.storage))].sort((a, b) => a - b);
      const colors = [...new Set(variants.map(v => v.color))];

      // Best variant = highest RAM + highest storage
      const bestVariant = variants.reduce((best, v) =>
        (v.RAM > best.RAM || (v.RAM === best.RAM && v.storage > best.storage)) ? v : best
      , variants[0]);

      const brand = product.categoryId?.categoryName || 'Unknown';
      const highlights = product.highlights?.slice(0, 4).join(', ') || '';
      const rating = product.rating > 0 ? `${product.rating}/5 (${product.reviewsCount} reviews)` : 'Not rated yet';

      productCatalog.push({
        name: product.productName,
        brand,
        description: product.description?.substring(0, 120) || '',
        highlights,
        rating,
        priceRange: minPrice === maxPrice ? `₹${minPrice.toLocaleString('en-IN')}` : `₹${minPrice.toLocaleString('en-IN')} – ₹${maxPrice.toLocaleString('en-IN')}`,
        ramOptions: ramOptions.map(r => `${r}GB`).join('/'),
        storageOptions: storageOptions.map(s => `${s}GB`).join('/'),
        colors: colors.join(', '),
        bestRAM: bestVariant.RAM,
        bestStorage: bestVariant.storage,
        bestPrice: bestVariant.price,
        inStock: true
      });
    }

    // Format catalog as readable text for the prompt
    const catalogText = productCatalog.map(p =>
      `**${p.name}** (${p.brand})
  - Price: ${p.priceRange}
  - RAM: ${p.ramOptions} | Storage: ${p.storageOptions}
  - Colors: ${p.colors}
  - Rating: ${p.rating}
  - Highlights: ${p.highlights || p.description}`
    ).join('\n\n');

    // ── Active Offers ──
    const activeOffers = await Offer.find({
      isActive: true, isDeleted: false,
      startDate: { $lte: now }, endDate: { $gte: now }
    })
      .populate('productId', 'productName')
      .populate('categoryId', 'categoryName')
      .limit(5).lean();

    const offersText = activeOffers.length > 0
      ? activeOffers.map(o => {
          const target = o.offerType === 'product' && o.productId ? o.productId.productName
            : o.offerType === 'category' && o.categoryId ? `${o.categoryId.categoryName} brand`
            : o.offerType === 'all' ? 'All products' : 'Referral';
          const discount = o.discountType === 'percentage' ? `${o.discountValue}% off` : `₹${o.discountValue} off`;
          return `• ${o.offerName}: ${discount} on ${target}`;
        }).join('\n')
      : 'No active offers right now.';

    // ── Active Coupons ──
    const activeCoupons = await Coupon.find({
      isActive: true, isDeleted: false, validTill: { $gte: now }
    })
      .select('code description discountType discountValue minCartValue')
      .limit(5).lean();

    const couponsText = activeCoupons.length > 0
      ? activeCoupons.map(c => {
          const discount = c.discountType === 'percentage' ? `${c.discountValue}% off` : `₹${c.discountValue} off`;
          const min = c.minCartValue > 0 ? ` (min cart ₹${c.minCartValue})` : '';
          return `• **${c.code}**: ${discount}${min}`;
        }).join('\n')
      : 'No active coupons right now.';

    // ── User Context ──
    let userContext = '';
    if (userId) {
      const user = await userSchema.findById(userId).select('Name Email referralCode').lean();
      const wallet = await Wallet.findOne({ user_id: userId }).select('balance').lean();
      const orderCount = await Order.countDocuments({ userId });
      const activeOrders = await Order.countDocuments({
        userId, orderStatus: { $in: ['Pending', 'Processing', 'Shipped'] }
      });
      if (user) {
        userContext = `\n## Logged-In User
- Name: ${user.Name}
- Email: ${user.Email}
- Wallet Balance: ₹${wallet?.balance || 0}
- Total Orders: ${orderCount}
- Active Orders: ${activeOrders}
- Referral Code: ${user.referralCode || 'Not set yet'}`;
      }
    }

    return {
      categoryNames: categoryNames || 'Apple, Samsung, OnePlus, Xiaomi, Realme, Oppo, Vivo',
      productsCount: productCatalog.length,
      catalogText: catalogText || 'No products available right now.',
      productCatalog,
      offersText,
      couponsText,
      userContext
    };
  } catch (error) {
    console.error('Error fetching store context:', error);
    return {
      categoryNames: 'Apple, Samsung, OnePlus, Xiaomi, Realme, Oppo, Vivo',
      productsCount: 0,
      catalogText: 'Product catalog temporarily unavailable.',
      productCatalog: [],
      offersText: 'Check the homepage for current offers!',
      couponsText: 'Check the homepage for coupon codes!',
      userContext: ''
    };
  }
}

/* ─────────────────────────────────────────────────────────────────
   BUILD SYSTEM PROMPT — with full live catalog injected
───────────────────────────────────────────────────────────────── */
function buildSystemPrompt(context) {
  return `You are **Zyro**, the AI assistant for **Zyrox** — a premium online smartphone store in India. You are also a brilliant, knowledgeable general assistant who can answer ANY question on ANY topic.

## WHO YOU ARE
You are two things at once:
1. **A brilliant general-knowledge assistant** — answer science, history, geography, math, GK, current events, technology, health, sports, coding, culture, and literally anything else with full depth and accuracy. Never cut answers short. Never redirect away from a question.
2. **Zyrox's expert shopping assistant** — you know the complete live product catalog, offers, coupons, and platform features below.

**Personality:** Friendly, smart, conversational — like a knowledgeable friend who also works at a phone store.

---

## ANSWERING RULES

### Rule 1 — General Knowledge / Any Topic (MOST IMPORTANT)
Answer FULLY, ACCURATELY, and HELPFULLY. Treat every question with the same depth a brilliant tutor would give.
- "Who is the Prime Minister of India?" → Full answer with context
- "What is photosynthesis?" → Full scientific explanation  
- "Explain quantum computing" → Detailed explanation
- "What happened in World War 2?" → Comprehensive answer
- "Solve 2x + 5 = 15" → Full step-by-step solution
- "Write a poem about rain" → Write the full poem
- "What are the best study tips?" → Detailed helpful tips
- "What is the speed of light?" → Answer with context
- "Who invented the telephone?" → Answer with history
**NEVER refuse. NEVER truncate. NEVER redirect away from the question.**

### Rule 2 — Phone Recommendations
When someone describes their needs (student, gaming, camera, battery, budget, multitasking, etc.):
1. Analyze their requirements intelligently
2. Match against the ACTUAL products in the catalog below
3. Recommend 2–3 specific phones with real specs and prices
4. Explain WHY each phone suits their needs
5. End with [Browse All Phones](/products)

### Rule 3 — Zyrox Platform Questions
Answer fully using the live data (offers, coupons, orders, wallet) and include clickable links.

### Rule 4 — Tone
- Warm, conversational, genuinely helpful
- Use **bold** for important terms, bullet points for lists
- Address user by name if available in context below
- For GK/general questions: answer like a knowledgeable friend — no need to mention Zyrox unless relevant

---

## LIVE PRODUCT CATALOG (${context.productsCount} phones in stock at Zyrox)

${context.catalogText}

---

## LIVE OFFERS & COUPONS

**Active Offers:**
${context.offersText}

**Active Coupon Codes:**
${context.couponsText}
${context.userContext}

---

## ZYROX PLATFORM
- Cart & Wishlist, Checkout (COD / Razorpay / Wallet), Order tracking, Returns, Referral program
- Support: zyroxmobilestore@gmail.com

**Navigation Links (use markdown format when mentioning pages):**
[Home](/) | [Products](/products) | [Cart](/cart) | [Wishlist](/wishlist) | [My Orders](/myOrders) | [Wallet](/wallet) | [Profile](/profile) | [Addresses](/address) | [Sign In](/signin) | [Sign Up](/signup)

---

## ABSOLUTE RULES
- **NEVER refuse to answer any question** — always give a full, helpful response
- **NEVER make up product specs** not in the catalog above
- **NEVER recommend phones not in the Zyrox catalog** as if they're available here (you can mention them as general knowledge, but clarify they're not on Zyrox)
- Always use clickable links [text](/route) when mentioning Zyrox pages`;
}

/* ─────────────────────────────────────────────────────────────────
   MAIN HANDLER
───────────────────────────────────────────────────────────────── */
const zyroChat = async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, reply: 'Please send a valid message.' });
    }

    const trimmedMessage = message.trim().slice(0, 1000);
    const userId = req.session?.user?._id || null;

    // Fetch live context (products + offers + user)
    const context = await getStoreContext(userId);

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({ success: true, reply: getIntelligentFallback(trimmedMessage, context) });
    }

    const systemPrompt = buildSystemPrompt(context);

    // Build conversation history
    const contents = [];
    const recentHistory = history.slice(-10);
    for (const turn of recentHistory) {
      if (turn.role === 'user' && turn.content)
        contents.push({ role: 'user', parts: [{ text: turn.content }] });
      else if (turn.role === 'assistant' && turn.content)
        contents.push({ role: 'model', parts: [{ text: turn.content }] });
    }
    contents.push({ role: 'user', parts: [{ text: trimmedMessage }] });

    const geminiPayload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.9,       // Higher = more natural, conversational, thorough answers
        maxOutputTokens: 1500,  // Enough for detailed GK answers + phone recommendations
        topP: 0.95,
        topK: 64,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ]
    };

    // Try Gemini 2.0 Flash first (fastest + smartest free model)
    let reply = await callGemini('gemini-2.0-flash', geminiPayload, apiKey);

    // Fallback to 1.5 Flash if 2.0 fails
    if (!reply) {
      reply = await callGemini('gemini-1.5-flash', geminiPayload, apiKey);
    }

    if (!reply) {
      return res.json({ success: true, reply: getIntelligentFallback(trimmedMessage, context) });
    }

    return res.json({ success: true, reply: reply.trim() });

  } catch (error) {
    console.error('Zyro chat error:', error.message);
    return res.json({
      success: true,
      reply: "I'm having a little trouble right now. Please try again in a moment! 🙏"
    });
  }
};

/* ─────────────────────────────────────────────────────────────────
   GEMINI API CALLER
───────────────────────────────────────────────────────────────── */
async function callGemini(model, payload, apiKey) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    if (!res.ok) {
      console.error(`Gemini ${model} error:`, res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY') return "I'm sorry, I can't respond to that. Please ask me something about smartphones or Zyrox! 😊";
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (err) {
    console.error(`Gemini ${model} call failed:`, err.message);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────
   INTELLIGENT FALLBACK — used when no API key is set
   Uses real catalog data for smart recommendations
───────────────────────────────────────────────────────────────── */
function getIntelligentFallback(message, context) {
  const msg = message.toLowerCase();
  const catalog = context.productCatalog || [];

  // ── Phone recommendation intent ──
  const needsRecommendation =
    msg.includes('recommend') || msg.includes('suggest') || msg.includes('best phone') ||
    msg.includes('which phone') || msg.includes('good phone') || msg.includes('student') ||
    msg.includes('gaming') || msg.includes('camera') || msg.includes('battery') ||
    msg.includes('budget') || msg.includes('cheap') || msg.includes('multitask') ||
    msg.includes('performance') || msg.includes('smooth') || msg.includes('under ₹') ||
    msg.includes('under rs') || msg.includes('affordable');

  if (needsRecommendation && catalog.length > 0) {
    const scored = catalog.map(p => {
      let score = 0;
      const text = `${p.name} ${p.highlights} ${p.description}`.toLowerCase();
      if ((msg.includes('student') || msg.includes('multitask') || msg.includes('performance') || msg.includes('smooth')) && p.bestRAM >= 8) score += 3;
      if ((msg.includes('camera') || msg.includes('photo') || msg.includes('photography')) && text.includes('camera')) score += 3;
      if ((msg.includes('gaming') || msg.includes('game')) && (p.bestRAM >= 8 || text.includes('gaming'))) score += 3;
      if ((msg.includes('battery') || msg.includes('long lasting')) && text.includes('battery')) score += 2;
      if ((msg.includes('budget') || msg.includes('cheap') || msg.includes('affordable')) && p.bestPrice < 20000) score += 2;
      if (msg.includes('under ₹15000') && p.bestPrice <= 15000) score += 4;
      if (msg.includes('under ₹20000') && p.bestPrice <= 20000) score += 4;
      if (msg.includes('under ₹30000') && p.bestPrice <= 30000) score += 4;
      if (p.bestRAM >= 8) score += 1;
      if (p.rating > 4) score += 1;
      return { ...p, score };
    }).filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

    if (scored.length > 0) {
      let response = `Based on your needs, here are my top picks from Zyrox: 📱\n\n`;
      scored.forEach((p, i) => {
        response += `**${i + 1}. ${p.name}** (${p.brand})\n`;
        response += `   💰 ${p.priceRange} | 🧠 ${p.ramOptions} RAM | 💾 ${p.storageOptions} Storage\n`;
        if (p.highlights) response += `   ✨ ${p.highlights}\n`;
        response += `   ⭐ ${p.rating}\n\n`;
      });
      response += `👉 [Browse All Phones](/products) to see full specs and buy!`;
      return response;
    }
    return `We have **${context.productsCount} smartphones** from ${context.categoryNames}. Visit [Products](/products) to filter by your budget and needs! 📱`;
  }

  // ── Standard Zyrox intent matching ──
  const intents = {
    orders:   ['order', 'track', 'status', 'delivery', 'shipped', 'delivered', 'parcel'],
    cancel:   ['cancel', 'cancellation'],
    return:   ['return', 'refund', 'money back', 'exchange'],
    wallet:   ['wallet', 'balance', 'add money', 'recharge'],
    cart:     ['cart', 'basket'],
    wishlist: ['wishlist', 'saved', 'favorites'],
    offers:   ['offer', 'discount', 'deal', 'coupon', 'promo'],
    referral: ['referral', 'refer', 'invite', 'friend code'],
    payment:  ['payment', 'pay', 'cod', 'razorpay', 'upi'],
    products: ['phone', 'smartphone', 'mobile', 'browse', 'buy', 'price', 'brand'],
    profile:  ['profile', 'account', 'password', 'edit'],
    help:     ['help', 'support', 'contact', 'issue']
  };

  let bestIntent = null, bestScore = 0;
  for (const [intent, keywords] of Object.entries(intents)) {
    const score = keywords.filter(kw => msg.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestIntent = intent; }
  }

  switch (bestIntent) {
    case 'orders':   return `Track all your orders at [My Orders](/myOrders). 📦 Status: **Pending → Processing → Shipped → Delivered**.`;
    case 'cancel':   return `Go to [My Orders](/myOrders) → select order → **Cancel**. Only possible before shipping. 🚫`;
    case 'return':   return `Visit [My Orders](/myOrders) → select delivered order → **Return Item**. Refund goes to your [Wallet](/wallet) in 2–3 days. 🔄`;
    case 'wallet': {
      const m = context.userContext.match(/Wallet Balance: ₹(\d+)/);
      const bal = m ? `Your balance: **₹${m[1]}**. ` : '';
      return `${bal}Manage your [Wallet](/wallet) — add funds via Razorpay, use at checkout, receive refunds. 💰`;
    }
    case 'cart':     return `View your [Cart](/cart) to update quantities and checkout. 🛒`;
    case 'wishlist': return `Your saved phones are in the [Wishlist](/wishlist). ❤️`;
    case 'offers':
      if (!context.offersText.includes('No active')) {
        return `🏷️ **Active Offers:**\n${context.offersText}\n\n🎟️ **Coupons:**\n${context.couponsText}\n\nApply at checkout!`;
      }
      return `Check the [Home](/) page for current deals and coupon codes! 🏷️`;
    case 'referral': {
      const r = context.userContext.match(/Referral Code: (.+)/);
      const code = r && r[1] !== 'Not set yet' ? `Your code: **${r[1]}**. ` : '';
      return `${code}Share your referral code → friends sign up → you earn wallet credits! Find it on [Profile](/profile). 🎁`;
    }
    case 'payment':  return `Payment options: **COD**, **Razorpay** (UPI/cards), **[Wallet](/wallet)** balance. All secured by Razorpay. 🔒`;
    case 'products': return `Browse **${context.productsCount} smartphones** at [Products](/products)! Brands: **${context.categoryNames}**. 📱`;
    case 'profile':  return `Update your account at [Profile](/profile) — name, email, photo, password, referral code. 👤`;
    case 'help':     return `Contact us at **zyroxmobilestore@gmail.com** or self-serve via [My Orders](/myOrders) and [Profile](/profile). 📧`;
    default: {
      if (/^(hi|hello|hey|hii|helo)\b/.test(msg)) {
        const n = context.userContext.match(/Name: (.+)/);
        const g = n ? `Hey **${n[1]}**! 👋` : 'Hey there! 👋';
        return `${g} I'm **Zyro**, Zyrox's AI assistant. I can answer anything — phone recommendations, general knowledge, orders, offers, and more! What would you like to know? 😊`;
      }
      // For GK / general questions in fallback mode — honest message
      return `Great question! I need my AI brain (Gemini API) to answer that properly. For now, I can help you with:\n\n• 📱 [Phone recommendations](/products)\n• 🏷️ [Current offers](/)\n• 📦 [Track orders](/myOrders)\n• 💰 [Wallet](/wallet)\n\nAsk me anything about Zyrox or smartphones! �`;
    }
  }
}

export { zyroChat };
