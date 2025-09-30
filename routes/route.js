import express from "express";
const router = express.Router();

// Home page
router.get('/', (req, res) => {
  res.render('index', { page: 'index', title: 'Campus Map Navigator – Home' });
});

// Map page
router.get('/map', (req, res) => {
  res.render('map', { page: 'map', title: 'Campus Map Navigator – Map' });
});

// Node Management page
router.get('/nodes', (req, res) => {
  res.render('nodes', { page: 'nodes', title: 'Campus Map Navigator – Node Management' });
});

// About page
router.get('/about', (req, res) => {
  res.render('about', { page: 'about', title: 'Campus Map Navigator – About' });
});

// Catch-all redirect for invalid routes
router.get('*', (req, res) => {
  res.redirect('/');
});

export default router;
