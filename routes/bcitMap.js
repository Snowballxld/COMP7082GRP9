import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  // Pass token to EJS; public JS reads it from a meta tag
  res.render("bcit-map", { MAPBOX_TOKEN: process.env.MAPBOX_TOKEN || "" });
});

export default router;
