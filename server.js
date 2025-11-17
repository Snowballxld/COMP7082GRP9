import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import session from "express-session";

import route from "./routes/route.js";
import nodeRoutes from "./routes/nodes.js";
import authRouter from './routes/auth.js';
import favoritesRouter from "./routes/favorites.js";

import { requestLogger } from "./middleware/logger.js";
import { errorHandler } from './middleware/errorHandler.js';
import admin from './config/firebase.js';

console.log('Firebase Admin initialized:', !!admin); // temporary check


dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(requestLogger);

app.use(session({
  secret: process.env.SESSION_SECRET || "keyboard cat",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // true if using HTTPS
    maxAge: 1000 * 60 * 60 * 24 * 5 // 5 days
  }
}));

const mapboxDistDir = path.dirname(require.resolve("mapbox-gl/dist/mapbox-gl.js"));

app.use(
  "/vendor/mapbox-gl",
  express.static(mapboxDistDir, {
    maxAge: "7d",
    immutable: true,
  })
);

app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

app.use('/auth', authRouter);
app.use("/api/nodes", nodeRoutes);
app.use("/api/favorites", favoritesRouter);
app.use('/', route);

app.use(errorHandler);

const morgan = require('morgan');
app.use(morgan(':method :url :status :response-time ms - :date[iso]'));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} @ ${new Date().toISOString()}`);
  next();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});