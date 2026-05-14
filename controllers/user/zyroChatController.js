// Uses Node 18+ built-in fetch (no import needed)
import Product from '../../models/product.js';
import Categories from '../../models/category.js';
import Offer from '../../models/offer.js';
import Coupon from '../../models/coupon.js';
import Order from '../../models/order.js';
import Wallet from '../../models/wallet.js';
import userSchema from '../../models/user.js';

/* ================================================================
   Zyro AI Chat Controller — INTELLIGENT VERSION (Gemini 2.0 Flash)
   - Strictly scoped to Zyrox mobile store only
   - Polite "sorry" for off-topic or non-mobile queries
   - Live DB context injection
================================================================ */

/* ── Fetch live store context ── */
async function getStoreContext(userId = null) {
  try {
    const now = new Date();

    // Fetch categories (brands)
    const categories = await Categories.find({ IsActive: true, IsDeleted: false })
      .select('categoryName')
      .lean();
    const categoryNames = categories.map(c => c.categoryName).join(', ');

    // Fetch active products count
    const productsCount = await Product.countDocuments({ status: 'active', IsDeleted: false });

    // Fetch top products for context
    const topProducts = await Product.find({ status: 'active', IsDeleted: false })
      .select('productName brand')
      .limit(8)
      .lean();
    const productNames = topProducts.map(p => p.productName).join(', ');

    // Fetch active offers
    const activeOffers = await Offer.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: now },
      endDate: { $gte: now }
    })
      .populate('productId', 'productName')
      .populate('categoryId', 'categoryName')
      .limit(5)
      .lean();

    const offersText = activeOffers.map(o => {
      const target =
        o.offerType === 'product' && o.productId
          ? o.productId.productName
          : o.offerType === 'category' && o.categoryId
          ? `${o.categoryId.categoryName} category`
          : o.offerType === 'all'
          ? 'All products'
          : 'Referral';
      const discount =
        o.discountType === 'percentage'
          ? `${o.discountValue}% off`
          : `₹${o.discountValue} off`;
      return `• ${o.offerName}: ${discount} on ${target}`;
    }).join('\n');

    // Fetch active coupons
    const activeCoupons = await Coupon.find({
      isActive: true,
      isDeleted: false,
      validTill: { $gte: now }
    })
      .select('code description discountType discountValue minCartValue')
      .limit(5)
      .lean();

    const couponsText = activeCoupons.map(c => {
      const discount =
        c.discountType === 'percentage'
          ? `${c.discountValue}% off`
          : `₹${c.discountValue} off`;
      const minCart = c.minCartValue > 0 ? ` (min cart ₹${c.minCartValue})` : '';
      return `• **${c.code}**: ${discount}${minCart}${c.description ? ' — ' + c.description : ''}`;
    }).join('\n');

    // User-specific context
    let userContext = '';
    if (userId) {
      const user = await userSchema.findById(userId).select('Name Email referralCode').lean();
      const wallet = await Wallet.findOne({ user_id: userId }).select('balance').lean();
      const orderCount = await Order.countDocuments({ userId });
      const pendingOrders = await Order.countDocuments({
        userId,
        orderStatus: { $in: ['Pending', 'Processing', 'Shipped'] }
      });

      if (user) {
        userContext = `\n## Current User Info
- User Name: ${user.Name}
- Email: ${user.Email}
- Wallet Balance: ₹${wallet?.balance || 0}
- Total Orders: ${orderCount}
- Pending/Active Orders: ${pendingOrders}
- Referral Code: ${user.referralCode || 'Not set'}`;
      }
    }

    return {
      categoryNames: categoryNames || 'Apple, Samsung, OnePlus, Xiaomi, Realme, Oppo, Vivo',
      productsCount,
      productNames: productNames || 'various smartphones',
      offersText: offersText || 'No active offers right now.',
      couponsText: couponsText || 'No active coupons right now.',
      userContext
    };
  } catch (error) {
    console.error('Error fetching store context:', error);
    return {
      categoryNames: 'Apple, Samsung, OnePlus, Xiaomi, Realme, Oppo, Vivo',
      productsCount: 'many',
      productNames: 'various smartphones',
      offersText: 'Check the homepage for current offers!',
      couponsText: 'Check the homepage for coupon codes!',
      userContext: ''
    };
  }
}

/* ── Build dynamic system prompt with live data ── */
function buildSystemPrompt(context) {
  return `You are **Zyro**, the official AI assistant for **Zyrox** — a premium online smartphone store based in India.

## ⚠️ CRITICAL SCOPE RULES (Follow these STRICTLY)

### What you CAN help with:
- Anything about Zyrox: products, orders, wallet, offers, coupons, returns, addresses, profile, payments
- Smartphones and mobile phones available on Zyrox
- Mobile phone brands: ${context.categoryNames}
- General questions about smartphones (specs, comparisons, buying advice — ONLY for phones)
- Zyrox platform navigation, features, and policies

### What you MUST REFUSE (politely):
- Questions about laptops, computers, tablets, TVs, refrigerators, washing machines, cameras, or ANY other electronics/products that are NOT mobile phones
- General knowledge questions (history, science, math, cooking, sports, news, etc.)
- Programming help, coding questions
- Medical, legal, or financial advice
- Anything unrelated to smartphones or the Zyrox platform

### When someone asks about non-mobile products or off-topic things:
ALWAYS respond with a polite sorry message in this format:
"Sorry, I'm Zyro — Zyrox's dedicated mobile phone assistant! 😊 I'm only equipped to help with smartphones and everything on the Zyrox platform. We don't carry [product type] — Zyrox specializes exclusively in mobile phones. Is there anything about our smartphones or your Zyrox account I can help you with?"

### When someone asks a general knowledge question:
"I'm sorry, that's outside my area of expertise! 😊 I'm Zyro, and I'm specifically designed to assist with Zyrox's smartphone store — I'm not able to answer general questions. Let me help you with something phone-related instead! Check out our [Products](/products) page."

---

## About Zyrox
- Zyrox is a **premium Indian e-commerce store specializing exclusively in smartphones and mobile phones**
- We currently have **${context.productsCount} active products**
- Available brands: **${context.categoryNames}**
- Some products available: ${context.productNames}
- Each smartphone has multiple variants: different colors, RAM, and storage options
- All prices are in Indian Rupees (₹)

## Live Store Data

**Active Offers Right Now:**
${context.offersText}

**Active Coupons Right Now:**
${context.couponsText}
${context.userContext}

## Zyrox Platform Features
1. **Products & Variants**: Smartphones with multiple color/RAM/storage variants
2. **User Accounts**: Email/OTP signup or Google OAuth login
3. **Cart & Wishlist**: Save phones to wishlist or add to cart
4. **Checkout**: COD, Razorpay (UPI/cards), or Wallet balance
5. **Orders**: Full tracking — Pending → Processing → Shipped → Delivered. Cancel or return orders/items
6. **Wallet**: Digital wallet — add funds via Razorpay, use at checkout, receive refunds
7. **Referral Program**: Share your unique code → friends sign up → you earn wallet credits
8. **Address Management**: Multiple delivery addresses, set default
9. **Profile**: Edit name, email (OTP verified), photo, phone, password

## Navigation Links (ALWAYS use these as clickable links)
Format: [Page Name](/route)

- [Home](/) — Browse homepage, see offers
- [Products](/products) — Browse all smartphones, filter by brand/price
- [Cart](/cart) — Your shopping cart
- [Wishlist](/wishlist) — Saved phones
- [My Orders](/myOrders) — Track & manage orders
- [Wallet](/wallet) — Your digital wallet
- [Profile](/profile) — Edit your account
- [Addresses](/address) — Manage delivery addresses
- [Sign In](/signin) — Login page
- [Sign Up](/signup) — Register page

## Order Status Flow
Pending → Processing → Shipped → Delivered → (Return Requested → Returned)

## Payment Methods
- **COD** — Cash on Delivery
- **Online** — Razorpay (UPI, cards, net banking)
- **Wallet** — Zyrox wallet balance

## Response Guidelines
- Be warm, friendly, and professional as Zyro
- Always provide **clickable links** [Page Name](/route) when mentioning pages
- Use the LIVE offers and coupons data above when asked about deals
- If user context is provided, address them by name and personalize responses
- Keep responses concise and actionable
- Use emojis sparingly for warmth
- **NEVER answer off-topic questions** — always redirect politely with a sorry message
- Support email: zyroxmobilestore@gmail.com

You are ONLY Zyro, the Zyrox mobile phone store assistant. Stay strictly within this scope at all times.`;
}

/* ── Main chat handler ── */
const zyroChat = async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, reply: 'Please send a valid message.' });
    }

    const trimmedMessage = message.trim().slice(0, 1000);

    // Get user ID from session if available
    const userId = req.session?.user?._id || null;

    // Fetch live store context
    const context = await getStoreContext(userId);

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // Intelligent fallback when no API key is configured
      return res.json({
        success: true,
        reply: getIntelligentFallback(trimmedMessage, context)
      });
    }

    // Build dynamic system prompt with live data
    const systemPrompt = buildSystemPrompt(context);

    // Build conversation for Gemini 2.0 Flash
    const contents = [];

    // Add conversation history (last 10 turns for better context)
    const recentHistory = history.slice(-10);
    for (const turn of recentHistory) {
      if (turn.role === 'user' && turn.content) {
        contents.push({ role: 'user', parts: [{ text: turn.content }] });
      } else if (turn.role === 'assistant' && turn.content) {
        contents.push({ role: 'model', parts: [{ text: turn.content }] });
      }
    }

    // Add current message
    contents.push({ role: 'user', parts: [{ text: trimmedMessage }] });

    // Use gemini-2.0-flash — fastest, smartest free model
    const geminiPayload = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents,
      generationConfig: {
        temperature: 0.7,       // Slightly lower = more focused, less hallucination
        maxOutputTokens: 700,   // Enough for detailed helpful responses
        topP: 0.90,
        topK: 40,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ]
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      // Try gemini-1.5-flash as fallback model
      return await tryFallbackModel(geminiPayload, apiKey, trimmedMessage, context, res);
    }

    const geminiData = await geminiRes.json();
    const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      // Check if it was blocked by safety filters
      const blockReason = geminiData?.candidates?.[0]?.finishReason;
      if (blockReason === 'SAFETY') {
        return res.json({
          success: true,
          reply: "I'm sorry, I can't respond to that. Please ask me something about Zyrox or smartphones! 😊"
        });
      }
      return res.json({
        success: true,
        reply: "I'm not sure how to answer that. Could you rephrase your question? I'm here to help with smartphones and Zyrox! 😊"
      });
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

/* ── Fallback to gemini-1.5-flash if 2.0 fails ── */
async function tryFallbackModel(payload, apiKey, message, context, res) {
  try {
    const fallbackRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!fallbackRes.ok) {
      return res.json({ success: true, reply: getIntelligentFallback(message, context) });
    }

    const data = await fallbackRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return res.json({ success: true, reply: reply?.trim() || getIntelligentFallback(message, context) });
  } catch {
    return res.json({ success: true, reply: getIntelligentFallback(message, context) });
  }
}

/* ── Intelligent fallback with strict scope enforcement ── */
function getIntelligentFallback(message, context) {
  const msg = message.toLowerCase();

  // ── OUT-OF-SCOPE: Non-mobile product detection ──
  const nonMobileProducts = [
    'laptop', 'computer', 'pc', 'desktop', 'macbook', 'notebook',
    'tablet', 'ipad', 'kindle',
    'tv', 'television', 'monitor', 'screen',
    'refrigerator', 'fridge', 'washing machine', 'microwave', 'oven', 'ac', 'air conditioner',
    'camera', 'dslr', 'gopro', 'smartwatch', 'watch', 'earphone', 'headphone', 'speaker',
    'keyboard', 'mouse', 'printer', 'router', 'gaming', 'console', 'playstation', 'xbox',
    'clothes', 'clothing', 'shirt', 'shoes', 'furniture', 'car', 'bike', 'vehicle',
    'book', 'food', 'medicine', 'grocery'
  ];

  for (const product of nonMobileProducts) {
    if (msg.includes(product)) {
      return `Sorry, I'm Zyro — Zyrox's dedicated mobile phone assistant! 😊 I'm only equipped to help with **smartphones** and everything on the **Zyrox platform**. We don't carry ${product}s — Zyrox specializes **exclusively in mobile phones**.\n\nWould you like to browse our smartphones instead? Check out [Products](/products)! 📱`;
    }
  }

  // ── OUT-OF-SCOPE: General knowledge detection ──
  const offTopicKeywords = [
    'who is', 'what is the capital', 'history of', 'tell me about', 'explain',
    'how to cook', 'recipe', 'weather', 'news', 'sports', 'cricket', 'football',
    'write a', 'generate', 'essay', 'poem', 'story', 'code', 'program',
    'medical', 'doctor', 'disease', 'symptom', 'legal', 'law', 'invest', 'stock'
  ];

  for (const keyword of offTopicKeywords) {
    if (msg.includes(keyword)) {
      return `I'm sorry, that's outside my area of expertise! 😊 I'm **Zyro**, and I'm specifically designed to assist with **Zyrox's smartphone store** — I'm not able to answer general questions.\n\nLet me help you with something phone-related instead! Check out our [Products](/products) page or ask me about [Offers](/) and [Wallet](/wallet). 📱`;
    }
  }

  // ── INTENT DETECTION for Zyrox topics ──
  const intents = {
    orders: ['order', 'track', 'status', 'delivery', 'shipped', 'delivered', 'where is my', 'parcel'],
    cancel: ['cancel', 'cancellation', 'stop order'],
    return: ['return', 'refund', 'money back', 'send back', 'exchange'],
    wallet: ['wallet', 'balance', 'add money', 'recharge', 'cashback'],
    cart: ['cart', 'basket', 'shopping cart', 'added'],
    wishlist: ['wishlist', 'wish list', 'saved', 'favorites', 'favourite'],
    offers: ['offer', 'discount', 'deal', 'sale', 'promo', 'coupon', 'code'],
    referral: ['referral', 'refer', 'invite', 'friend code', 'earn'],
    payment: ['payment', 'pay', 'cod', 'online payment', 'razorpay', 'upi'],
    checkout: ['checkout', 'place order', 'buy now', 'purchase'],
    products: ['phone', 'product', 'smartphone', 'mobile', 'browse', 'shop', 'buy', 'price', 'model', 'brand'],
    address: ['address', 'delivery address', 'shipping address', 'location', 'pincode'],
    profile: ['profile', 'account', 'edit profile', 'my account', 'settings', 'password'],
    signin: ['sign in', 'signin', 'login', 'log in'],
    signup: ['sign up', 'signup', 'register', 'create account'],
    help: ['help', 'support', 'contact', 'customer service', 'issue', 'problem']
  };

  let bestIntent = null;
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(intents)) {
    const score = keywords.filter(kw => msg.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  // ── Generate response based on intent ──
  switch (bestIntent) {
    case 'orders':
      return `You can track all your orders at [My Orders](/myOrders). 📦 You'll see full status updates — **Pending → Processing → Shipped → Delivered**. Click on any order for detailed tracking info!`;

    case 'cancel':
      return `To cancel an order, go to [My Orders](/myOrders) → select the order → click **Cancel Order**. ⚠️ Note: cancellation is only possible **before** the order is shipped. After shipping, you can request a return once delivered.`;

    case 'return':
      return `For returns, visit [My Orders](/myOrders) and select your delivered order → click **Return Item**. 🔄 Refunds are credited to your [Wallet](/wallet) within **2–3 business days**. ${context.userContext.includes('Wallet Balance') ? `Your current wallet balance will be updated there.` : ''}`;

    case 'wallet': {
      const walletMatch = context.userContext.match(/Wallet Balance: ₹(\d+)/);
      const balance = walletMatch ? `Your current wallet balance is **₹${walletMatch[1]}**. ` : '';
      return `${balance}Your [Wallet](/wallet) lets you store money and pay instantly at checkout! 💰 Add funds via **Razorpay** (UPI, cards, net banking). You also earn wallet credits via refunds and referrals!`;
    }

    case 'cart':
      return `View and manage your saved items in the [Cart](/cart). 🛒 You can update quantities, remove items, and proceed to checkout from there. We also apply any active coupons at checkout!`;

    case 'wishlist':
      return `Your saved smartphones are in the [Wishlist](/wishlist). ❤️ You can move items to cart or remove them anytime. It's a great way to keep track of phones you're interested in!`;

    case 'offers':
      if (context.offersText && !context.offersText.includes('No active offers')) {
        let response = `🏷️ **Current Active Offers:**\n${context.offersText}\n\n`;
        if (context.couponsText && !context.couponsText.includes('No active coupons')) {
          response += `🎟️ **Active Coupon Codes:**\n${context.couponsText}\n\n`;
        }
        response += `Apply coupon codes at checkout! Visit [Products](/products) to start shopping.`;
        return response;
      }
      return `Check the **Active Offers** banner on the [Home](/) page for current deals! 🏷️ You can also apply coupon codes at the checkout page. New deals drop regularly — stay tuned!`;

    case 'referral': {
      const refMatch = context.userContext.match(/Referral Code: (.+)/);
      const refCode = refMatch && refMatch[1] !== 'Not set' ? `Your referral code is **${refMatch[1]}**. ` : '';
      return `${refCode}🎁 Share your referral code with friends! When they **sign up** and make a purchase on Zyrox, **you earn wallet credits**. Find your referral code on your [Profile](/profile) page under account details!`;
    }

    case 'payment':
      return `Zyrox supports **3 payment methods**: 💳\n\n• **COD (Cash on Delivery)** — Pay when your phone arrives\n• **Online (Razorpay)** — UPI, debit/credit cards, net banking\n• **Wallet** — Use your [Wallet](/wallet) balance instantly\n\nAll online payments are secured by **Razorpay** 🔒`;

    case 'checkout':
      return `Ready to order? 🛍️ Head to your [Cart](/cart) and click **Proceed to Checkout**. You can then:\n• Choose a delivery address\n• Select a payment method (COD / Online / Wallet)\n• Apply any coupon codes\n• Place your order!`;

    case 'products':
      return `Browse our **${context.productsCount} active smartphones** at [Products](/products)! 📱 Available brands: **${context.categoryNames}**. You can filter by brand, price range, or search for specific models. Each phone has multiple variants with different colors, RAM, and storage options!`;

    case 'address':
      return `Manage your delivery addresses at [Addresses](/address). 📍 You can:\n• Add multiple addresses\n• Set a default address for faster checkout\n• Edit or delete saved addresses`;

    case 'profile': {
      const userName = context.userContext.match(/User Name: (.+)/);
      const greeting = userName ? `Hi **${userName[1]}**! ` : '';
      return `${greeting}Visit your [Profile](/profile) to update your: 👤\n• Name & phone number\n• Email (with OTP verification)\n• Profile picture\n• Password\n• View your referral code & wallet balance`;
    }

    case 'signin':
      return `Sign in at [Sign In](/signin). 🔐 We support:\n• **Email & Password** login\n• **Google OAuth** (one-click sign in)\n\nForgot your password? Use the forgot password option on the sign-in page!`;

    case 'signup':
      return `Create your free Zyrox account at [Sign Up](/signup)! 🎉 You'll get:\n• A unique referral code\n• Access to wallet, wishlist, and order tracking\n• Exclusive member-only offers`;

    case 'help':
      return `Need help? 📧 Reach our support team at **zyroxmobilestore@gmail.com**. \n\nYou can also self-serve through:\n• [My Orders](/myOrders) — Track, cancel, or return orders\n• [Wallet](/wallet) — Manage balance & transactions\n• [Profile](/profile) — Update account details\n• [Addresses](/address) — Manage delivery locations`;

    default: {
      if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey') || msg.includes('hii')) {
        const userName = context.userContext.match(/User Name: (.+)/);
        const greeting = userName ? `Hey **${userName[1]}**! 👋` : 'Hey there! 👋';
        return `${greeting} I'm **Zyro**, your personal AI assistant at **Zyrox** — India's premium smartphone store! 📱\n\nI can help you with:\n• Finding the perfect phone\n• Current offers & coupon codes\n• Tracking your orders\n• Wallet & payments\n• Returns & cancellations\n\nWhat would you like to explore today?`;
      }
      return `I'm here to help with everything at **Zyrox**! 😊 Try asking me about:\n\n• 📱 [Browse Smartphones](/products)\n• 🏷️ [Current Offers](/)\n• 📦 [My Orders](/myOrders)\n• 💰 [Wallet](/wallet)\n• 🎁 Referral program\n\nWhat can I help you with?`;
    }
  }
}

export { zyroChat };
