import express from "express";
import admin from "../config/firebase.js";
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/test', (req, res) => {
  res.json({ message: 'Token verified!', user: { test: true } });
});

router.post('/sessionLogin', async (req, res) => {
  const idToken = req.body.idToken;
  const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
  try {
    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });
    res.cookie('session', sessionCookie, { httpOnly: true, secure: true });
    req.session.user = { idToken }; // minimal info to satisfy checkSession
    res.json({ status: 'success' });
  } catch(err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/sessionLogout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.clearCookie('session');
    res.json({ status: 'logged out' });
  });
});


// POST /auth/verify
router.post("/verify", verifyFirebaseToken, (req, res) => {
  req.session.user = req.user;
  res.json({ message: "User verified", user: req.user });
});


router.get('/login', (req, res) => {
  if (req.session?.user) {
    return res.redirect("/");
  }
  res.render('login', { title: 'Login Page' });
});

router.get('/signup', (req, res) => {
  if (req.session?.user) return res.redirect("/");
  res.render('signup', { title: 'Sign Up' });
});

export default router;