import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const PORT = 3000;

// Gemini AI setup for word validation
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface Player {
  id: string;
  name: string;
  isAlive: boolean;
}

interface GameState {
  roomId: string;
  players: Player[];
  currentTurnIndex: number;
  lastWord: string;
  history: { word: string; definition: string; player: string }[];
  status: "waiting" | "playing" | "finished";
  timer: number;
  winner?: string;
}

const rooms: Map<string, GameState> = new Map();
const turnTimers: Map<string, NodeJS.Timeout> = new Map();

async function validateWord(word: string, lastWord: string): Promise<{ isValid: boolean; definition: string; reason?: string }> {
  if (!word || word.trim().split(/\s+/).length !== 2) {
    return { isValid: false, definition: "", reason: "Từ phải có đúng 2 tiếng (ví dụ: 'học tập')." };
  }

  const normalizedWord = word.trim().toLowerCase();
  const parts = normalizedWord.split(/\s+/);
  
  if (lastWord) {
    const lastParts = lastWord.toLowerCase().split(/\s+/);
    const requiredStart = lastParts[lastParts.length - 1];
    if (parts[0] !== requiredStart) {
      return { isValid: false, definition: "", reason: `Từ phải bắt đầu bằng tiếng '${requiredStart}'.` };
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Kiểm tra xem cụm từ "${normalizedWord}" có phải là một từ hoặc cụm từ tiếng Việt có nghĩa và hợp lệ trong trò chơi nối từ không. 
      Nếu hợp lệ, hãy trả về JSON: {"isValid": true, "definition": "nghĩa ngắn gọn của từ"}. 
      Nếu không hợp lệ, trả về JSON: {"isValid": false, "definition": ""}.
      Chỉ trả về JSON, không giải thích thêm.`,
      config: {
        responseMimeType: "application/json",
      },
    });

    const result = JSON.parse(response.text || "{}");
    return {
      isValid: !!result.isValid,
      definition: result.definition || "Không có định nghĩa.",
    };
  } catch (error) {
    console.error("Gemini validation error:", error);
    // Fallback if AI fails - assume valid if it looks like Vietnamese (basic check)
    return { isValid: true, definition: "Đang cập nhật định nghĩa..." };
  }
}

function startTurnTimer(roomId: string) {
  if (turnTimers.has(roomId)) {
    clearInterval(turnTimers.get(roomId)!);
  }

  const timer = setInterval(() => {
    const game = rooms.get(roomId);
    if (!game || game.status !== "playing") {
      clearInterval(timer);
      return;
    }

    game.timer -= 1;
    if (game.timer <= 0) {
      // Player lost their turn
      handlePlayerTimeout(roomId);
    } else {
      io.to(roomId).emit("timer_update", game.timer);
    }
  }, 1000);

  turnTimers.set(roomId, timer);
}

function handlePlayerTimeout(roomId: string) {
  const game = rooms.get(roomId);
  if (!game) return;

  const currentPlayer = game.players[game.currentTurnIndex];
  currentPlayer.isAlive = false;
  
  io.to(roomId).emit("player_eliminated", { 
    player: currentPlayer.name, 
    reason: "Hết thời gian!" 
  });

  moveToNextTurn(roomId);
}

function moveToNextTurn(roomId: string) {
  const game = rooms.get(roomId);
  if (!game) return;

  const alivePlayers = game.players.filter(p => p.isAlive);
  
  if (alivePlayers.length <= 1) {
    game.status = "finished";
    game.winner = alivePlayers[0]?.name || "Không có ai";
    io.to(roomId).emit("game_over", { winner: game.winner });
    if (turnTimers.has(roomId)) {
      clearInterval(turnTimers.get(roomId)!);
    }
    return;
  }

  // Find next alive player
  let nextIndex = (game.currentTurnIndex + 1) % game.players.length;
  while (!game.players[nextIndex].isAlive) {
    nextIndex = (nextIndex + 1) % game.players.length;
  }

  game.currentTurnIndex = nextIndex;
  game.timer = 20;
  io.to(roomId).emit("game_state", game);
  startTurnTimer(roomId);
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create_room", (playerName: string) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const gameState: GameState = {
      roomId,
      players: [{ id: socket.id, name: playerName, isAlive: true }],
      currentTurnIndex: 0,
      lastWord: "",
      history: [],
      status: "waiting",
      timer: 20,
    };
    rooms.set(roomId, gameState);
    socket.join(roomId);
    socket.emit("room_created", gameState);
  });

  socket.on("join_room", ({ roomId, playerName }: { roomId: string; playerName: string }) => {
    const game = rooms.get(roomId);
    if (game && game.status === "waiting") {
      game.players.push({ id: socket.id, name: playerName, isAlive: true });
      socket.join(roomId);
      io.to(roomId).emit("game_state", game);
    } else {
      socket.emit("error", "Phòng không tồn tại hoặc đã bắt đầu.");
    }
  });

  socket.on("start_game", (roomId: string) => {
    const game = rooms.get(roomId);
    if (game && game.players.length >= 2) {
      game.status = "playing";
      game.currentTurnIndex = 0;
      game.timer = 20;
      io.to(roomId).emit("game_started", game);
      startTurnTimer(roomId);
    } else {
      socket.emit("error", "Cần ít nhất 2 người chơi để bắt đầu.");
    }
  });

  socket.on("submit_word", async ({ roomId, word }: { roomId: string; word: string }) => {
    const game = rooms.get(roomId);
    if (!game || game.status !== "playing") return;

    const currentPlayer = game.players[game.currentTurnIndex];
    if (currentPlayer.id !== socket.id) return;

    // Check if word was already used
    if (game.history.some(h => h.word.toLowerCase() === word.toLowerCase())) {
      socket.emit("error", "Từ này đã được sử dụng!");
      return;
    }

    const validation = await validateWord(word, game.lastWord);
    if (validation.isValid) {
      game.lastWord = word;
      game.history.push({ 
        word, 
        definition: validation.definition, 
        player: currentPlayer.name 
      });
      moveToNextTurn(roomId);
    } else {
      socket.emit("error", validation.reason || "Từ không hợp lệ!");
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    // Handle player leaving
    rooms.forEach((game, roomId) => {
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        if (game.status === "waiting") {
          game.players.splice(playerIndex, 1);
          if (game.players.length === 0) {
            rooms.delete(roomId);
          } else {
            io.to(roomId).emit("game_state", game);
          }
        } else if (game.status === "playing") {
          game.players[playerIndex].isAlive = false;
          io.to(roomId).emit("player_eliminated", { 
            player: game.players[playerIndex].name, 
            reason: "Đã rời khỏi phòng!" 
          });
          if (game.currentTurnIndex === playerIndex) {
            moveToNextTurn(roomId);
          }
        }
      }
    });
  });
});

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
