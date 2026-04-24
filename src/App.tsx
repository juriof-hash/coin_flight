/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GameEngine, GameState } from './game/GameEngine';
import { Trophy, Timer, Coins, ChevronRight, Play, RefreshCw, AlertTriangle } from 'lucide-react';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [showTimeBonus, setShowTimeBonus] = useState(false);

  useEffect(() => {
    if (containerRef.current && !engineRef.current) {
      engineRef.current = new GameEngine(containerRef.current, (state) => {
        setGameState(prev => {
          if (prev?.timeLeft && state.timeLeft > prev.timeLeft + 5) {
            setShowTimeBonus(true);
            setTimeout(() => setShowTimeBonus(false), 1000);
          }
          return state;
        });
      });
    }
  }, []);

  const handleStart = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setGameStarted(true);
    engineRef.current?.start();
  };

  const getStageColor = (stage: string) => {
    switch(stage) {
      case 'Ocean': return 'text-sky-400';
      case 'City': return 'text-slate-400';
      case 'Space': return 'text-indigo-400';
      default: return 'text-emerald-400';
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden font-sans text-slate-100">
      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* HUD Layer */}
      <AnimatePresence>
        {gameStarted && gameState && !gameState.isGameOver && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-0 inset-y-0 z-10 p-4 md:p-8 flex flex-col justify-between pointer-events-none"
          >
            {/* Top Row: Stats */}
            <div className="flex flex-col sm:flex-row justify-between items-center sm:items-start gap-4">
              <div className="flex gap-2 md:gap-4 w-full sm:w-auto">
                <div className="flex-1 sm:min-w-[120px] md:min-w-[140px] bg-black/80 border-4 border-slate-700 p-3 md:p-4 shadow-[4px_4px_0_0_rgba(51,65,85,1)]">
                  <div className="text-[10px] md:text-xs uppercase tracking-widest text-slate-300 font-bold mb-0.5 md:mb-1 text-center sm:text-left">SCORE</div>
                  <div className="text-2xl md:text-5xl font-mono font-black text-white leading-none text-center sm:text-left">
                    {gameState.score.toString().padStart(6, '0')}
                  </div>
                </div>
                <div className="relative flex-1 sm:min-w-[120px] md:min-w-[140px] bg-black/80 border-4 border-slate-700 p-3 md:p-4 shadow-[4px_4px_0_0_rgba(51,65,85,1)]">
                  <div className="text-[10px] md:text-xs uppercase tracking-widest text-slate-300 font-bold mb-0.5 md:mb-1 text-center sm:text-left">TIME</div>
                  <div className={`text-2xl md:text-5xl font-mono font-black leading-none text-center sm:text-left ${gameState.timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-orange-400'}`}>
                    {Math.max(0, gameState.timeLeft).toFixed(1)}<span className="text-lg md:text-2xl ml-0.5">s</span>
                  </div>
                  <AnimatePresence>
                    {showTimeBonus && (
                      <motion.span
                        initial={{ opacity: 1, scale: 0.5, x: 10 }}
                        animate={{ opacity: 0, scale: 2, y: -40 }}
                        className="absolute top-2 right-2 font-black text-emerald-400 pointer-events-none text-xs md:text-base"
                      >
                        +10s
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 w-full sm:w-auto justify-center">
                <div className="bg-black/80 border-4 border-slate-700 p-2 md:p-4 shadow-[4px_4px_0_0_rgba(51,65,85,1)] flex-1 sm:flex-none">
                  <div className="flex items-center gap-2 md:gap-4">
                    <div className="text-right hidden sm:block">
                      <div className="text-[10px] md:text-xs uppercase tracking-widest text-slate-400 font-bold">STAGE</div>
                      <div className={`text-base md:text-2xl font-bold uppercase ${getStageColor(gameState.stage)}`}>
                        {gameState.stage}
                      </div>
                    </div>
                    <div className={`w-8 h-8 md:w-12 md:h-12 border-4 border-white/10 border-t-current flex items-center justify-center text-[10px] md:text-xs font-black ${getStageColor(gameState.stage)}`}>
                      {gameState.stage === 'Meadow' ? '1/4' : gameState.stage === 'Ocean' ? '2/4' : gameState.stage === 'City' ? '3/4' : '4/4'}
                    </div>
                    <div className="sm:hidden text-left min-w-[70px]">
                       <div className={`text-[10px] font-bold uppercase ${getStageColor(gameState.stage)}`}>
                        {gameState.stage}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-black/50 backdrop-blur-md border border-white/10 px-3 md:px-4 py-1 md:py-2 rounded-full hidden sm:block">
                  <span className="text-[10px] text-white/60">Next: </span>
                  <span className="text-[10px] font-bold text-blue-400 tracking-wide uppercase">
                    {gameState.stage === 'Meadow' ? 'Ocean Depths' : gameState.stage === 'Ocean' ? 'Urban Skyline' : gameState.stage === 'City' ? 'Interstellar Void' : 'Zenith'}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Row: Speed and Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-center sm:items-end gap-4 overflow-hidden">
              <div className="bg-black/80 border-4 border-slate-700 p-4 md:p-6 shadow-[4px_4px_0_0_rgba(51,65,85,1)] w-full sm:w-auto sm:min-w-[240px] md:min-w-[280px]">
                <div className="flex flex-col gap-1 md:gap-2">
                  <div className="flex justify-between items-end mb-0.5 md:mb-1">
                    <span className="text-[10px] md:text-xs uppercase tracking-widest text-slate-300 font-bold">SPEED</span>
                    <span className="text-xl md:text-3xl font-mono text-emerald-400 font-bold">x{gameState.gameSpeed.toFixed(2)}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 border-2 border-slate-600 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (gameState.gameSpeed - 1) * 200)}%` }}
                      className="h-full bg-emerald-400" 
                    />
                  </div>
                </div>
              </div>

              <div className="hidden md:flex flex-col items-center gap-4">
                <div className="bg-white/10 backdrop-blur-lg rounded-full px-8 py-2 border border-white/20">
                  <p className="text-sm font-bold tracking-[0.2em] uppercase text-white/90">Move Pointer to Steer</p>
                </div>
                <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                  <div className="w-2 h-2 rounded-full bg-white/30"></div>
                  <div className="w-2 h-2 rounded-full bg-white/30"></div>
                </div>
              </div>

              <div className="bg-black/80 border-4 border-slate-700 p-3 md:p-4 shadow-[4px_4px_0_0_rgba(51,65,85,1)] w-full sm:w-auto sm:min-w-[160px] md:w-48 text-center sm:text-left">
                <div className="text-[10px] md:text-xs uppercase tracking-widest text-slate-300 font-bold mb-2 md:mb-3">TARGET</div>
                <div className="flex gap-2 justify-center sm:justify-start">
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-black border-2 border-yellow-400 flex items-center justify-center text-yellow-400 font-bold text-xs md:text-lg">G</div>
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-black border-2 border-slate-300 flex items-center justify-center text-slate-300 font-bold text-xs md:text-lg">S</div>
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-black border-2 border-red-500 flex items-center justify-center text-red-500 font-bold text-xs md:text-lg">T</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!gameStarted && (
          <motion.div
            key="start-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#020617]/80 backdrop-blur-sm p-4 md:p-6"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center w-full max-w-4xl"
            >
              <h1 className="mb-2 text-4xl sm:text-6xl md:text-8xl lg:text-9xl font-black uppercase leading-tight drop-shadow-lg">
                SKYBOUND<br />
                <span className="text-emerald-400">ODYSSEY</span>
              </h1>
              <div className="w-16 md:w-24 h-1 bg-emerald-400 mx-auto mb-6 md:mb-8" />
              <p className="max-w-md mx-auto mb-8 md:mb-12 text-sm md:text-xl text-slate-300 leading-relaxed px-4">
                Experience a retro 3D flight simulation. Maneuver through low-poly landscapes. Collect coins to survive.
              </p>
              
              <button
                onClick={handleStart}
                onPointerDown={handleStart}
                className="group relative px-10 md:px-16 py-4 md:py-6 bg-transparent border-4 border-emerald-400 text-emerald-400 hover:bg-emerald-400 hover:text-black transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer shadow-[0_0_20px_rgba(52,211,153,0.5)]"
              >
                <div className="flex items-center gap-3 md:gap-4">
                  <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" />
                  <span className="text-xl md:text-3xl font-black uppercase tracking-wider">Start Game</span>
                </div>
              </button>

              <div className="mt-12 md:mt-20 flex justify-center gap-6 md:gap-12 text-slate-500">
                {[
                  { label: 'Precision', desc: 'Control' },
                  { label: 'Temporal', desc: 'Strategy' },
                  { label: 'Infinite', desc: 'Velocity' }
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <span className="text-[8px] md:text-[10px] uppercase font-bold tracking-[0.2em] md:tracking-[0.3em] mb-0.5 md:mb-1">{item.label}</span>
                    <span className="text-[10px] md:text-xs font-medium text-slate-400 tracking-widest">{item.desc}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

        {gameStarted && gameState?.isGameOver && (
          <motion.div
            key="game-over"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#020617]/95 backdrop-blur-2xl p-4 md:p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-2xl w-full text-center"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 mb-6 md:mb-8 border-4 border-red-500 text-red-500 bg-black/50">
                <AlertTriangle className="w-8 h-8 md:w-10 md:h-10" />
              </div>
              
              <h2 className="text-4xl md:text-7xl font-black mb-1 uppercase leading-none text-red-500 drop-shadow-lg">GAME OVER</h2>
              <p className="text-slate-300 uppercase tracking-widest text-lg md:text-2xl mb-8 md:mb-16">Your flight has ended</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 mb-8 md:mb-16 px-2 md:px-4">
                <div className="bg-black/80 border-4 border-slate-700 p-6 md:p-10 shadow-[8px_8px_0_0_rgba(51,65,85,1)] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-[4px_4px_0_0_rgba(51,65,85,1)] transition-all">
                  <div className="text-lg md:text-xl uppercase tracking-widest text-emerald-400 mb-2 font-bold">Score</div>
                  <div className="text-5xl md:text-7xl font-mono font-black text-white">{gameState.score}</div>
                </div>
                <div className="bg-black/80 border-4 border-slate-700 p-6 md:p-10 shadow-[8px_8px_0_0_rgba(51,65,85,1)] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-[4px_4px_0_0_rgba(51,65,85,1)] transition-all">
                  <div className="text-lg md:text-xl uppercase tracking-widest text-sky-400 mb-2 font-bold">Time</div>
                  <div className="text-5xl md:text-7xl font-mono font-black text-white">{Math.floor(gameState.survivedTime)}<span className="text-2xl md:text-3xl text-sky-400 ml-2">s</span></div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-4 md:gap-6">
                <button
                  onClick={handleStart}
                  onPointerDown={handleStart}
                  className="w-full max-w-[280px] md:max-w-sm flex items-center justify-center gap-3 md:gap-4 px-8 md:px-12 py-4 md:py-6 bg-transparent border-4 border-white text-white hover:bg-white hover:text-black transition-all duration-300 font-black uppercase text-xl md:text-2xl tracking-wider shadow-[0_0_15px_rgba(255,255,255,0.3)] group cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 md:w-5 md:h-5 group-hover:rotate-180 transition-transform duration-700" />
                  Restart Simulation
                </button>
                <div className="text-[7px] md:text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                  Calculation Method: Coins + (Time × 5)
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-4 left-4 z-10 hidden md:flex items-center gap-3 text-white/20 select-none pointer-events-none">
        <span className="text-[10px] font-black uppercase tracking-widest">v1.2.0-stabilized</span>
        <div className="w-1 h-1 rounded-full bg-white/20" />
        <span className="text-[10px] font-black uppercase tracking-widest italic">Three.js Engine Running</span>
      </div>
    </div>
  );
}
