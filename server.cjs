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
app.use(express.json());
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
app.get("/api/me", (req, res) => {
  res.json({
    success: false,
    isAdmin: false
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
    account.email === email &&
    account.password === password
);

if (!admin) {



      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

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
