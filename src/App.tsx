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

  const handleStart = () => {
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
            className="absolute inset-0 z-10 p-8 flex flex-col justify-between pointer-events-none"
          >
            {/* Top Row: Stats */}
            <div className="flex justify-between items-start">
              <div className="flex gap-4">
                <div className="bg-black/50 backdrop-blur-md border border-white/10 p-4 rounded-xl min-w-[140px]">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Score</div>
                  <div className="text-4xl font-mono font-black text-white leading-none">
                    {gameState.score.toString().padStart(6, '0')}
                  </div>
                </div>
                <div className="bg-black/50 backdrop-blur-md border border-white/10 p-4 rounded-xl min-w-[140px]">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Time Left</div>
                  <div className={`text-4xl font-mono font-black leading-none ${gameState.timeLeft < 10 ? 'text-orange-500 animate-pulse' : 'text-orange-400'}`}>
                    {Math.max(0, gameState.timeLeft).toFixed(1)}<span className="text-xl">s</span>
                  </div>
                  <AnimatePresence>
                    {showTimeBonus && (
                      <motion.span
                        initial={{ opacity: 1, scale: 0.5, x: 20 }}
                        animate={{ opacity: 0, scale: 2, y: -40 }}
                        className="absolute top-4 right-4 font-black text-emerald-400 pointer-events-none"
                      >
                        +10s
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <div className="bg-black/50 backdrop-blur-md border border-white/10 p-4 rounded-xl mb-4">
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Current Stage</div>
                      <div className={`text-xl font-bold uppercase ${getStageColor(gameState.stage)}`}>
                        {gameState.stage}
                      </div>
                    </div>
                    <div className={`w-12 h-12 rounded-full border-4 border-white/5 border-t-current flex items-center justify-center text-xs font-black ${getStageColor(gameState.stage)}`}>
                      {gameState.stage === 'Meadow' ? '1/4' : gameState.stage === 'Ocean' ? '2/4' : gameState.stage === 'City' ? '3/4' : '4/4'}
                    </div>
                  </div>
                </div>
                <div className="bg-black/50 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full">
                  <span className="text-xs text-white/60">Next: </span>
                  <span className="text-xs font-bold text-blue-400 tracking-wide">
                    {gameState.stage === 'Meadow' ? 'Ocean Depths' : gameState.stage === 'Ocean' ? 'Urban Skyline' : gameState.stage === 'City' ? 'Interstellar Void' : 'Zenith'}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Row: Speed and Controls */}
            <div className="flex justify-between items-end">
              <div className="bg-black/50 backdrop-blur-md border border-white/10 p-6 rounded-2xl min-w-[280px]">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Flight Speed</span>
                    <span className="text-2xl font-mono text-white font-bold">x{gameState.gameSpeed.toFixed(2)}</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (gameState.gameSpeed - 1) * 200)}%` }}
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
                    />
                  </div>
                  <div className="text-[9px] text-slate-500 uppercase mt-1 italic tracking-wider">
                    +10% difficulty increase based on flight time
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-4">
                <div className="bg-white/10 backdrop-blur-lg rounded-full px-8 py-2 border border-white/20">
                  <p className="text-sm font-bold tracking-[0.2em] uppercase text-white/90">Move Pointer to Steer</p>
                </div>
                <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                  <div className="w-2 h-2 rounded-full bg-white/30"></div>
                  <div className="w-2 h-2 rounded-full bg-white/30"></div>
                </div>
              </div>

              <div className="bg-black/50 backdrop-blur-md border border-white/10 p-4 rounded-xl w-48">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-3">Recent Progress</div>
                <div className="flex gap-2">
                  <div className="w-10 h-10 rounded-lg bg-yellow-400/20 border border-yellow-400/50 flex items-center justify-center text-yellow-400 font-bold">G</div>
                  <div className="w-10 h-10 rounded-lg bg-slate-400/20 border border-slate-400/50 flex items-center justify-center text-slate-300 font-bold">S</div>
                  <div className="w-10 h-10 rounded-lg bg-red-400/20 border border-red-400/50 flex items-center justify-center text-red-400 font-bold">T</div>
                  <div className="w-10 h-10 rounded-lg border border-white/5 flex items-center justify-center text-white/10 italic">...</div>
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
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#020617]/80 backdrop-blur-sm p-6"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center"
            >
              <h1 className="mb-2 text-7xl font-black tracking-tighter uppercase md:text-9xl leading-tight">
                SKYBOUND<br />
                <span className="text-emerald-400 italic">ODYSSEY</span>
              </h1>
              <div className="w-24 h-1 bg-white/20 mx-auto mb-8 rounded-full" />
              <p className="max-w-md mx-auto mb-12 text-lg text-slate-400 font-medium leading-relaxed tracking-wide">
                Experience a refined low-poly flight simulation. Maneuver through evolving landscapes while managing your energy and time.
              </p>
              
              <button
                onClick={handleStart}
                className="group relative px-16 py-6 rounded-2xl bg-white text-black hover:bg-emerald-400 hover:text-white transition-all duration-500 transform hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.1)]"
              >
                <div className="flex items-center gap-4">
                  <Play className="w-6 h-6 fill-current" />
                  <span className="text-xl font-black uppercase tracking-[0.2em]">Initiate Flight</span>
                </div>
              </button>

              <div className="mt-20 flex justify-center gap-12 text-slate-500">
                {[
                  { label: 'Precision', desc: 'Control' },
                  { label: 'Temporal', desc: 'Strategy' },
                  { label: 'Infinite', desc: 'Velocity' }
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <span className="text-[10px] uppercase font-bold tracking-[0.3em] mb-1">{item.label}</span>
                    <span className="text-xs font-medium text-slate-400 tracking-widest">{item.desc}</span>
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
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#020617]/95 backdrop-blur-2xl p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-2xl w-full text-center"
            >
              <div className="inline-flex items-center justify-center w-20 h-20 mb-8 rounded-full border border-red-500/30 text-red-500">
                <AlertTriangle className="w-10 h-10" />
              </div>
              
              <h2 className="text-6xl font-black mb-1 tracking-tighter uppercase italic leading-none">Flight Terminated</h2>
              <p className="text-slate-500 uppercase tracking-[0.4em] font-bold text-[10px] mb-16">Operational Status: Finalized</p>

              <div className="grid grid-cols-2 gap-6 mb-16 px-4">
                <div className="bg-white/5 border border-white/10 p-10 rounded-3xl backdrop-blur-md">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">Accumulated Score</div>
                  <div className="text-6xl font-mono font-black text-white">{gameState.score}</div>
                </div>
                <div className="bg-white/5 border border-white/10 p-10 rounded-3xl backdrop-blur-md">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">Active Duration</div>
                  <div className="text-6xl font-mono font-black text-white">{Math.floor(gameState.survivedTime)}<span className="text-2xl">s</span></div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-6">
                <button
                  onClick={handleStart}
                  className="w-full max-w-sm flex items-center justify-center gap-4 px-12 py-6 rounded-2xl bg-white text-black hover:bg-emerald-400 hover:text-white transition-all duration-500 font-black uppercase tracking-[0.2em] shadow-xl group"
                >
                  <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-700" />
                  Restart Simulation
                </button>
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
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
