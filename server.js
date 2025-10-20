import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createRequire } from "module";
import bcitMapRouter from "./routes/bcitMap.js";
import route from "./routes/route.js";
import { fileURLToPath } from "url";
import { errorHandler } from './middleware/errorHandler.js';
import nodeRoutes from "./routes/nodes.js";
import { requestLogger } from "./middleware/logger.js";
import { verifyFirebaseToken } from "./middleware/authMiddleware.js";
import admin from './config/firebase.js';
import authRouter from './routes/auth.js';
import session from "express-session";

console.log('Firebase Admin initialized:', !!admin); // temporary check


dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

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

app.use(
    "/vendor/mapbox-gl",
    express.static(path.join(process.cwd(), "node_modules/mapbox-gl/dist"))
)
app.use('/auth', authRouter);
app.use("/api/nodes", nodeRoutes);
app.use('/', route);

app.use(errorHandler);
app.use(requestLogger);

const morgan = require('morgan');
app.use(morgan(':method :url :status :response-time ms - :date[iso]'));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} @ ${new Date().toISOString()}`);
  next();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});