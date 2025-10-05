import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createRequire } from "module";
import bcitMapRouter from "./routes/bcitMap.js";
import route from "./routes/route.js";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

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

app.use('/', route);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});