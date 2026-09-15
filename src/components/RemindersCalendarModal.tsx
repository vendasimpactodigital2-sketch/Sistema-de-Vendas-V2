import React, { useState, useEffect, useMemo } from "react";
import { 
  X, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Trash2, 
  Check, 
  Bell, 
  Sparkles,
  AlertCircle,
  HelpCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface RemindersCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function RemindersCalendarModal({ isOpen, onClose }: RemindersCalendarModalProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  
  // Active calendar navigation
  const [currentMonth, setCurrentMonth] = useState(() => currentDate.getMonth());
  const [currentYear, setCurrentYear] = useState(() => currentDate.getFullYear());
  
  // Selected day parameters (defaults to today)
  const [selectedDay, setSelectedDay] = useState<{ day: number; month: number; year: number }>(() => ({
    day: currentDate.getDate(),
    month: currentDate.getMonth(),
    year: currentDate.getFullYear()
  }));

  // Reminders list synced with localStorage
  const [reminders, setReminders] = useState<any[]>([]);

  // Sound effects or Toast notifications could be triggered here if wanted, but keep it elegant and clean
  
  // Load and subscribe from localStorage
  const loadRemindersFromLocal = () => {
    try {
      const WELCOME_TITLE = "Bem-vindo ao nosso sistema Nexvolt, o sistema que faz a diferença onde você tem o controle da sua empresa na palma da sua mão 🚀";
      const saved = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
      if (saved) {
        const parsed = JSON.parse(saved);
        let changed = false;
        const updated = parsed.map((item: any) => {
          if (item.id === "welcome-reminder" || (item.title && item.title.includes("Boas-vindas à Gráfica"))) {
            changed = true;
            return { ...item, title: WELCOME_TITLE };
          }
          return item;
        });
        if (changed) {
          localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", JSON.stringify(updated));
        }
        setReminders(updated);
      } else {
        const todayStr = new Date().toISOString().split("T")[0];
        const defaultRem = [
          {
            id: "welcome-reminder",
            title: WELCOME_TITLE,
            type: "date",
            date: todayStr,
            time: "09:00",
            isAllDay: true,
            completed: false,
            notified: false
          }
        ];
        localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", JSON.stringify(defaultRem));
        setReminders(defaultRem);
        window.dispatchEvent(new Event("storage"));
      }
    } catch (e) {
      console.error("Erro ao carregar lembretes:", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRemindersFromLocal();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleStorageChange = () => {
      loadRemindersFromLocal();
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Sync update helper
  const syncAndStoreReminders = (updated: any[]) => {
    try {
      localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", JSON.stringify(updated));
      setReminders(updated);
      // Dispatch storage event to alert other listening React components
      window.dispatchEvent(new Event("storage"));
    } catch (err) {
      console.error("Erro ao sincronizar lembrete:", err);
    }
  };

  const handleToggleChecked = (id: string) => {
    const updated = reminders.map((rem) => 
      rem.id === id ? { ...rem, completed: !rem.completed } : rem
    );
    syncAndStoreReminders(updated);
  };

  const handleDelete = (id: string) => {
    const updated = reminders.filter((rem) => rem.id !== id);
    syncAndStoreReminders(updated);
  };

  // Build grid of 42 slots representing the monthly calendar grid view
  const calendarSlots = useMemo(() => {
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
    
    const startDayOfWeek = startOfMonth.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const totalDays = endOfMonth.getDate();

    const slots = [];

    // Prior Month filler days
    const prevMonthEnd = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevM = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear;
      slots.push({
        day: prevMonthEnd - i,
        month: prevM,
        year: prevY,
        isCurrentMonth: false
      });
    }

    // Active Month days
    for (let i = 1; i <= totalDays; i++) {
      slots.push({
        day: i,
        month: currentMonth,
        year: currentYear,
        isCurrentMonth: true
      });
    }

    // Next Month filler days
    const remaining = 42 - slots.length;
    for (let i = 1; i <= remaining; i++) {
      const nextM = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextY = currentMonth === 11 ? currentYear + 1 : currentYear;
      slots.push({
        day: i,
        month: nextM,
        year: nextY,
        isCurrentMonth: false
      });
    }

    return slots;
  }, [currentMonth, currentYear]);

  // Helper inside loop to check if a specific calendar day has reminders
  const getRemindersForSelectedDay = (day: number, month: number, year: number) => {
    const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dateObj = new Date(year, month, day);
    const dayOfWeek = dateObj.getDay();

    return reminders.filter((r) => {
      if (r.type === "date") {
        return r.date === dStr;
      } else if (r.type === "weekly") {
        return Number(r.dayOfWeek) === dayOfWeek;
      }
      return false;
    });
  };

  // Selected Day reminders reference
  const activeRemindersForSelectedDay = useMemo(() => {
    return getRemindersForSelectedDay(selectedDay.day, selectedDay.month, selectedDay.year);
  }, [selectedDay, reminders]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  const handleSelectDay = (slot: { day: number; month: number; year: number }) => {
    setSelectedDay(slot);
    // If user clicked a day that was from an adjacent month, automatically shift calendar to that month!
    if (slot.month !== currentMonth) {
      setCurrentMonth(slot.month);
      setCurrentYear(slot.year);
    }
  };

  // Helper format PT-BR date presentation label
  const formattedSelectedDayLabel = useMemo(() => {
    const dObj = new Date(selectedDay.year, selectedDay.month, selectedDay.day);
    const daysWeekPT = [
      "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
      "Quinta-feira", "Sexta-feira", "Sábado"
    ];
    return `${daysWeekPT[dObj.getDay()]}, ${selectedDay.day} de ${MONTHS_PT[selectedDay.month]} de ${selectedDay.year}`;
  }, [selectedDay]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in font-sans">
      <div 
        id="reminders-calendar-modal"
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-800/80 rounded-3xl shadow-2xl flex flex-col h-[90vh] lg:h-[82vh] max-h-[700px] overflow-hidden animate-scale-in"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-brand-magenta/20 to-pink-500/10 text-brand-magenta shadow-inner">
              <Calendar className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xs sm:text-xs font-black text-slate-100 uppercase tracking-widest flex items-center gap-2">
                AGENDA DE LEMBRETES NÚCLEO
              </h3>
              <p className="text-[9.5px] text-slate-450 font-mono uppercase tracking-wider font-semibold">Calendário mensal de obrigações e avisos sincronizados</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-850 transition-all cursor-pointer border border-transparent hover:border-slate-800"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body layout split into 2 Columns (Calendar & Detailed Day list) */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-12 bg-slate-905">
          
          {/* COLUMN LEFT: MONTH COMPACT CALENDAR GRID (7 columns) */}
          <div className="lg:col-span-7 p-3 sm:p-4 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900">
            <div>
              {/* Calendar Control Header */}
              <div className="flex items-center justify-between mb-4 bg-slate-950/40 p-2 border border-slate-850 rounded-xl">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="text-sm sm:text-base font-black uppercase text-rose-500 tracking-widest font-sans flex items-center gap-1.5 select-none">
                  <span>{MONTHS_PT[currentMonth]}</span>
                  <span className="text-slate-600 font-light">|</span>
                  <span className="text-slate-200 font-extrabold">{currentYear}</span>
                </div>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Unified High-Precision Calendar Sheet (Weekday labels + Days in perfect 1px borders) */}
              <div id="aesthetic-calendar-sheet" className="grid grid-cols-7 bg-slate-800 p-[1px] rounded-2xl gap-[1px] border border-slate-800/85 overflow-hidden shadow-2xl select-none">
                {/* 7 Weekday helper grid column headers */}
                {WEEKDAYS_SHORT.map((dayLabel, idx) => {
                  let headerClass = "text-center text-[10px] font-black uppercase py-2 tracking-widest font-sans border-b border-slate-800/60 ";
                  if (idx === 0) {
                    headerClass += "text-rose-400 bg-rose-950/25";
                  } else if (idx === 6) {
                    headerClass += "text-amber-400 bg-slate-900/90";
                  } else {
                    headerClass += "text-slate-350 bg-slate-950/40";
                  }
                  return (
                    <div key={`header-day-${idx}`} className={headerClass}>
                      {dayLabel}
                    </div>
                  );
                })}

                {/* 42 Calibrated Monthly grid days */}
                {calendarSlots.map((slot, index) => {
                  const dayReminders = getRemindersForSelectedDay(slot.day, slot.month, slot.year);
                  const activeReminders = dayReminders.filter((r) => !r.completed);
                  const hasReminders = dayReminders.length > 0;
                  const isToday = 
                    new Date().getDate() === slot.day && 
                    new Date().getMonth() === slot.month && 
                    new Date().getFullYear() === slot.year;
                  
                  const isSelected = 
                    selectedDay.day === slot.day && 
                    selectedDay.month === slot.month && 
                    selectedDay.year === slot.year;

                  const weekdayIndex = index % 7;

                  // Compute absolute status classes for aesthetic representation
                  let cellClasses = "relative h-10 sm:h-11 lg:h-12 py-1 px-0.5 flex flex-col justify-between items-center transition-all cursor-pointer group outline-none ";

                  if (isSelected) {
                    // Highlights selected day
                    cellClasses += "bg-brand-magenta/30 text-white ring-2 ring-brand-magenta/80 z-10 scale-[1.02] shadow-[0_0_15px_rgba(236,72,153,0.35)]";
                  } else if (hasReminders) {
                    // Styled beautifully in vibrant emerald green block
                    cellClasses += "bg-emerald-950/70 text-emerald-300 border border-emerald-555 hover:bg-emerald-900/40 shadow-[inset_0_0_10px_rgba(16,185,129,0.2)]";
                  } else if (isToday) {
                    cellClasses += "bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/40 hover:bg-brand-cyan/25";
                  } else if (!slot.isCurrentMonth) {
                    cellClasses += "bg-slate-950/20 text-slate-600 hover:bg-slate-950/30 cursor-pointer";
                  } else {
                    // Normal active monthly cells
                    if (weekdayIndex === 0) {
                      cellClasses += "bg-rose-950/5 text-rose-450 hover:bg-rose-950/15";
                    } else if (weekdayIndex === 6) {
                      cellClasses += "bg-slate-950/25 text-slate-400 hover:bg-slate-950/40";
                    } else {
                      cellClasses += "bg-slate-900/90 text-slate-300 hover:bg-slate-800/85";
                    }
                  }

                  return (
                    <button
                      key={`day-slot-${index}`}
                      type="button"
                      onClick={() => handleSelectDay(slot)}
                      className={cellClasses}
                    >
                      {/* Day Number text */}
                      <span className={`text-[12px] sm:text-[13px] font-black font-mono leading-none ${
                        isSelected 
                          ? "text-brand-magenta" 
                          : hasReminders 
                            ? "text-emerald-400 font-extrabold" 
                            : isToday 
                              ? "text-brand-cyan" 
                              : weekdayIndex === 0 && slot.isCurrentMonth
                                ? "text-rose-400" 
                                : ""
                      }`}>
                        {slot.day}
                      </span>

                      {/* Small green badge or indicator */}
                      <div className="flex gap-1 items-center justify-center h-2">
                        {hasReminders && (
                          <span 
                            className={`w-2 h-2 rounded-full ring-2 ${
                              activeReminders.length > 0 
                                ? "bg-emerald-400 ring-emerald-500/30 animate-pulse" 
                                : "bg-slate-500 ring-slate-650/30"
                            }`} 
                            title={`${dayReminders.length} lembrete(s)`}
                          />
                        )}
                      </div>

                      {/* Hover tooltip */}
                      {hasReminders && (
                        <span className="opacity-0 group-hover:opacity-100 absolute -top-5 bg-slate-950 border border-slate-850 text-[7px] font-mono text-emerald-400 px-1 py-0.5 rounded transition-opacity pointer-events-none whitespace-nowrap z-40 shadow-lg">
                          🟢 {dayReminders.length} Lembrete{dayReminders.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Calendar indicators glossary footer */}
            <div className="mt-4 pt-3 border-t border-slate-850/60 grid grid-cols-3 gap-2 text-[8.5px] text-slate-400 select-none">
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="w-2.5 h-2.5 rounded bg-brand-cyan block shrink-0" />
                <span>Hoje (Dia Atual)</span>
              </span>
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500 block shrink-0" />
                <span>Lembretes Ativos</span>
              </span>
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="w-2.5 h-2.5 rounded bg-slate-600 block shrink-0" />
                <span>Lembretes Completos</span>
              </span>
            </div>
          </div>

          {/* COLUMN RIGHT: ACTION DETAILS LIST VIEWPORT */}
          <div className="lg:col-span-5 p-3 sm:p-4 bg-slate-950/40 flex flex-col justify-between max-h-none lg:max-h-[500px] overflow-y-auto custom-scrollbar">
            <div className="space-y-4">
              {/* Day header info */}
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-850 space-y-1">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider font-mono block">Data Selecionada</span>
                <h4 className="text-xs font-black text-slate-100 flex items-center gap-1.5 uppercase">
                  <Sparkles className="h-3.5 w-3.5 text-brand-magenta" />
                  <span>{formattedSelectedDayLabel}</span>
                </h4>
              </div>

              {/* Reminders core timeline list */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest font-mono block pl-1">
                  Lembretes Agendados para o Dia ({activeRemindersForSelectedDay.length})
                </span>

                {activeRemindersForSelectedDay.length === 0 ? (
                  <div className="p-10 text-center space-y-2 border border-dashed border-slate-850 rounded-2xl bg-slate-950/20">
                    <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-505">
                      <HelpCircle className="h-4 w-4" />
                    </div>
                    <p className="text-[10.5px] font-bold text-slate-400">Nenhum lembrete para esta data.</p>
                    <p className="text-[9.5px] text-slate-550 leading-relaxed md:max-w-[200px] mx-auto">Toque em qualquer dia marcado com um ponto rosa para exibir os alarmes guardados.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto lg:pr-1 custom-scrollbar">
                    {activeRemindersForSelectedDay.map((rem) => {
                      const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
                      const formattedTimeText = rem.isAllDay ? "O Dia Todo 🌅" : `Horário: ${rem.time} ⏰`;
                      const frequencyText = rem.type === "weekly" ? `Toda ${weekdays[rem.dayOfWeek]}` : "Aviso Único";

                      return (
                        <div
                          key={rem.id}
                          className={`p-3 rounded-xl border flex items-start justify-between gap-3 transition-all ${
                            rem.completed
                              ? "bg-slate-950/10 border-slate-900 text-slate-500 opacity-60"
                              : "bg-slate-950 border-slate-850 shadow-sm hover:border-slate-750"
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            {/* Checkbox */}
                            <button
                              type="button"
                              onClick={() => handleToggleChecked(rem.id)}
                              className={`mt-0.5 h-4.5 w-4.5 rounded border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                                rem.completed
                                  ? "bg-brand-magenta border-brand-magenta text-slate-950 font-black"
                                  : "bg-slate-900 border-slate-700 hover:border-slate-500 text-transparent"
                              }`}
                              title={rem.completed ? "Reajustar como pendente" : "Marcar como concluído"}
                            >
                              <Check className="h-3 w-3 text-slate-100" />
                            </button>

                            <div className="min-w-0 leading-tight space-y-1">
                              <p className={`text-xs font-bold text-slate-200 break-words ${rem.completed ? "line-through text-slate-500 font-medium" : ""}`}>
                                {rem.title}
                              </p>
                              
                              <div className="flex items-center gap-1.5 flex-wrap text-[8.5px] font-mono text-slate-450">
                                <span className="bg-slate-900 px-1 rounded-sm border border-slate-850">{formattedTimeText}</span>
                                <span>•</span>
                                <span className="text-slate-400 capitalize">{frequencyText}</span>
                              </div>
                            </div>
                          </div>

                          {/* Quick delete actions */}
                          <button
                            type="button"
                            onClick={() => handleDelete(rem.id)}
                            className="p-1 rounded bg-slate-900 text-slate-500 hover:text-red-400 hover:bg-red-950/20 border border-transparent hover:border-red-900/30 transition-all cursor-pointer shrink-0"
                            title="Apagar este lembrete definitivo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Hint message box */}
            <div className="mt-4 pt-4 border-t border-slate-850/60 bg-slate-950/20 p-2.5 rounded-xl border border-slate-900 text-[10px] text-slate-450 leading-normal flex items-start gap-2 select-none leading-relaxed">
              <AlertCircle className="h-4 w-4 text-brand-magenta shrink-0" />
              <span>Para cadastrar novos lembretes gerais, semanais ou metas automáticas, acesse a aba <strong>⚙️ Configurações de Empresa</strong> por meio de um login administrativo.</span>
            </div>
          </div>

        </div>

        {/* Modal Bottom Legend bar */}
        <div className="p-3 bg-slate-950 border-t border-slate-805 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 font-sans select-none">
          <div className="flex items-center gap-1.5 text-[9.5px] text-slate-500 justify-center text-center sm:text-left leading-tight">
            <Clock className="h-3.5 w-3.5 text-brand-cyan shrink-0 animate-spin-slow" />
            <span>Nucleo ERP Lembretes v2.5 • Sincronismo local instantâneo com monitor de alarmes das vendas em tempo real.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:border-slate-750 text-slate-200 text-xs font-bold transition-all cursor-pointer hover:text-white"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  );
}
