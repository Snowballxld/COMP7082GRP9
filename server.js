import express from "express";
import path from "path";
import dotenv from "dotenv";
import bcitMapRouter from "./routes/bcitMap.js";

dotenv.config();
const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

// Static assets
app.use(express.static(path.join(process.cwd(), "public")));

// Serve the dist folder from node_modules
app.use(
  "/vendor/mapbox-gl",
  express.static(path.join(process.cwd(), "node_modules/mapbox-gl/dist"))
);

// Mount route at /bcit-map
app.use("/", bcitMapRouter);

app.listen(3000, () => console.log("→ http://localhost:3000/"));
