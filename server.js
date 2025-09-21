import express from "express";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

// Example route
app.get("/", (req, res) => {
  res.render("index");
});

// Future endpoint: get buildings
app.get("/api/buildings", (req, res) => {
  res.json([
    { id: 1, name: "SE2 - Student Services", lat: 49.250, lng: -123.001 },
    { id: 2, name: "SW1 - Technology Building", lat: 49.249, lng: -123.002 }
  ]);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
