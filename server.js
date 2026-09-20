import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { MongoClient, ObjectId } from "mongodb";
import multer from "multer";
import path from "path";
import fs from "fs";

dotenv.config();

const required = ["MONGODB_URI","JWT_SECRET","ADMIN_EMAIL","ADMIN_PASSWORD"];
for (const key of required) if (!process.env[key]) {
  console.error(`Missing ${key} in .env`);
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB || "stayquiet");
const products = db.collection("products");

await products.createIndex({ createdAt: -1 });
await products.createIndex({ status: 1 });

const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 8 * 1024 * 1024 } });

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static("public"));
app.use("/uploads", express.static(uploadDir));

const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);

function auth(req,res,next) {
  try {
    const token = req.cookies.sq_admin;
    if (!token) return res.status(401).json({error:"Not authenticated"});
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({error:"Not authenticated"});
  }
}

app.post("/api/login", async (req,res) => {
  const {email,password} = req.body || {};
  if (email !== process.env.ADMIN_EMAIL || !(await bcrypt.compare(password || "", passwordHash))) {
    return res.status(401).json({error:"Invalid email or password"});
  }
  const token = jwt.sign({email, role:"admin"}, process.env.JWT_SECRET, {expiresIn:"7d"});
  res.cookie("sq_admin", token, {httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV==="production", maxAge:7*24*60*60*1000});
  res.json({ok:true});
});

app.post("/api/logout", (req,res) => {
  res.clearCookie("sq_admin");
  res.json({ok:true});
});

app.get("/api/me", auth, (req,res) => res.json({email:req.admin.email}));

app.get("/api/products", auth, async (req,res) => {
  const data = await products.find({}).sort({createdAt:-1}).toArray();
  res.json(data);
});

app.get("/api/store/products", async (req,res) => {
  const data = await products.find({status:"published"}).sort({createdAt:-1}).toArray();
  res.json(data);
});

app.post("/api/products", auth, async (req,res) => {
  const {name,price,qty,category,status,imageUrl,description} = req.body || {};
  if (!name?.trim()) return res.status(400).json({error:"Product name is required"});
  const doc = {
    name:name.trim(), price:Number(price||0), qty:Number(qty||0),
    category:(category||"").trim(), status:status==="published"?"published":"draft",
    imageUrl:(imageUrl||"").trim(), description:(description||"").trim(),
    createdAt:new Date(), updatedAt:new Date()
  };
  const result = await products.insertOne(doc);
  res.status(201).json({...doc,_id:result.insertedId});
});

app.put("/api/products/:id", auth, async (req,res) => {
  let id;
  try { id = new ObjectId(req.params.id); } catch { return res.status(400).json({error:"Invalid product id"}); }
  const {name,price,qty,category,status,imageUrl,description} = req.body || {};
  if (!name?.trim()) return res.status(400).json({error:"Product name is required"});
  const update = {$set:{
    name:name.trim(), price:Number(price||0), qty:Number(qty||0),
    category:(category||"").trim(), status:status==="published"?"published":"draft",
    imageUrl:(imageUrl||"").trim(), description:(description||"").trim(),
    updatedAt:new Date()
  }};
  const result = await products.findOneAndUpdate({_id:id},update,{returnDocument:"after"});
  if (!result) return res.status(404).json({error:"Product not found"});
  res.json(result);
});

app.delete("/api/products/:id", auth, async (req,res) => {
  let id;
  try { id = new ObjectId(req.params.id); } catch { return res.status(400).json({error:"Invalid product id"}); }
  const result = await products.deleteOne({_id:id});
  if (!result.deletedCount) return res.status(404).json({error:"Product not found"});
  res.json({ok:true});
});

app.post("/api/upload", auth, upload.single("image"), (req,res) => {
  if (!req.file) return res.status(400).json({error:"No image uploaded"});
  const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
  const target = path.join(uploadDir, req.file.filename + ext);
  fs.renameSync(req.file.path,target);
  res.json({url:`/uploads/${path.basename(target)}`});
});

app.use(express.static(path.join(process.cwd(), "public")));

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

app.listen(PORT, () => console.log(`STAY QUIET server running on port ${PORT}`));
