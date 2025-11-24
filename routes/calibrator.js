import "dotenv/config";
import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
    // Load token from environment
    const mapboxToken = process.env.MAPBOX_TOKEN;

    if (!mapboxToken) {
        console.warn("⚠ WARNING: MAPBOX_TOKEN is missing from environment variables.");
    }

    res.render("calibrator", {
        title: "Geometry Calibrator",
        page: "calibrator",
        mapboxToken: mapboxToken
    });
});

export default router;
