COMP7082 Group 9 — Wayfindr

A campus navigation web application built with Node.js, Express, Firebase Authentication, Firestore, and Mapbox GL JS.

The system provides secure login, map interaction, Firestore-based node data, and user-saved favorites displayed directly on the map.

📑 Table of Contents

Prerequisites

Environment Setup

Firebase Setup

Install Dependencies

Run the Server

Project Structure

Authentication & Sessions

API Routes

Logging

Notes

✅ Prerequisites
Git

Download: https://git-scm.com/download/win

Recommended:

Choose Visual Studio Code as your editor

Select "Git from command line and 3rd-party software"

Node.js + npm

Download LTS: https://nodejs.org

Verify installation:

node -v
npm -v

⚙️ Environment Setup

Copy the example environment file:

cp .env.example .env


Fill in the required fields:

FIREBASE_SERVICE_ACCOUNT_KEY='{"type": "service_account", ... }'
FIREBASE_API_KEY=your_web_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
MAPBOX_TOKEN=your_mapbox_access_token
SESSION_SECRET=your_session_secret

🔥 Firebase Setup

Open Firebase Console

Create or select your project

Enable Authentication → Sign-in method → Email/Password

Enable Firestore Database

Generate Admin SDK credentials:

Project Settings → Service Accounts

Click “Generate new private key”

Copy the JSON into FIREBASE_SERVICE_ACCOUNT_KEY in .env

📦 Install Dependencies
npm install


This project uses:

express (web server)

firebase-admin (server-side auth + Firestore)

express-session (session cookies)

winston, morgan, chalk (logging & dev output)

dotenv (environment management)

Mapbox GL JS (frontend map engine)

🚀 Run the Server
npm start


Visit:
➡️ http://localhost:5000


🔐 Authentication & Sessions

Authentication uses Firebase Web SDK (client) + Firebase Admin SDK (server).

Login & Signup (EJS pages)
/auth/login  
/auth/signup

Session Flow

Client signs in with Firebase Auth

Sends ID token to backend (/auth/sessionLogin)

Backend verifies token → Creates secure session cookie

Protected routes require session

Example middleware
import { checkSession } from "./middleware/authMiddleware.js";

app.get("/map", checkSession, (req, res) => {
    res.render("map", { user: req.session.user });
});

🔗 API Routes
🧭 Nodes API

Firestore-backed building/POI graph data.

GET    /api/nodes
POST   /api/nodes


Nodes include:

{
  "id": "...",
  "long": -97.123,
  "lat": 49.123,
  "alt": 3,
  "connections": ["node2", "node5"]
}

⭐ Favorites API (per-user Firestore subcollection)
Method	Route	Description
GET	/api/favorites	List all favorites sorted by lastUsed
POST	/api/favorites	Add or update a favorite
PATCH	/api/favorites/:nodeId/use	Mark favorite as recently used
DELETE	/api/favorites/:nodeId	Remove a favorite

Each favorite contains:

{
  "nodeId": "abc123",
  "label": "My Entrance",
  "isKeyLocation": true,
  "nodeMeta": { ... },
  "addedAt": "...",
  "lastUsed": "..."
}


Favorites appear as highlighted markers on the Mapbox map.

📊 Logging

The app uses:

Winston → log files (/logs/)

Morgan → HTTP request logs

Chalk → clean colorful CLI output

Logs include:

server start messages

auth verification events

Firestore errors

request timing & status codes

📝 Notes

All Firebase Admin operations are server-side and secure.

Favorite nodes are stored as a subcollection:
users/{uid}/favorites/{nodeId}

The map automatically loads user favorites on page load.

Critical Firebase and auth errors are logged and stored safely.