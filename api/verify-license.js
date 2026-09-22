import crypto from "crypto";
import { getDb } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  try {
    const { key } = req.body || {};

    if (!key) {
      return res.status(400).json({
        success: false,
        message: "License key required",
      });
    }

    const cleanKey = String(key).trim().toUpperCase();

    // Store/compare a hash instead of storing raw customer keys.
    const keyHash = crypto
      .createHash("sha256")
      .update(cleanKey)
      .digest("hex");

    const db = await getDb();

    const license = await db.collection("licenses").findOne({
      keyHash,
      active: true,
    });

    if (!license) {
      return res.status(401).json({
        success: false,
        message: "Invalid or inactive license",
      });
    }

    if (license.expiresAt && new Date(license.expiresAt) <= new Date()) {
      return res.status(401).json({
        success: false,
        message: "License expired",
      });
    }

    return res.status(200).json({
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
}
