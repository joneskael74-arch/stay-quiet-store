const crypto = require("crypto");

// Temporary license database.
// We'll connect this to MongoDB after we confirm the API works.
const licenses = {
  "SQ-TEST-1234": {
    active: true,
    products: ["stay-quiet-test-product"],
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  const { key } = req.body || {};

  if (!key) {
    return res.status(400).json({
      success: false,
      message: "License key required",
    });
  }

  const cleanKey = String(key).trim().toUpperCase();
  const license = licenses[cleanKey];

  if (!license || !license.active) {
    return res.status(401).json({
      success: false,
      message: "Invalid or inactive license",
    });
  }

  return res.status(200).json({
    success: true,
    products: license.products,
  });
};
