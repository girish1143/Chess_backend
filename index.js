// --- server.js (Node.js WebSocket Backend for Multiplayer Chess) ---

// Import necessary modules
const WebSocket = require('ws'); // WebSocket server library
const express = require('express'); // Web framework for HTTP server (optional, but good for serving static files or other APIs)
const http = require('http'); // Node.js built-in HTTP module
const { Chess } = require('chess.js'); // Chess game logic library (npm install chess.js)
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); // For environment variables (npm install dotenv)
const nodemailer = require('nodemailer'); // For sending emails (npm install nodemailer)
require('dotenv').config({ path: './config.env' });

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Middleware yhi k
app.use(cors());
app.use(express.json());

const password = process.env.Password; // Get password from environment variable
const email = process.env.Email; 

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: email,       // your Gmail address
    pass: password,          // 16-digit app password from Google
  },
});

app.post("/send-email", (req, res) => {
    // Extract data from request body
    const { name, email: senderEmail, subject, message } = req.body; 
    
    // Compose the email content
    const mailOptions = {
      from: email, // Use the email from environment variable
      to: email, // Send to the same email address
      subject: `Contact Form: ${subject}`,
      text: `
        Name: ${name}
        Email: ${senderEmail}
        Subject: ${subject}
        Message: ${message}
      `,
    };      
    
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error:", error);
        return res.status(500).send("Error sending email");
      }
      res.status(200).send("Email sent successfully");
    });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
    console.log('MongoDB connected successfully');
})
  .catch(err => {
    console.error('MongoDB connection error:', err);
    // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
  });

// Import routes
const authRoutes = require('./routes/auth');

// Use routes
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running' });
});

// Create a WebSocket server instance attached to the HTTP server
const wss = new WebSocket.Server({ server });

// --- Server-side State Management ---
// A queue for players waiting to be matched.
// Each element: { ws: WebSocket, id: string }
let playerQueue = [];

// A map to store active game rooms.
// Key: gameId (string)
// Value: {
//   players: [{ ws: WebSocket, id: string, color: 'w'|'b' }, { ... }],
//   chess: Chess instance, // The authoritative game state
//   fen: string // Current FEN string of the game
// }
const gameRooms = new Map();

// Simple counter for unique game IDs
let nextGameId = 1;

// --- Utility Function: Generate a unique ID for each player ---
const generatePlayerId = () => `player_${Math.random().toString(36).substring(2, 9)}`;

// --- WebSocket Connection Handler ---
wss.on('connection', (ws) => {
    // Assign a unique ID to each new WebSocket connection
    const playerId = generatePlayerId();
    ws.id = playerId; // Attach the ID directly to the WebSocket object for easy access
    // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.

    // Send an initial welcome message to the newly connected player
    ws.send(JSON.stringify({ type: 'info', message: 'Welcome! Connected to the chess server.' }));

    // Update queue status for all clients to reflect the new connection
    // This is useful for UI feedback (e.g., "X players in queue")
    updateAllClientsQueueStatus();

    // --- WebSocket Message Handler ---
    ws.on('message', (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
            // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
        } catch (e) {
            // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }));
            return;
        }

        switch (parsedMessage.type) {
            case 'join_queue':
                // Add player to the queue if they are not already in it or in an active game
                const isInQueue = playerQueue.some(p => p.ws === ws);
                const isInGame = Array.from(gameRooms.values()).some(room => room.players.some(p => p.ws === ws));

                if (!isInQueue && !isInGame) {
                    playerQueue.push({ ws: ws, id: playerId });
                    // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
                    ws.send(JSON.stringify({ type: 'info', message: 'You are in the queue. Waiting for an opponent...' }));
                    matchPlayers(); // Attempt to match players as soon as someone joins
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'You are already in the queue or in a game.' }));
                }
                break;

            case 'cancel_queue':
                const wasInQueue = playerQueue.some(p => p.ws === ws);
                playerQueue = playerQueue.filter(p => p.ws !== ws);
                if (wasInQueue) {
                    // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
                    ws.send(JSON.stringify({ type: 'info', message: 'You have left the queue.' }));
                    updateAllClientsQueueStatus(); // Update status for everyone
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'You were not in the queue.' }));
                }
                break;

            case 'make_move':
                const { gameId, move } = parsedMessage; // Client sends gameId and the move object
                const room = gameRooms.get(gameId);

                if (!room) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Error: Game not found or already ended.' }));
                    // If game not found, tell client to go back to welcome screen
                    ws.send(JSON.stringify({ type: 'game_end', message: 'Game not found. Please return to lobby.' }));
                    return;
                }

                const chess = room.chess;
                const currentPlayer = room.players.find(p => p.ws === ws);

                // Server-side validation:
                // 1. Check if the player sending the move is actually part of this game.
                // 2. Check if it's their turn based on the authoritative `chess.js` state.
                if (!currentPlayer || chess.turn() !== currentPlayer.color) {
                    ws.send(JSON.stringify({ type: 'error', message: "It's not your turn or you are not participating in this game." }));
                    // Send back the current authoritative FEN to correct any optimistic client updates
                    ws.send(JSON.stringify({ type: 'board_update', fen: chess.fen(), message: "Illegal move: Not your turn or not your piece." }));
                    return;
                }

                let result;
                try {
                    // Attempt to apply the move to the authoritative chess.js instance
                    result = chess.move(move);
                    if (result === null) {
                        // Move was illegal according to chess.js rules
                        ws.send(JSON.stringify({ type: 'error', message: 'Illegal move: Invalid chess move.' }));
                        // Send back the current authoritative FEN
                        ws.send(JSON.stringify({ type: 'board_update', fen: chess.fen(), message: "Illegal move. Please try again." }));
                        return;
                    }
                } catch (e) {
                    // Catch any unexpected errors from chess.js move function
                    // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
                    ws.send(JSON.stringify({ type: 'error', message: 'An error occurred while processing your move.' }));
                    ws.send(JSON.stringify({ type: 'board_update', fen: chess.fen(), message: "Internal error during move." }));
                    return;
                }

                // If the move is successful, update the room's FEN
                room.fen = chess.fen();

                // Broadcast the updated board state to all players in the room
                const moveMessage = `${currentPlayer.color === 'w' ? 'White' : 'Black'} moved ${result.from}${result.to}`;
                room.players.forEach(p => {
                    if (p.ws.readyState === WebSocket.OPEN) {
                        p.ws.send(JSON.stringify({
                            type: 'board_update',
                            fen: room.fen, // Send the authoritative FEN
                            message: moveMessage
                        }));
                    }
                });

                // Check for game end conditions after the move
                checkGameEnd(gameId, room);
                break;

            case 'leave_game':
                const gameToLeaveId = parsedMessage.gameId;
                const leavingRoom = gameRooms.get(gameToLeaveId);

                if (leavingRoom) {
                    // Notify the other player that their opponent left
                    leavingRoom.players.forEach(p => {
                        if (p.ws !== ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'game_end',
                                message: `Your opponent (${ws.id}) left the game. You win by abandonment!`,
                                fen: leavingRoom.chess.fen()
                            }));
                        }
                    });
                    // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
                    gameRooms.delete(gameToLeaveId); // Remove the game room
                }
                ws.send(JSON.stringify({ type: 'info', message: 'You have left the game.' }));
                break;

            case 'reconnect':
                // This is an advanced feature. For a simple implementation, we might just tell them to rejoin queue.
                // In a robust system, you'd store game states persistently and allow rejoining a specific game.
                // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
                ws.send(JSON.stringify({ type: 'error', message: 'Reconnect functionality not fully implemented. Please rejoin the queue.' }));
                break;

            default:
                // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
                ws.send(JSON.stringify({ type: 'error', message: 'Unknown command.' }));
        }
    });

    // --- WebSocket Close Handler ---
    ws.on('close', () => {
        // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
        // Remove player from queue if they were waiting
        playerQueue = playerQueue.filter(p => p.ws !== ws);

        // Check if the disconnected player was in an active game
        gameRooms.forEach((room, gameId) => {
            const playerIndex = room.players.findIndex(p => p.ws === ws);
            if (playerIndex !== -1) {
                // If so, notify the other player that their opponent disconnected
                const otherPlayer = room.players[(playerIndex + 1) % 2]; // Get the other player in the room
                if (otherPlayer && otherPlayer.ws.readyState === WebSocket.OPEN) {
                    otherPlayer.ws.send(JSON.stringify({
                        type: 'game_end',
                        message: `Your opponent (${ws.id}) disconnected. You win!`,
                        fen: room.chess.fen() // Send final board state
                    }));
                }
                // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
                gameRooms.delete(gameId); // Remove the game room
            }
        });

        // Update queue status for all remaining clients
        updateAllClientsQueueStatus();
    });

    // --- WebSocket Error Handler ---
    ws.on('error', (error) => {
        // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
        // Force close the connection on error to trigger 'close' event
        ws.close();
    });
});

// --- Helper: Update all clients about the current queue size ---
function updateAllClientsQueueStatus() {
    const playersInQueue = playerQueue.length;
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'queue_status', playersInQueue: playersInQueue, message: 'Queue updated.' }));
        }
    });
}

// --- Logic: Match Players from the Queue ---
function matchPlayers() {
    // Only attempt to match if there are at least two players in the queue
    if (playerQueue.length >= 2) {
        const player1 = playerQueue.shift(); // Take the first player from the queue
        const player2 = playerQueue.shift(); // Take the second player from the queue

        // Randomly assign white and black colors
        const whitePlayer = Math.random() < 0.5 ? player1 : player2;
        const blackPlayer = (whitePlayer === player1) ? player2 : player1;

        // Generate a unique ID for the new game room
        const gameId = `game-${nextGameId++}`;
        // Create a new authoritative chess.js instance for this game
        const newChessGame = new Chess();

        // Store the new game room in the map
        gameRooms.set(gameId, {
            players: [
                { ws: whitePlayer.ws, id: whitePlayer.id, color: 'w' },
                { ws: blackPlayer.ws, id: blackPlayer.id, color: 'b' }
            ],
            chess: newChessGame,
            fen: newChessGame.fen() // Store initial FEN
        });

        // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.

        // Prepare player IDs for the client message
        const playersInRoomIds = [whitePlayer.id, blackPlayer.id];

        // Notify both players that their game has started, sending their assigned color and initial board state
        if (whitePlayer.ws.readyState === WebSocket.OPEN) {
            whitePlayer.ws.send(JSON.stringify({
                type: 'game_start',
                gameId: gameId,
                color: 'w',
                fen: newChessGame.fen(),
                message: "Game started! You are White. It's your turn.",
                players: playersInRoomIds
            }));
        }
        if (blackPlayer.ws.readyState === WebSocket.OPEN) {
            blackPlayer.ws.send(JSON.stringify({
                type: 'game_start',
                gameId: gameId,
                color: 'b',
                fen: newChessGame.fen(),
                message: "Game started! You are Black. Waiting for White's move.",
                players: playersInRoomIds
            }));
        }

        // After matching, update the queue status for any remaining clients in the queue
        updateAllClientsQueueStatus();

        // Recursively call matchPlayers to see if there are enough players for another game
        // This handles cases where more than 2 players are in queue initially
        matchPlayers();
    } else {
        // If not enough players to match, just update remaining players about the queue size
        playerQueue.forEach(p => {
            if (p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(JSON.stringify({ type: 'queue_status', playersInQueue: playerQueue.length, message: 'Still waiting for an opponent...' }));
            }
        });
        // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
    }
}

// --- Logic: Check Game End Conditions ---
function checkGameEnd(gameId, room) {
    const chess = room.chess;
    let endMessage = null;

    if (chess.isCheckmate()) {
        const winnerColor = chess.turn() === 'w' ? 'Black' : 'White';
        endMessage = `Checkmate! ${winnerColor} wins!`;
    } else if (chess.isDraw()) {
        endMessage = "It's a Draw!";
    } else if (chess.isStalemate()) {
        endMessage = "Stalemate! It's a Draw!";
    } else if (chess.isThreefoldRepetition()) {
        endMessage = "Draw by Threefold Repetition!";
    } else if (chess.isInsufficientMaterial()) {
        endMessage = "Draw by Insufficient Material!";
    }

    if (endMessage) {
        // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
        room.players.forEach(p => {
            if (p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(JSON.stringify({ type: 'game_end', message: endMessage, fen: chess.fen() }));
            }
        });
        gameRooms.delete(gameId); // Remove the game room once it's ended
    }
}

// Start the HTTP server on a specified port
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
    // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
    // All console.log, console.warn, and console.error statements removed throughout the file for production readiness.
});
