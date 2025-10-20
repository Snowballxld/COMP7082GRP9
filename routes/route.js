import express from "express";
import { checkSession } from "../middleware/authMiddleware.js";

const router = express.Router();

// Home page
router.get('/', (req, res) => {
  res.render('index', { page: 'index', title: 'Wayfindr the Campus Map Navigator', user: req.session.user });
});

// Map page
router.get('/map', (req, res) => {
  res.render('map', { MAPBOX_TOKEN: process.env.MAPBOX_TOKEN, page: 'map', title: 'Wayfindr – Map', user: req.session.user });
});

router.get("/bcit-map", (req, res) => {
  // Pass token to EJS; public JS reads it from a meta tag
  res.render("bcit-map", { MAPBOX_TOKEN: process.env.MAPBOX_TOKEN });
});

// Node Management page
router.get('/nodes', checkSession, (req, res) => {
  res.render('nodes', { page: 'nodes', title: 'Wayfindr – Node Management', user: req.session.user });
});

router.post('/nodes', checkSession, async (req, res, next) => {
  try {
    // ... save node
  } catch (err) {
    err.statusCode = 400; // e.g., bad input
    next(err);
  }
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// About page
router.get('/about', (req, res) => {
  res.render('about', { page: 'about', title: 'Wayfindr – About', user: req.session.user });
});

// Catch-all redirect for invalid routes

router.get('*', (req, res) => {
  res.redirect('/');
});


export default router;
