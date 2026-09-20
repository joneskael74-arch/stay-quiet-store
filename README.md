# STAY QUIET❕ — MongoDB Admin Store

## 1. Create your environment
Copy `.env.example` to `.env` and fill in your MongoDB Atlas connection string.

**Never publish `.env` or put the MongoDB URI in browser JavaScript.**

Example:
```env
MONGODB_URI=mongodb+srv://joneskael74_db_user:YOUR_PASSWORD@cluster0.mrartlg.mongodb.net/?appName=Cluster0
MONGODB_DB=stayquiet
JWT_SECRET=generate-a-long-random-secret
ADMIN_EMAIL=your-admin-email
ADMIN_PASSWORD=your-admin-password
PORT=3000
```

## 2. Install and run
```bash
npm install
npm start
```

Then open:
`http://localhost:3000`

## 3. MongoDB Atlas
In Atlas, make sure the database user has access to the database and that your deployment's Network Access rules allow the server's IP address.

## Security
- MongoDB credentials remain server-side.
- Admin login uses an HttpOnly cookie and JWT.
- The public product endpoint only returns products marked `published`.
- Do not commit `.env`.
- For production, serve over HTTPS.

## Image note
The included image upload saves files to the server's `uploads/` folder. For a production deployment where the filesystem is ephemeral, replace this with object storage (Cloudinary, S3, etc.). Image URL entry is also supported.

## Next
Connect the existing STAY QUIET storefront to `GET /api/store/products`, then add Stripe Checkout and an orders collection.
