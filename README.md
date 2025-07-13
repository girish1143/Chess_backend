# Chess App Backend

This is the backend for the Chess App, built with Node.js, Express, Mongoose, JWT, and WebSocket. It provides authentication, user management, and real-time chess gameplay.

## Features
- User authentication (signup, login, JWT-based session)
- Password hashing with bcrypt
- MongoDB with Mongoose for user data
- Real-time chess gameplay via WebSocket
- Chess move validation and game state management

## Getting Started

### Prerequisites
- Node.js (v16+ recommended)
- npm or yarn
- MongoDB instance (local or cloud)

### Setup
1. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```
2. Configure environment variables:
   - Create a `.env` file in the `backend/` directory with:
     ```env
     MONGODB_URI=mongodb://localhost:27017/chessapp
     JWT_SECRET=your_jwt_secret
     PORT=5000
     ```
   - Adjust values as needed for your environment.

### Running the Server
To start the backend server:
```bash
npm start
# or
yarn start
```
The API will be available at [http://localhost:5000/api](http://localhost:5000/api) by default.
The WebSocket server will be available at `ws://localhost:5000`.

### API Endpoints
- `POST /api/auth/signup` - Register a new user
- `POST /api/auth/login` - Login and receive JWT
- `GET /api/auth/profile` - Get current user profile (JWT required)

### Deployment
- Deploy to any Node.js hosting (Heroku, Render, DigitalOcean, etc.)
- Ensure MongoDB is accessible from your deployment environment
- Set environment variables securely in your deployment platform

## Project Structure
- `index.js` - Main server file
- `routes/` - Express route handlers
- `models/` - Mongoose models

## License
MIT 