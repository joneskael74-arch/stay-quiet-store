require("dotenv").config();
require("dotenv").config();

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
// -----// ADMIN LOGIN}
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      email !== process.env.ADMIN_EMAIL ||
      password !== process.env.ADMIN_PASSWORD
    ) {
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








const line_items = items.map((item) => ({
  price_data: {
    currency: "usd",
    product_data: {
      name: item.name || "Product",
    },
    unit_amount: Math.round(Number(item.price) * 100),
  },
  quantity: item.quantity || 1,
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
`${baseUrl}/?checkout=success`,

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
error: "Unable to start checkout",
});
}
});
app.get("/api/products", async (req, res) => {
  try {
    const { MongoClient } = require("mongodb");

    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();

    const db = client.db(process.env.MONGODB_DB);
    const products = await db
      .collection("products")
      .find({ active: { $ne: false } })
      .sort({ createdAt: -1 })
      .toArray();

    await client.close();

    res.json(
      products.map(({ _id, ...product }) => ({
        ...product,
        id: String(_id),
      }))
    );
  } catch (error) {
    console.error("PRODUCT LOAD ERROR:", error);
    res.status(500).json({ error: "Products could not be loaded" });
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
