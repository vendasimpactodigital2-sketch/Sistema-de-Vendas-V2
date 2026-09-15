import React, { useState, useEffect } from "react";
import { X, Delete, Copy, CornerDownLeft } from "lucide-react";

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CalculatorModal({ isOpen, onClose }: CalculatorModalProps) {
  const [display, setDisplay] = useState<string>("0");
  const [equation, setEquation] = useState<string>("");
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [history, setHistory] = useState<string[]>([]);

  // Keyboard navigation support
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const { key } = e;
      if (key >= "0" && key <= "9") {
        handleNumber(key);
      } else if (key === ".") {
        handleDecimal();
      } else if (["+", "-", "*", "/"].includes(key)) {
        handleOperator(key);
      } else if (key === "Enter" || key === "=") {
        e.preventDefault();
        handleEvaluate();
      } else if (key === "Backspace") {
        handleBackspace();
      } else if (key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, display, equation, isFinished]);

  if (!isOpen) return null;

  const handleNumber = (num: string) => {
    if (display === "0" || isFinished) {
      setDisplay(num);
      setIsFinished(false);
    } else {
      setDisplay((prev) => prev + num);
    }
  };

  const handleDecimal = () => {
    if (isFinished) {
      setDisplay("0.");
      setIsFinished(false);
      return;
    }
    if (!display.includes(".")) {
      setDisplay((prev) => prev + ".");
    }
  };

  const handleOperator = (op: string) => {
    const cleanOp = op === "*" ? "×" : op === "/" ? "÷" : op;
    setEquation(`${display} ${cleanOp} `);
    setDisplay("0");
    setIsFinished(false);
  };

  const handleBackspace = () => {
    if (isFinished) {
      setDisplay("0");
      setIsFinished(false);
      return;
    }
    if (display.length > 1) {
      setDisplay((prev) => prev.slice(0, -1));
    } else {
      setDisplay("0");
    }
  };

  const handleClear = () => {
    setDisplay("0");
    setEquation("");
    setIsFinished(false);
  };

  const handleEvaluate = () => {
    if (!equation) return;
    
    // Convert friendly operators to JS operators
    const expression = (equation + display)
      .replace(/×/g, "*")
      .replace(/÷/g, "/");

    try {
      // Evaluate using safer Function constructor
      // eslint-disable-next-line no-new-func
      const result = new Function(`return (${expression})`)();
      
      if (result === undefined || isNaN(result) || !isFinite(result)) {
        setDisplay("Erro");
      } else {
        const formattedResult = Number(result.toFixed(6)).toString(); // Avoid floating point precision display errors
        const historyEntry = `${equation}${display} = ${formattedResult}`;
        
        setDisplay(formattedResult);
        setHistory((prev) => [historyEntry, ...prev].slice(0, 5)); // Keep last 5 entries
        setEquation("");
        setIsFinished(true);
      }
    } catch (e) {
      setDisplay("Erro");
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(display);
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-sans"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xs sm:max-w-sm bg-slate-900 border-2 border-slate-700/80 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden animate-scale-in my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/90">
          <span className="text-xs font-black text-brand-cyan uppercase tracking-wider flex items-center gap-1.5">
            🧮 Calculadora Rápida
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all cursor-pointer"
            title="Fechar (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Display Area */}
        <div className="p-4 bg-slate-950/80 flex flex-col items-end justify-center min-h-[80px] border-b border-slate-800">
          <div className="text-xs text-brand-magenta font-mono font-medium tracking-wide h-4 mb-1">
            {equation}
          </div>
          <div className="text-2xl font-black font-mono text-slate-100 break-all text-right select-all w-full flex items-center justify-between">
            <button
              onClick={copyToClipboard}
              className="p-1 text-slate-500 hover:text-brand-cyan hover:bg-slate-850 rounded transition-all text-xs mr-2 shrink-0"
              title="Copiar resultado"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <span className="text-right overflow-x-auto whitespace-nowrap scrollbar-none w-full">
              {display}
            </span>
          </div>
        </div>

        {/* Buttons Grid */}
        <div className="p-4 grid grid-cols-4 gap-2 bg-slate-900">
          {/* Row 1 */}
          <button
            onClick={handleClear}
            className="col-span-2 h-11 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/15 font-black text-xs transition-all cursor-pointer"
          >
            Zerar (C)
          </button>
          <button
            onClick={handleBackspace}
            className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/30 flex items-center justify-center transition-all cursor-pointer"
            title="Backspace"
          >
            <Delete className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleOperator("/")}
            className="h-11 rounded-xl bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/15 font-black text-lg transition-all cursor-pointer"
          >
            ÷
          </button>

          {/* Row 2 */}
          {["7", "8", "9"].map((n) => (
            <button
              key={n}
              onClick={() => handleNumber(n)}
              className="h-11 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-100 border border-slate-800/60 font-bold text-sm transition-all cursor-pointer"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => handleOperator("*")}
            className="h-11 rounded-xl bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/15 font-black text-lg transition-all cursor-pointer"
          >
            ×
          </button>

          {/* Row 3 */}
          {["4", "5", "6"].map((n) => (
            <button
              key={n}
              onClick={() => handleNumber(n)}
              className="h-11 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-100 border border-slate-800/60 font-bold text-sm transition-all cursor-pointer"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => handleOperator("-")}
            className="h-11 rounded-xl bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/15 font-black text-lg transition-all cursor-pointer"
          >
            -
          </button>

          {/* Row 4 */}
          {["1", "2", "3"].map((n) => (
            <button
              key={n}
              onClick={() => handleNumber(n)}
              className="h-11 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-100 border border-slate-800/60 font-bold text-sm transition-all cursor-pointer"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => handleOperator("+")}
            className="h-11 rounded-xl bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/15 font-black text-lg transition-all cursor-pointer"
          >
            +
          </button>

          {/* Row 5 */}
          <button
            onClick={() => handleNumber("0")}
            className="col-span-2 h-11 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-100 border border-slate-800/60 font-bold text-sm transition-all cursor-pointer"
          >
            0
          </button>
          <button
            onClick={handleDecimal}
            className="h-11 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-100 border border-slate-800/60 font-bold text-sm transition-all cursor-pointer"
          >
            .
          </button>
          <button
            onClick={handleEvaluate}
            className="h-11 rounded-xl bg-brand-cyan hover:bg-brand-cyan-light text-slate-950 font-black flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-brand-cyan/15"
          >
            <CornerDownLeft className="h-4 w-4 stroke-[3]" />
          </button>
        </div>

        {/* History Log */}
        {history.length > 0 && (
          <div className="p-3 bg-slate-950/60 border-t border-slate-850/50">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1 font-mono">
              Histórico Recente
            </div>
            <div className="space-y-1 max-h-[64px] overflow-y-auto">
              {history.map((entry, idx) => (
                <div key={idx} className="text-[10px] font-mono text-slate-400 text-right truncate">
                  {entry}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
