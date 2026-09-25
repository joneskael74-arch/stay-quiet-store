require("dotenv").config();
require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const Stripe = require("stripe");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.STRIPE_SECRET_KEY) {
console.error("ERROR: STRIPE_SECRET_KEY is missing from .env");
process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
function makeLicenseKey(sessionId, productId, itemNumber) {
  const secret = process.env.LICENSE_KEY_SECRET;
  if (!secret) throw new Error("LICENSE_KEY_SECRET is missing");

  const code = crypto
    .createHmac("sha256", secret)
    .update(`${sessionId}:${productId}:${itemNumber}`)
    .digest("hex")
    .slice(0, 32)
    .toUpperCase();

  return `SQ-${code}`;
}app.post("/api/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Stripe webhook signature error:", error);
    return res.sendStatus(400);
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;

    if (session.payment_status === "paid") {
      try {
        const ordersCollection = productClient
          .db(process.env.MONGODB_DB)
          .collection("orders");

        await ordersCollection.updateOne(
          { _id: session.id },
          {
            $setOnInsert: {
              amountTotal: session.amount_total,
              currency: session.currency,
              customerEmail: session.customer_details?.email ?? null,
              paymentIntentId: session.payment_intent ?? null,
              paidAt: new Date(),
              status: "paid"
            }
          },
          { upsert: true }
        );
      } catch (error) {
        console.error("Could not save order:", error);
        return res.sendStatus(500);
      }
    }
  }

  res.sendStatus(200);
});
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.get("/api/checkout-order", async (req, res) => {
  const sessionId = req.query.session_id;

  if (typeof sessionId !== "string" || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return res.status(400).json({ error: "Invalid checkout session" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(403).json({ error: "Payment not confirmed" });
    }

    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
     limit: 100,
expand: ["data.price.product"]
    });
if (lineItems.has_more) {
  throw new Error("Order has more line items than were loaded");
}

const issuedKeys = new Map();

for (const item of lineItems.data) {
  const productId = item.price?.product?.metadata?.productId;
  const quantity = item.quantity;

  if (!productId || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Order item is missing product details");
  }

  const keys = [];

  for (let i = 0; i < quantity; i++) {
    const key = makeLicenseKey(session.id, productId, i);
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");

    await licensesCollection.updateOne(
      { _id: keyHash },
      {
        $setOnInsert: {
          keyHash,
          orderId: session.id,
          productId,
          status: "active",
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    keys.push(key);
  }

  issuedKeys.set(item.id, keys);
}
    res.set("Cache-Control", "no-store");
    return res.json({
      id: session.id,
      customerEmail: session.customer_details?.email ?? null,
      paidAt: session.created,
      amountTotal: session.amount_total,
      currency: session.currency,
      items: lineItems.data.map(item => ({
        name: item.description,
       licenseKeys: issuedKeys.get(item.id) ?? [],
        productId: item.price?.product?.metadata?.productId ?? null,
        quantity: item.quantity,
        amountTotal: item.amount_total
      }))
    });
  } catch (error) {
    console.error("Checkout order lookup error:", error);
    return res.status(500).json({ error: "Could not load order" });
  }
});
// Serve your website files
app.use(express.static(path.join(__dirname, "dist")));

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/api/health", (req, res) => {
res.json({
success: true,
message: "STAY QUIET server is running",
});
});
// ADMIN SESSION CHECK
const SESSION_SECRET = crypto.createHmac(
  "sha256", process.env.ADMIN_SESSION_SECRET || process.env.LICENSE_KEY_SECRET || process.env.STRIPE_SECRET_KEY
).update("stay-quiet/admin-session/v1").digest();
const SESSION_COOKIE = "sq_admin";
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

function signedAdminSession(email) {
  const payload = Buffer.from(JSON.stringify({ email, expires: Date.now() + SESSION_LIFETIME_MS })).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function hasAdminSession(req) {
  try {
    const cookie = (req.headers.cookie || "").split("; ").find(part => part.startsWith(`${SESSION_COOKIE}=`));
    if (!cookie) return false;
    const [payload, signature] = cookie.slice(SESSION_COOKIE.length + 1).split(".");
    if (!payload || !signature) return false;
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof session.email === "string" && session.expires > Date.now() &&
      ADMIN_ACCOUNTS.some(account => account.email && account.password && account.email === session.email);
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!hasAdminSession(req)) return res.status(401).json({ error: "Please sign in as an admin again." });
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) throw new Error("Mismatched origin");
    } catch {
      return res.status(403).json({ error: "Request origin not allowed" });
    }
  }
  next();
}

app.get("/api/me", (req, res) => {
  res.json({
    success: hasAdminSession(req),
    isAdmin: hasAdminSession(req)
  });
});
// -----// ADMIN LOGIN
const ADMIN_ACCOUNTS = [
  {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  },
  {
    email: process.env.ADMIN2_EMAIL,
    password: process.env.ADMIN2_PASSWORD
  },
  {
    email: process.env.ADMIN3_EMAIL,
    password: process.env.ADMIN3_PASSWORD
  },
  {
    email: process.env.ADMIN4_EMAIL,
    password: process.env.ADMIN4_PASSWORD
  }
];

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

const admin = ADMIN_ACCOUNTS.find(
  (account) =>
    account.email && account.password &&
    account.email === email &&
    account.password === password
);

if (!admin) {



      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    res.cookie(SESSION_COOKIE, signedAdminSession(email), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
      maxAge: SESSION_LIFETIME_MS, path: "/"
    });
    return res.json({
      success: true,
      message: "Admin login successful",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Login failed",
    });
 } 
});
app.post("/api/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ success: true });
});
// LICENSE VERIFICATION
// --------------------------------------------------
  
app.post("/api/verify-license", async (req, res) => {
try {
const { licenseKey } = req.body;

if (!licenseKey) {
return res.status(400).json({
success: false,
message: "License key is required",
});
}

/*
If your license system uses an external API,
put the API URL in your .env file:

LICENSE_API_URL=https://your-license-api.com/verify

If you don't have one yet, this simply returns
a failed verification instead of crashing the server.
*/
const keyHash = crypto
  .createHash("sha256")
  .update(String(licenseKey).trim().toUpperCase())
  .digest("hex");

const storedLicense = await licensesCollection.findOne({
  _id: keyHash,
  status: "active"
});

if (!storedLicense) {
  return res.status(403).json({
    success: false,
    message: "Invalid license key"
  });
}

return res.json({
  success: true,
  products: [storedLicense.productId]
});
if (!process.env.LICENSE_API_URL) {
return res.status(400).json({
success: false,
message: "License verification is not configured",
});
}

const response = await fetch(process.env.LICENSE_API_URL, {
method: "POST",
headers: {
"Content-Type": "application/json",
},
body: JSON.stringify({
licenseKey,
}),
});

const license = await response.json();

if (!response.ok || !license.success) {
return res.status(400).json({
success: false,
message: license.message || "License verification failed",
});
}

return res.json({
success: true,
products: license.products || [],
});
} catch (error) {
console.error("License verification error:", error);

return res.status(500).json({
success: false,
message: "License verification failed",
});
}
});

// Desktop VPN activation. Product IDs come from the paid Stripe order stored
// with each key; the request cannot choose its own entitlement.
const VPN_PRODUCT_TIERS = new Map(
  [
    [process.env.SQ_VPN_LEVEL1_PRODUCT_ID, "level1"],
    [process.env.SQ_VPN_LEVEL2_PRODUCT_ID, "level2"],
    [process.env.SQ_VPN_MAX_PRODUCT_ID, "max"]
  ].filter(([id]) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id))
);

app.post("/api/vpn/verify", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const key = req.body?.key;
  if (typeof key !== "string" || !/^SQ-[a-f\d]{32}$/i.test(key.trim())) {
    return res.status(403).json({ status: "invalid" });
  }
  if (VPN_PRODUCT_TIERS.size !== 3) {
    console.error("VPN product IDs are not configured for all three tiers");
    return res.status(503).json({ status: "unavailable" });
  }

  try {
    const hash = crypto.createHash("sha256").update(key.trim().toUpperCase()).digest("hex");
    const license = await licensesCollection.findOne({ _id: hash });
    if (!license || license.status !== "active") {
      return res.status(403).json({ status: "invalid" });
    }

    const tier = VPN_PRODUCT_TIERS.get(String(license.productId));
    if (!tier) return res.status(403).json({ status: "invalid" });

    // Older store keys are valid until revoked. New licenses can optionally
    // include an expiresAt date; expired or malformed dates fail closed.
    let expiresAt = null;
    if (license.expiresAt != null) {
      const expiry = new Date(license.expiresAt);
      if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
        return res.status(403).json({ status: "invalid" });
      }
      expiresAt = expiry.toISOString();
    }

    return res.json({ status: "active", tier, expiresAt });
  } catch (error) {
    console.error("VPN license lookup failed:", error);
    return res.status(503).json({ status: "unavailable" });
  }
});

// --------------------------------------------------
// STRIPE CHECKOUT
// --------------------------------------------------

app.post("/api/checkout", async (req, res) => {
try {
const { items } = req.body;

// Make sure the cart exists
if (!Array.isArray(items) || items.length === 0) {
return res.status(400).json({
error: "Your bag is empty",
});
}

console.log("CHECKOUT ITEMS:", JSON.stringify(items));








const line_items = await Promise.all(items.map(async (item) => {
  if (
    !ObjectId.isValid(item.id) ||
    !Number.isInteger(item.quantity) ||
    item.quantity < 1
  ) {
    throw new Error("Invalid cart item");
  }

  const product = await productsCollection.findOne({
    _id: new ObjectId(item.id),
    active: { $ne: false }
  });

  if (!product) {
    throw new Error("Invalid product");
  }

  const unit_amount = Math.round(Number(product.price) * 100);

  if (!Number.isSafeInteger(unit_amount) || unit_amount <= 0) {
    throw new Error("Invalid product or price");
  }

  return {
    price_data: {
      currency: "usd",
      product_data: {
        name: product.name,
        metadata: {
          productId: String(product._id)
        }
      },
      unit_amount: unit_amount
    },
    quantity: item.quantity
  };
}));

 
const host = req.get("host");
const protocol = req.protocol;

const baseUrl = `${protocol}://${host}`;

// Create Stripe Checkout session
const session =
await stripe.checkout.sessions.create({
mode: "payment",

line_items,

success_url:
`${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,

cancel_url:
`${baseUrl}/?checkout=cancelled`,
});

// Send checkout URL back to the website
return res.json({
url: session.url,
});
} catch (error) {
console.error(
"Stripe checkout error:",
error
);

return res.status(500).json({
error:      "Unable to start checkout",
});
}
});
const { MongoClient, ObjectId } = require("mongodb");
const productClient = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
});
const productsCollection = productClient
  .db(process.env.MONGODB_DB)
  .collection("products");
const licensesCollection = productClient
  .db(process.env.MONGODB_DB)
  .collection("licenses");
app.get("/api/products", async (req, res) => {
  try {
    const products = await productsCollection
      .find(
        { active: { $ne: false } },
        { projection: { imageUrl: 0 }, maxTimeMS: 10000 }
      )
      .sort({ createdAt: -1 })
      .toArray();

    res.json(
      products.map(({ _id, ...product }) => ({
        ...product,
        id: String(_id),
        imageUrl: `/api/products/${_id}/image`,
      }))
    );
  } catch (error) {
    console.error("PRODUCT LOAD ERROR:", error);
    res.status(503).json({ error: "Products could not be loaded" });
  }
});

app.post("/api/products", requireAdmin, async (req, res) => {
  const { name, price, category = "General", tag = null, imageUrl = "" } = req.body || {};
  const amount = Number(price);
  if (typeof name !== "string" || !name.trim() || name.length > 150 ||
      !Number.isFinite(amount) || amount <= 0 || amount > 100000 ||
      typeof category !== "string" || category.length > 80 ||
      (tag !== null && (typeof tag !== "string" || tag.length > 80)) ||
      typeof imageUrl !== "string" || imageUrl.length > 8_000_000 ||
      (imageUrl && !/^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/i.test(imageUrl))) {
    return res.status(400).json({ error: "Check the product name, price and image, then try again." });
  }
  try {
    const product = {
      name: name.trim(), price: amount, category: category.trim() || "General",
      tag: tag?.trim() || null, imageUrl, active: true,
      createdAt: new Date(), updatedAt: new Date()
    };
    const result = await productsCollection.insertOne(product);
    res.status(201).json({
      ...product, id: String(result.insertedId),
      imageUrl: imageUrl ? `/api/products/${result.insertedId}/image` : ""
    });
  } catch (error) {
    console.error("PRODUCT SAVE ERROR:", error);
    res.status(503).json({ error: "Could not save the product." });
  }
});

app.delete("/api/products/:id", requireAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid product ID" });
  try {
    const result = await productsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { active: false, updatedAt: new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Product not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("PRODUCT REMOVE ERROR:", error);
    res.status(503).json({ error: "Could not remove the product." });
  }
});

app.get("/api/products/:id/image", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.sendStatus(404);

    const product = await productsCollection.findOne(
      { _id: new ObjectId(req.params.id), active: { $ne: false } },
      { projection: { imageUrl: 1 }, maxTimeMS: 10000 }
    );
    const imageUrl = product?.imageUrl;
    if (!imageUrl) return res.sendStatus(404);

    if (/^https?:\/\//i.test(imageUrl)) return res.redirect(imageUrl);

    const image = /^data:(image\/(?:png|jpe?g|gif|webp|avif));base64,([\s\S]+)$/i.exec(imageUrl);
    if (!image) return res.sendStatus(404);

    res.set("Cache-Control", "public, max-age=3600");
    res.type(image[1]).send(Buffer.from(image[2], "base64"));
  } catch (error) {
    console.error("PRODUCT IMAGE ERROR:", error);
    res.sendStatus(503);
  }
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, () => {
console.log(
`STAY QUIET server running on port ${PORT}`
);
});
