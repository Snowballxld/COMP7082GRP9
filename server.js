import express from "express";
import dotenv from "dotenv";
import route from "./routes/route.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

app.use('/', route);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
