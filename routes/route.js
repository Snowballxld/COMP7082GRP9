import express from "express";
import { checkSession } from "../middleware/authMiddleware.js";
import admin from "../config/firebase.js";

const router = express.Router();
const db = admin.firestore();


// Home page
router.get('/', (req, res) => {
  res.render('index', { page: 'index', title: 'Wayfindr the Campus Map Navigator', user: req.session.user });
});

// Map page
router.get('/map', checkSession, (req, res) => {
  res.render('map', { MAPBOX_TOKEN: process.env.MAPBOX_TOKEN, page: 'map', title: 'Wayfindr – Map', user: req.session.user });
});

router.get("/bcit-map", checkSession, (req, res) => {
  // Pass token to EJS; public JS reads it from a meta tag
  res.render("bcit-map", { MAPBOX_TOKEN: process.env.MAPBOX_TOKEN });
});

// Node Management page
router.get('/nodes', checkSession, (req, res) => {
  res.render('nodes', { page: 'nodes', title: 'Wayfindr – Node Management', user: req.session.user });
});

// POST /nodes → add new node to Firestore
router.post("/nodes", checkSession, async (req, res) => {
  let { alt, connections, lat, long } = req.body;

  if (!alt || !connections || !lat || !long) {
    console.log("alt: " + alt + "\nconnections: " + connections + "\nlat: " + lat + "\nlong: " + long )
    return res.status(400).json({ error: "Missing fields: alt, connections, lat, long required"});
  }

  const newNode = {
    alt,
    connections,  
    lat: Number(lat),
    long: Number(long)
  };

  try {
    await db.collection("nodes").doc(alt).set(newNode);
    res.status(201).json(newNode);
  } catch (err) {
    console.error("Error adding node:", err);
    res.status(500).json({ error: "Failed to create node" });
  }
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// About page
router.get('/about', (req, res) => {
  res.render('about', { page: 'about', title: 'Wayfindr – About', user: req.session.user });
});

// Favorites Management page
router.get('/favorites', checkSession, (req, res) => {
  res.render('favorites', {
    page: 'favorites',
    title: 'Wayfindr – Favorites Management',
    user: req.session.user
  });
});


// --- Test Logging Route ---
router.get("/test-error", (req, res, next) => {
  const testError = new Error("🔥 Intentional test error for logging system auth");
  testError.statusCode = 500;
  next(testError); // Passes to errorHandler.js
});


// Catch-all redirect for invalid routes

router.get('*', (req, res) => {
  res.redirect('/');
});


export default router;
