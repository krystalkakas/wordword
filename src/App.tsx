import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "motion/react";
import { 
  Users, 
  Plus, 
  LogIn, 
  Play, 
  History, 
  Clock, 
  Trophy, 
  AlertCircle, 
  BookOpen,
  Send,
  HelpCircle,
  X
} from "lucide-react";

interface Player {
  id: string;
  name: string;
  isAlive: boolean;
}

interface GameHistory {
  word: string;
  definition: string;
  player: string;
}

interface GameState {
  roomId: string;
  players: Player[];
  currentTurnIndex: number;
  lastWord: string;
  history: GameHistory[];
  status: "waiting" | "playing" | "finished";
  timer: number;
  winner?: string;
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState("");
  const [inputWord, setInputWord] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [selectedWord, setSelectedWord] = useState<GameHistory | null>(null);
  
  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on("room_created", (state: GameState) => {
      setGameState(state);
      setError("");
    });

    newSocket.on("game_state", (state: GameState) => {
      setGameState(state);
      setError("");
    });

    newSocket.on("game_started", (state: GameState) => {
      setGameState(state);
      setError("");
    });

    newSocket.on("timer_update", (time: number) => {
      setGameState(prev => prev ? { ...prev, timer: time } : null);
    });

    newSocket.on("player_eliminated", ({ player, reason }) => {
      setError(`${player} đã bị loại: ${reason}`);
      setTimeout(() => setError(""), 3000);
    });

    newSocket.on("game_over", ({ winner }) => {
      setGameState(prev => prev ? { ...prev, status: "finished", winner } : null);
    });

    newSocket.on("error", (msg: string) => {
      setError(msg);
      setTimeout(() => setError(""), 3000);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameState?.history]);

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      setError("Vui lòng nhập tên của bạn");
      return;
    }
    socket?.emit("create_room", playerName);
  };

  const handleJoinRoom = () => {
    if (!playerName.trim() || !roomCode.trim()) {
      setError("Vui lòng nhập tên và mã phòng");
      return;
    }
    socket?.emit("join_room", { roomId: roomCode.toUpperCase(), playerName });
  };

  const handleStartGame = () => {
    if (gameState) {
      socket?.emit("start_game", gameState.roomId);
    }
  };

  const handleSubmitWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputWord.trim() || !gameState) return;
    socket?.emit("submit_word", { roomId: gameState.roomId, word: inputWord.trim() });
    setInputWord("");
  };

  const isMyTurn = gameState?.status === "playing" && 
    gameState.players[gameState.currentTurnIndex]?.id === socket?.id;

  if (!gameState) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex flex-col items-center justify-center p-4 font-sans text-[#141414]">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-8"
        >
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-4xl font-black italic tracking-tighter uppercase">Nối Từ Việt</h1>
            <button 
              onClick={() => setShowInstructions(true)}
              className="p-2 hover:bg-[#141414] hover:text-white transition-colors border-2 border-[#141414]"
            >
              <HelpCircle size={24} />
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-2 opacity-50">Tên người chơi</label>
              <input 
                type="text" 
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Nhập tên của bạn..."
                className="w-full p-4 border-2 border-[#141414] font-mono focus:outline-none focus:bg-[#141414] focus:text-white transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={handleCreateRoom}
                className="flex flex-col items-center justify-center p-6 border-2 border-[#141414] hover:bg-[#141414] hover:text-white transition-all group"
              >
                <Plus size={32} className="mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-bold uppercase">Tạo phòng</span>
              </button>
              <div className="flex flex-col space-y-2">
                <input 
                  type="text" 
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  placeholder="Mã phòng..."
                  className="w-full p-2 border-2 border-[#141414] font-mono text-center uppercase focus:outline-none"
                />
                <button 
                  onClick={handleJoinRoom}
                  className="flex items-center justify-center p-3 bg-[#141414] text-white hover:bg-white hover:text-[#141414] border-2 border-[#141414] transition-all"
                >
                  <LogIn size={20} className="mr-2" />
                  <span className="text-sm font-bold uppercase">Vào phòng</span>
                </button>
              </div>
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-6 p-4 bg-red-100 border-2 border-red-500 text-red-700 flex items-center"
            >
              <AlertCircle size={20} className="mr-2 flex-shrink-0" />
              <span className="text-sm font-bold">{error}</span>
            </motion.div>
          )}
        </motion.div>

        <AnimatePresence>
          {showInstructions && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white border-2 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] p-8 max-w-lg w-full"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-black uppercase italic">Hướng dẫn chơi</h2>
                  <button onClick={() => setShowInstructions(false)} className="hover:rotate-90 transition-transform">
                    <X size={24} />
                  </button>
                </div>
                <div className="space-y-4 font-medium leading-relaxed">
                  <p>1. <span className="font-bold">Luật chơi:</span> Người chơi sau phải dùng tiếng cuối của từ người chơi trước để bắt đầu từ mới.</p>
                  <p>2. <span className="font-bold">Yêu cầu:</span> Từ phải có đúng 2 tiếng (ví dụ: "học tập" nối tiếp bằng "tập làm").</p>
                  <p>3. <span className="font-bold">Thời gian:</span> Mỗi lượt có 20 giây để suy nghĩ và gõ từ.</p>
                  <p>4. <span className="font-bold">Loại trừ:</span> Nếu hết thời gian hoặc gõ từ không hợp lệ, bạn sẽ bị loại.</p>
                  <p>5. <span className="font-bold">Chiến thắng:</span> Người cuối cùng còn trụ lại sẽ là người thắng cuộc.</p>
                  <p className="text-xs opacity-50 italic">* Từ điển được kiểm tra tự động bởi AI để đảm bảo tính công bằng.</p>
                </div>
                <button 
                  onClick={() => setShowInstructions(false)}
                  className="mt-8 w-full p-4 bg-[#141414] text-white font-bold uppercase tracking-widest hover:bg-white hover:text-[#141414] border-2 border-[#141414] transition-all"
                >
                  Đã hiểu!
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (gameState.status === "waiting") {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex flex-col items-center justify-center p-4 font-sans text-[#141414]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-8"
        >
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-bold uppercase tracking-widest opacity-50">Phòng: {gameState.roomId}</span>
            <span className="flex items-center text-xs font-bold uppercase tracking-widest px-2 py-1 bg-[#141414] text-white">
              <Users size={14} className="mr-1" /> {gameState.players.length} người
            </span>
          </div>

          <h2 className="text-3xl font-black uppercase italic mb-8">Đang chờ người chơi...</h2>

          <div className="space-y-3 mb-8">
            {gameState.players.map((p, i) => (
              <div key={p.id} className="flex items-center p-3 border-2 border-[#141414] font-mono">
                <span className="w-6 h-6 flex items-center justify-center bg-[#141414] text-white text-xs mr-3">{i + 1}</span>
                <span className="font-bold">{p.name}</span>
                {p.id === socket?.id && <span className="ml-auto text-[10px] uppercase font-black bg-yellow-300 px-1">Bạn</span>}
              </div>
            ))}
          </div>

          {gameState.players[0]?.id === socket?.id ? (
            <button 
              onClick={handleStartGame}
              disabled={gameState.players.length < 2}
              className={`w-full p-4 flex items-center justify-center font-bold uppercase tracking-widest transition-all border-2 border-[#141414] ${
                gameState.players.length < 2 
                ? "opacity-50 cursor-not-allowed bg-gray-100" 
                : "bg-[#141414] text-white hover:bg-white hover:text-[#141414]"
              }`}
            >
              <Play size={20} className="mr-2" />
              Bắt đầu ngay
            </button>
          ) : (
            <div className="p-4 border-2 border-dashed border-[#141414] text-center font-bold uppercase text-sm animate-pulse">
              Đang chờ chủ phòng bắt đầu...
            </div>
          )}

          {error && (
            <div className="mt-4 text-red-600 text-xs font-bold uppercase text-center">{error}</div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E4E3E0] grid grid-cols-1 lg:grid-cols-[1fr_350px] font-sans text-[#141414]">
      {/* Main Game Area */}
      <main className="p-4 lg:p-8 flex flex-col h-screen overflow-hidden">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black uppercase italic tracking-tighter">Nối Từ Việt</h1>
            <p className="text-xs font-bold opacity-50 uppercase tracking-widest">Phòng: {gameState.roomId}</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className={`flex items-center px-4 py-2 border-2 border-[#141414] bg-white shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] ${gameState.timer <= 5 ? "animate-bounce border-red-500 text-red-500" : ""}`}>
              <Clock size={20} className="mr-2" />
              <span className="text-2xl font-mono font-black">{gameState.timer}s</span>
            </div>
          </div>
        </header>

        <div className="flex-grow flex flex-col items-center justify-center space-y-12">
          {gameState.status === "finished" ? (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center space-y-6"
            >
              <Trophy size={80} className="mx-auto text-yellow-500 mb-4" />
              <h2 className="text-6xl font-black uppercase italic tracking-tighter">Chiến thắng!</h2>
              <p className="text-2xl font-bold uppercase">{gameState.winner} là người cuối cùng!</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-8 py-4 bg-[#141414] text-white font-bold uppercase tracking-widest border-2 border-[#141414] hover:bg-white hover:text-[#141414] transition-all"
              >
                Chơi lại
              </button>
            </motion.div>
          ) : (
            <>
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-widest opacity-50 mb-4">Lượt của:</p>
                <div className="flex items-center justify-center space-x-4">
                  {gameState.players.map((p, i) => (
                    <div 
                      key={p.id} 
                      className={`relative px-4 py-2 border-2 border-[#141414] transition-all ${
                        gameState.currentTurnIndex === i 
                        ? "bg-[#141414] text-white scale-110 shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)]" 
                        : p.isAlive ? "bg-white opacity-50" : "bg-red-100 line-through opacity-30"
                      }`}
                    >
                      <span className="font-bold">{p.name}</span>
                      {gameState.currentTurnIndex === i && (
                        <motion.div 
                          layoutId="turn-indicator"
                          className="absolute -top-8 left-1/2 -translate-x-1/2"
                        >
                          <Play size={20} className="rotate-90 text-[#141414]" />
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full max-w-2xl text-center">
                <p className="text-xs font-bold uppercase tracking-widest opacity-50 mb-2">Từ hiện tại:</p>
                <div className="text-7xl lg:text-9xl font-black uppercase italic tracking-tighter break-words">
                  {gameState.lastWord || "Bắt đầu!"}
                </div>
              </div>

              {isMyTurn && (
                <motion.form 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  onSubmit={handleSubmitWord}
                  className="w-full max-w-md"
                >
                  <div className="relative">
                    <input 
                      autoFocus
                      type="text"
                      value={inputWord}
                      onChange={(e) => setInputWord(e.target.value)}
                      placeholder="Nhập từ nối tiếp..."
                      className="w-full p-6 text-2xl border-4 border-[#141414] font-bold focus:outline-none shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] pr-20"
                    />
                    <button 
                      type="submit"
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-[#141414] text-white hover:scale-110 transition-transform"
                    >
                      <Send size={24} />
                    </button>
                  </div>
                  {error && (
                    <p className="mt-4 text-red-600 font-bold uppercase text-xs text-center">{error}</p>
                  )}
                </motion.form>
              )}
            </>
          )}
        </div>
      </main>

      {/* Sidebar: History & Definitions */}
      <aside className="border-l-2 border-[#141414] bg-white flex flex-col h-screen">
        <div className="p-6 border-b-2 border-[#141414] flex items-center justify-between">
          <h3 className="text-xl font-black uppercase italic flex items-center">
            <History size={20} className="mr-2" /> Lịch sử
          </h3>
          <span className="text-xs font-bold bg-[#141414] text-white px-2 py-1">{gameState.history.length} từ</span>
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {gameState.history.slice().reverse().map((h, i) => (
            <motion.div 
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              key={i}
              onClick={() => setSelectedWord(h)}
              className="p-4 border-2 border-[#141414] hover:bg-[#141414] hover:text-white transition-all cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-lg font-black uppercase italic">{h.word}</span>
                <span className="text-[10px] font-bold uppercase opacity-50 group-hover:opacity-100">{h.player}</span>
              </div>
              <p className="text-xs line-clamp-2 opacity-70 group-hover:opacity-100">{h.definition}</p>
            </motion.div>
          ))}
          <div ref={historyEndRef} />
        </div>

        {selectedWord && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="p-6 border-t-4 border-[#141414] bg-yellow-50"
          >
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-lg font-black uppercase italic flex items-center">
                <BookOpen size={18} className="mr-2" /> {selectedWord.word}
              </h4>
              <button onClick={() => setSelectedWord(null)}><X size={18} /></button>
            </div>
            <p className="text-sm font-medium leading-relaxed">{selectedWord.definition}</p>
          </motion.div>
        )}
      </aside>
    </div>
  );
}
