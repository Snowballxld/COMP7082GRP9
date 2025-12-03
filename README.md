# 1. Overview

This repository contains Wayfindr, a campus navigation web application developed for COMP7082 Group 9.  
The system uses Node.js, Express, Firebase Authentication, Firestore, and Mapbox GL JS to provide secure login, map interaction, node graph retrieval, and user-saved favorites.

# 2. Prerequisites

## 2.1 Required Software

### Git
Download: https://git-scm.com/download/win  
Recommended installation options:
- Select Visual Studio Code as your editor  
- Select "Git from command line and 3rd-party software"

### Node.js + npm
Download LTS: https://nodejs.org

Verify installation:
```bash
node -v
npm -v
```

# 3. Environment Setup

## 3.1 Create Environment File
```bash
cp .env.example .env
```

## 3.2 Configure Required Variables
Add the following in `.env`:

```
FIREBASE_SERVICE_ACCOUNT_KEY='{"type": "service_account", ... }'
FIREBASE_API_KEY=your_web_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
MAPBOX_TOKEN=your_mapbox_access_token
SESSION_SECRET=your_session_secret
```

# 4. Firebase Setup

## 4.1 Enable Firebase Services
1. Open Firebase Console  
2. Create or select your project  
3. Enable:
   - Authentication → Email/Password  
   - Firestore Database  

## 4.2 Generate Admin SDK Credentials
1. Go to Project Settings → Service Accounts  
2. Click "Generate new private key"  
3. Copy the JSON output  
4. Paste it into FIREBASE_SERVICE_ACCOUNT_KEY inside `.env`

# 5. Install Dependencies

```bash
npm install
```

This project uses:
- express
- firebase-admin
- express-session
- dotenv
- winston
- morgan
- chalk
- Mapbox GL JS

# 6. Run the Server

```bash
npm start
```

Visit:  
http://localhost:5000

# 7. Project Structure

```
/project-root
│
├── /__tests__/           # Unit Tests
├── /config/              # firebase asset
├── /public/              # Frontend assets
├── /views/               # EJS templates
├── /routes/              # API and auth routes
├── /middleware/          # Auth + logging middleware
├── /controllers/         # Node logic
├── /floorPlans/          # Indoor logic
├── /models/              # class object
├── /logs/                # Winston log output
├── server.js             # Main server
└── .env                  # Environment variables
```

# 8. Authentication & Sessions

Wayfindr uses:
- Firebase Web SDK (client)
- Firebase Admin SDK (server)
- express-session

## 8.1 Login and Signup Pages
- /auth/login  
- /auth/signup  

## 8.2 Session Flow
1. Client signs in with Firebase Auth  
2. Client sends ID token to backend: /auth/sessionLogin  
3. Server verifies token and creates a secure session cookie  
4. Protected routes require session

### Example Protected Route:
```js
import { checkSession } from "./middleware/authMiddleware.js";

app.get("/map", checkSession, (req, res) => {
  res.render("map", { user: req.session.user });
});
```

# 9. API Routes

## 9.1 Nodes API

| Method | Route        | Description          |
|--------|--------------|----------------------|
| GET    | /api/nodes   | Fetch all nodes      |
| POST   | /api/nodes   | Create/update nodes  |

### Example Node:
```json
{
  "id": "node1",
  "long": -97.123,
  "lat": 49.123,
  "alt": 3,
  "connections": ["node2", "node5"]
}
```

## 9.2 Favorites API  
Stored in Firestore at: users/{uid}/favorites/{nodeId}

| Method | Route                        | Description                    |
|--------|------------------------------|--------------------------------|
| GET    | /api/favorites               | List all favorites             |
| POST   | /api/favorites               | Add/update a favorite          |
| PATCH  | /api/favorites/:nodeId/use   | Mark favorite as recently used |
| DELETE | /api/favorites/:nodeId       | Remove a favorite              |

### Example Favorite:
```json
{
  "nodeId": "abc123",
  "label": "My Entrance",
  "isKeyLocation": true,
  "nodeMeta": {},
  "addedAt": "...",
  "lastUsed": "..."
}
```

# 10. Logging

The application uses:
- Winston (log files in /logs/)
- Morgan (HTTP request logs)
- Chalk (console formatting)

Logs include:
- server start messages
- authentication events
- Firestore errors
- request timing and status codes

# 11. Notes

- All Firebase Admin operations occur server-side and are secure.  
- Favorites appear automatically on the map upon load.  
- Sensitive keys must remain in .env and never be committed.  
- Favorites are stored as user subcollections in Firestore.
