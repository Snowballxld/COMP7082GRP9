COMP7082GRP9
This project is a Campus Map Navigator web app with Node.js, Express, and Firebase authentication.

Table of Contents
Prerequisites
Environment Setup
Firebase Setup
Install Dependencies
Run the Server
Authentication & Routes
Notes

Prerequisites
Git
Download from: https://git-scm.com/download/win
Optional: Choose Visual Studio Code as editor
Choose Git from command line and 3rd-party software
Node.js + npm
Download LTS version: https://nodejs.org
Verify installation:
node -v
npm -v

Environment Setup
Copy .env.example to .env:
cp .env.example .env

Update the following in .env:
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"..."}'
FIREBASE_API_KEY=your_web_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
SESSION_SECRET=your_session_secret

Firebase Setup
Go to Firebase Console
Create a new project.
Enable Authentication → Sign-in method → Email/Password.
Generate a Service Account Key:
Settings → Project Settings → Service accounts → Generate new private key
Save JSON content
Copy JSON content into FIREBASE_SERVICE_ACCOUNT_KEY in .env

Install Dependencies
npm install

The server uses: express, firebase-admin, express-session, winston, chalk, morgan, and dotenv.

Run the Server
npm start

Visit http://localhost:5000

Authentication & Routes
Login: /auth/login
Sign Up: /auth/signup
Logout: /auth/logout

Session Management
Sessions are stored in express-session (server memory by default).
Middleware checkSession protects routes:
import { checkSession } from './middleware/authMiddleware.js';
app.get('/nodes', checkSession, (req, res) => {
  res.render('nodes', { user: req.session.user });
});

Protected Routes
/api/nodes → Requires checkSession
/map → Requires checkSession

API Responses
Login / logout endpoints return JSON:
{ "status": "success" }
{ "status": "logged out" }
{ "error": "Invalid token" }

Unauthorized access redirects to /auth/login.

Notes
Firebase Admin SDK is used on the backend to verify ID tokens.
Logs are saved in logs/ with daily rotation. Critical Firebase/auth errors are also stored in Firestore.
If you encounter issues, contact Adam Van Woerden.