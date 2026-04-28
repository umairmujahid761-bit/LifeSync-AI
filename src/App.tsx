import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Droplets, 
  Moon, 
  Heart, 
  CheckSquare, 
  Baby, 
  Settings, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Send,
  Zap,
  Smile,
  Meh,
  Frown,
  Wind,
  Activity,
  Utensils,
  Flame,
  Clock,
  Apple
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { askAssistant } from './lib/gemini';

// --- Types ---
type View = 'dashboard' | 'assistant' | 'routine' | 'wellness' | 'pregnancy' | 'planner' | 'fitness' | 'nutrition';

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

interface Habit {
  id: string;
  text: string;
  completed: boolean;
}

interface Workout {
  id: string;
  type: string;
  duration: number;
  calories: number;
  timestamp: string;
}

interface Meal {
  id: string;
  name: string;
  calories: number;
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

// --- App Component ---
export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [waterAmount, setWaterAmount] = useState(0);
  const [sleepHours, setSleepHours] = useState(7);
  const [mood, setMood] = useState<string | null>(null);
  const [pregnancyWeek, setPregnancyWeek] = useState(1);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([
    { id: '1', text: 'Daily Meditation', completed: false },
    { id: '2', text: '15 Min Exercise', completed: false },
    { id: '3', text: 'Read 10 Pages', completed: false },
  ]);

  // Fitness State
  const [steps, setSteps] = useState(4200);
  const [activeMinutes, setActiveMinutes] = useState(15);
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  // Nutrition State
  const [meals, setMeals] = useState<Meal[]>([]);
  const [calorieGoal, setCalorieGoal] = useState(2000);

  // Load data from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('lifesync-data');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setWaterAmount(data.water || 0);
        setSleepHours(data.sleep || 7);
        setMood(data.mood || null);
        setPregnancyWeek(data.pregnancyWeek || 1);
        setTasks(data.tasks || []);
        if (data.habits) setHabits(data.habits);
        if (data.steps) setSteps(data.steps);
        if (data.activeMinutes) setActiveMinutes(data.activeMinutes);
        if (data.workouts) setWorkouts(data.workouts);
        if (data.meals) setMeals(data.meals);
        if (data.calorieGoal) setCalorieGoal(data.calorieGoal);
      } catch (e) {
        console.error("Failed to parse saved data", e);
      }
    }
  }, []);

  // Save data to localStorage
  useEffect(() => {
    const data = {
      water: waterAmount,
      sleep: sleepHours,
      mood: mood,
      pregnancyWeek: pregnancyWeek,
      tasks: tasks,
      habits: habits,
      steps: steps,
      activeMinutes: activeMinutes,
      workouts: workouts,
      meals: meals,
      calorieGoal: calorieGoal
    };
    localStorage.setItem('lifesync-data', JSON.stringify(data));
  }, [waterAmount, sleepHours, mood, pregnancyWeek, tasks, habits, steps, activeMinutes, workouts, meals, calorieGoal]);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard 
        water={waterAmount} 
        sleep={sleepHours} 
        mood={mood} 
        tasks={tasks} 
        habits={habits}
        pregnancyWeek={pregnancyWeek}
        onNavigate={setCurrentView} 
        steps={steps}
        activeMinutes={activeMinutes}
        meals={meals}
        calorieGoal={calorieGoal}
      />;
      case 'routine': return <RoutineSection 
        water={waterAmount} 
        setWater={setWaterAmount}
        sleep={sleepHours}
        setSleep={setSleepHours}
        habits={habits}
        setHabits={setHabits}
      />;
      case 'wellness': return <WellnessSection mood={mood} setMood={setMood} />;
      case 'pregnancy': return <PregnancyTracker week={pregnancyWeek} setWeek={setPregnancyWeek} />;
      case 'planner': return <DailyPlanner tasks={tasks} setTasks={setTasks} />;
      case 'fitness': return <FitnessSection 
        steps={steps} setSteps={setSteps} 
        activeMinutes={activeMinutes} setActiveMinutes={setActiveMinutes}
        workouts={workouts} setWorkouts={setWorkouts}
      />;
      case 'nutrition': return <NutritionSection 
        meals={meals} setMeals={setMeals}
        calorieGoal={calorieGoal} setCalorieGoal={setCalorieGoal}
      />;
      case 'assistant': return <AssistantSection 
        context={{
          waterAmount, sleepHours, mood, pregnancyWeek, steps, activeMinutes,
          consumedCalories: meals.reduce((acc, m) => acc + m.calories, 0),
          calorieGoal
        }} 
      />;
      default: return <Dashboard water={waterAmount} sleep={sleepHours} mood={mood} tasks={tasks} habits={habits} pregnancyWeek={pregnancyWeek} onNavigate={setCurrentView} steps={steps} activeMinutes={activeMinutes} meals={meals} calorieGoal={calorieGoal} />;
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-zinc-800 p-6 bg-zinc-950/50 backdrop-blur-md shrink-0">
         <div className="flex items-center gap-2 mb-10 px-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">LifeSync AI</h1>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          <NavItem active={currentView === 'dashboard'} icon={<LayoutDashboard size={18} />} label="Dashboard" onClick={() => setCurrentView('dashboard')} />
          <NavItem active={currentView === 'assistant'} icon={<MessageSquare size={18} />} label="AI Assistant" onClick={() => setCurrentView('assistant')} />
          <NavItem active={currentView === 'routine'} icon={<Droplets size={18} />} label="Daily Routine" onClick={() => setCurrentView('routine')} />
          <NavItem active={currentView === 'fitness'} icon={<Activity size={18} />} label="Fitness" onClick={() => setCurrentView('fitness')} />
          <NavItem active={currentView === 'nutrition'} icon={<Utensils size={18} />} label="Nutrition" onClick={() => setCurrentView('nutrition')} />
          <NavItem active={currentView === 'wellness'} icon={<Heart size={18} />} label="Wellness" onClick={() => setCurrentView('wellness')} />
          <NavItem active={currentView === 'planner'} icon={<CheckSquare size={18} />} label="Planner" onClick={() => setCurrentView('planner')} />
          <NavItem active={currentView === 'pregnancy'} icon={<Baby size={18} />} label="Pregnancy" onClick={() => setCurrentView('pregnancy')} />
        </nav>

        <div className="p-4 glass-card bg-zinc-900/30 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs uppercase">
            UM
          </div>
          <div className="truncate">
            <p className="text-xs font-semibold truncate leading-none mb-1">Umair M.</p>
            <p className="text-[10px] text-zinc-500 italic">Premium User</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-zinc-950 overflow-hidden relative">
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-950/50 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-4 text-xs text-zinc-400 italic font-medium tracking-wide">
             <span className="text-blue-400 font-semibold">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
             <span className="opacity-30">|</span>
             <span className="flex items-center gap-1"><Wind size={12} /> Calm Focus</span>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setCurrentView('planner')} className="px-3 py-1.5 glass-card text-[10px] font-bold uppercase tracking-wider hover:bg-zinc-800 transition-all">New Task</button>
             <button className="px-3 py-1.5 bg-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-blue-900/20 hover:bg-blue-500 transition-all text-white">Sync Data</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 scroll-hide">
          <div className="max-w-6xl mx-auto h-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentView}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="h-full"
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-500" />
            <h1 className="text-md font-bold tracking-tight">LifeSync AI</h1>
          </div>
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-[10px] font-bold">UM</div>
        </div>

        {/* Mobile Navigation */}
        <nav className="lg:hidden flex items-center justify-around p-3 bg-zinc-950 border-t border-zinc-800 sticky bottom-0 z-10 shrink-0">
          <MobileNavItem active={currentView === 'dashboard'} icon={<LayoutDashboard size={22} />} onClick={() => setCurrentView('dashboard')} />
          <MobileNavItem active={currentView === 'assistant'} icon={<MessageSquare size={22} />} onClick={() => setCurrentView('assistant')} />
          <MobileNavItem active={currentView === 'routine'} icon={<Droplets size={22} />} onClick={() => setCurrentView('routine')} />
          <MobileNavItem active={currentView === 'fitness'} icon={<Activity size={22} />} onClick={() => setCurrentView('fitness')} />
          <MobileNavItem active={currentView === 'nutrition'} icon={<Utensils size={22} />} onClick={() => setCurrentView('nutrition')} />
          <MobileNavItem active={currentView === 'planner'} icon={<CheckSquare size={22} />} onClick={() => setCurrentView('planner')} />
        </nav>
      </main>

      {/* Right AI Sidebar - Persistent on Desktop */}
      <aside className={`hidden ${currentView === 'assistant' ? 'xl:hidden' : 'xl:flex'} w-80 border-l border-zinc-800 bg-zinc-950/80 backdrop-blur-md flex-col shrink-0`}>
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse"></div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">AI Sync Assistant</h3>
          </div>
          <p className="text-[9px] text-zinc-500 uppercase font-black tracking-[0.2em]">Always Active</p>
        </div>
        <div className="flex-1 overflow-hidden h-full">
          <AIAssistantCompact 
            context={{
              waterAmount, sleepHours, mood, pregnancyWeek, steps, activeMinutes,
              consumedCalories: meals.reduce((acc, m) => acc + m.calories, 0),
              calorieGoal
            }} 
          />
        </div>
      </aside>
    </div>
  );
}

// --- Sub-components ---

function NavItem({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
        active ? 'bg-blue-600/10 text-blue-400 font-semibold shadow-sm' : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50'
      } text-sm`}
    >
      {icon}
      <span>{label}</span>
      {active && <motion.div layoutId="nav-glow" className="ml-auto w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
    </button>
  );
}

function MobileNavItem({ active, icon, onClick }: { active: boolean, icon: React.ReactNode, onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      className={`p-2 rounded-xl transition-all ${active ? 'text-blue-400 bg-blue-400/5' : 'text-zinc-500'}`}
    >
      {icon}
    </motion.button>
  );
}

// --- Variants ---
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

// --- Dashboard View ---
function Dashboard({ water, sleep, mood, tasks, habits, pregnancyWeek, onNavigate, steps, activeMinutes, meals, calorieGoal }: { 
  water: number, sleep: number, mood: string | null, tasks: Task[], habits: Habit[], pregnancyWeek: number, onNavigate: (v: any) => void,
  steps: number, activeMinutes: number, meals: Meal[], calorieGoal: number
}) {
  const completedTasks = tasks.filter(t => t.completed).length;
  const totalTasks = tasks.length;
  const consumedCalories = meals.reduce((acc, m) => acc + m.calories, 0);

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-6"
    >
      <motion.header variants={itemVariants} className="mb-2">
        <h2 className="text-2xl font-bold text-white tracking-tight">System Overview</h2>
        <p className="text-zinc-500 text-sm">Vital metrics and daily synchronization status.</p>
      </motion.header>

      <motion.div variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Quick Stats */}
        <motion.div variants={itemVariants}>
          <StatCard 
            icon={<Droplets size={18} className="text-blue-400" />} 
            label="Hydration" 
            value={`${(water / 1000).toFixed(1)}L`} 
            subValue={`${Math.round((water / 2000) * 100)}% of goal`}
            onClick={() => onNavigate('routine')}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            icon={<Activity size={18} className="text-emerald-400" />} 
            label="Daily Steps" 
            value={steps.toLocaleString()} 
            subValue={`${activeMinutes} active mins`}
            onClick={() => onNavigate('fitness')}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            icon={<Flame size={18} className="text-orange-400" />} 
            label="Nutrition" 
            value={`${consumedCalories} kcal`} 
            subValue={`${calorieGoal - consumedCalories} kcal left`}
            onClick={() => onNavigate('nutrition')}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            icon={<Heart size={18} className="text-rose-400" />} 
            label="Biometrics" 
            value={mood || 'Record Mood'} 
            subValue={mood ? 'Baseline verified' : 'Requires update'}
            onClick={() => onNavigate('wellness')}
          />
        </motion.div>
      </motion.div>

      <motion.div variants={containerVariants} className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Pregnancy Tracker Detail */}
        <motion.div variants={itemVariants} className="lg:col-span-8 glass-card p-6 relative overflow-hidden accent-glow">
          <div className="absolute -right-20 -top-20 w-48 h-48 bg-pink-500/5 blur-3xl rounded-full"></div>
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">Pregnancy Protocol</h3>
              <p className="text-2xl font-bold text-white">Week {pregnancyWeek} <span className="text-xs font-normal text-zinc-500 ml-2 uppercase tracking-widest">Trimester {pregnancyWeek < 13 ? 'I' : pregnancyWeek < 27 ? 'II' : 'III'}</span></p>
            </div>
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold rounded border border-emerald-500/20 uppercase tracking-tighter">Active Sync</span>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between text-[10px] mb-1 font-mono">
              <span className="text-zinc-500 uppercase">Development Progress</span>
              <span className="text-blue-400">{Math.round((pregnancyWeek / 40) * 100)}%</span>
            </div>
            <div className="w-full bg-zinc-800/50 h-1.5 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: `${(pregnancyWeek / 40) * 100}%` }}
                 className="bg-gradient-to-r from-pink-500 to-blue-500 h-full"
               />
            </div>
            <p className="text-xs text-zinc-400 italic font-medium leading-relaxed mt-2 opacity-80">
              Insight: Pregnancy week {pregnancyWeek}. {pregnancyWeek < 5 ? "Early cell division stage." : "Critical growth phase active."}
            </p>
          </div>
        </motion.div>

          {/* Habits Checklist */}
        <motion.div variants={itemVariants} className="lg:col-span-4 glass-card p-5">
           <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">Daily Habits</h3>
           <div className="space-y-3">
             {habits.slice(0, 3).map(habit => (
               <motion.div 
                 key={habit.id} 
                 initial={{ opacity: 0, x: -10 }}
                 animate={{ opacity: 1, x: 0 }}
                 className="flex items-center gap-3"
               >
                  <div className={`w-3.5 h-3.5 rounded border ${habit.completed ? 'bg-blue-500/20 border-blue-500/50 flex items-center justify-center' : 'border-zinc-700 bg-zinc-800/30'}`}>
                    {habit.completed && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-1.5 h-1.5 bg-blue-400 rounded-sm" />}
                  </div>
                  <span className={`text-xs ${habit.completed ? 'text-zinc-500 line-through opacity-50' : 'text-zinc-300'}`}>{habit.text}</span>
               </motion.div>
             ))}
           </div>
           <button onClick={() => onNavigate('routine')} className="mt-4 text-[9px] text-blue-400 font-bold uppercase tracking-widest hover:text-blue-300 transition-colors">View All Protocols</button>
        </motion.div>
      </motion.div>

      {/* Second Row Grid */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Planner Summary */}
        <motion.div variants={itemVariants} className="glass-card p-5 flex flex-col gap-4">
           <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Planner Engine</h3>
              <button onClick={() => onNavigate('planner')} className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">Open List</button>
           </div>
           <div className="flex-1 space-y-3">
              {tasks.length > 0 ? (
                tasks.slice(0, 3).map(task => (
                  <motion.div 
                    key={task.id} 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 group"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${task.completed ? 'bg-zinc-700' : 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.3)]'}`} />
                    <p className={`text-xs font-medium truncate ${task.completed ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{task.text}</p>
                  </motion.div>
                ))
              ) : (
                <p className="text-xs text-zinc-600 italic">No cycles pending for today.</p>
              )}
           </div>
        </motion.div>

        {/* Wellness Shortcut */}
        <motion.div variants={itemVariants} className="glass-card p-5 flex flex-col justify-between">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3">Wellness Module</h3>
          <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
             <p className="text-[9px] text-blue-300 font-bold uppercase mb-1 tracking-wider">Scheduled Meditation</p>
             <p className="text-xs text-zinc-400 leading-relaxed italic opacity-80">"Focus on your breath for 5 minutes. Awareness is the first step to balance."</p>
          </div>
          <button onClick={() => onNavigate('wellness')} className="mt-4 w-full py-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all">Launch Session</button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function StatCard({ icon, label, value, subValue, onClick }: { icon: React.ReactNode, label: string, value: string, subValue: string, onClick: () => void }) {
  return (
    <motion.button 
      onClick={onClick}
      whileHover={{ y: -4, backgroundColor: 'rgba(24, 24, 27, 0.6)', borderColor: 'rgba(59, 130, 246, 0.3)' }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="glass-card p-4 flex flex-col items-start gap-4 transition-all group text-left w-full accent-glow"
    >
      <div className="p-1.5 bg-zinc-800/50 rounded border border-zinc-700/50 group-hover:bg-zinc-800 group-hover:border-zinc-600 transition-colors">
        {icon}
      </div>
      <div>
        <p className="text-[9px] text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">{label}</p>
        <p className="text-xl font-bold text-white tracking-tight">{value}</p>
        <p className="text-[10px] text-zinc-500 mt-1 opacity-70">{subValue}</p>
      </div>
    </motion.button>
  );
}

// --- AI Assistant Compact (Persistent Panel) ---
function AIAssistantCompact({ context }: { context: any }) {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: 'Good morning! System status is optimal. How can I assist with your routine today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    const history = [...messages];
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);
    const response = await askAssistant(userMsg, context, history);
    setMessages(prev => [...prev, { role: 'ai', text: response }]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-hide">
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div 
              key={idx} 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[90%] p-2.5 rounded-2xl text-[10px] leading-relaxed ${
                msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'glass-card bg-zinc-900/80 text-zinc-200 rounded-tl-none border-zinc-800/50'
              }`}>
                {msg.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="glass-card bg-zinc-900/80 p-3 rounded-2xl rounded-tl-none border-zinc-800/50">
              <div className="flex flex-col gap-2">
                <p className="text-[8px] text-blue-400 font-black uppercase tracking-[0.2em] opacity-80">AI is thinking...</p>
                <div className="flex gap-1">
                  <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-duration:0.6s]"></div>
                  <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.15s]"></div>
                  <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.3s]"></div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="p-4 bg-zinc-950 border-t border-zinc-900 mt-auto">
        <div className="relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask LifeSync AI..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-4 pr-10 py-3 text-[11px] text-zinc-100 focus:border-blue-500/50 outline-none transition-all placeholder:text-zinc-600"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-2 p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition-colors border border-zinc-700 shadow-sm"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Assistant Section (Full View) ---
function AssistantSection({ context }: { context: any }) {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: 'Welcome to your LifeSync Assistant. I have context on your current health trends, pregnancy progress, and daily goals. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    const history = [...messages];
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);
    const response = await askAssistant(userMsg, context, history);
    setMessages(prev => [...prev, { role: 'ai', text: response }]);
    setIsLoading(false);
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col h-[calc(100vh-180px)] lg:h-[calc(100vh-140px)] gap-4"
    >
      <motion.header variants={itemVariants}>
        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">Intelligence Layer</h3>
        <h2 className="text-2xl font-bold text-white tracking-tight">AI Companion</h2>
      </motion.header>

      <motion.div variants={itemVariants} className="flex-1 glass-card bg-zinc-900/20 flex flex-col overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-zinc-950/50 to-transparent pointer-events-none z-10" />
        
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-hide">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div 
                key={idx} 
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-4 max-w-[85%] lg:max-w-[70%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-bold ${
                    msg.role === 'user' ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                  }`}>
                    {msg.role === 'user' ? 'UM' : <Zap size={14} />}
                  </div>
                  <div className={`p-4 rounded-2xl text-[13px] leading-relaxed relative ${
                    msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-zinc-800/80 text-zinc-100 rounded-tl-none border border-zinc-700/30'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
               <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center animate-pulse">
                    <Zap size={14} className="text-white" />
                  </div>
                  <div className="bg-zinc-800/80 p-4 rounded-2xl rounded-tl-none border border-zinc-700/30">
                    <div className="flex flex-col gap-2.5">
                      <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em]">AI is thinking...</p>
                      <div className="flex gap-1.5 pt-1">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-duration:0.6s]"></div>
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.15s]"></div>
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.3s]"></div>
                      </div>
                    </div>
                  </div>
               </div>
            </motion.div>
          )}
        </div>

        <div className="p-6 border-t border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
          <div className="flex gap-3 relative">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type your message..."
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 text-sm text-zinc-100 focus:border-blue-500/50 outline-none transition-all placeholder:text-zinc-600 pr-14"
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-2 bottom-2 aspect-square bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg transition-all shadow-lg shadow-blue-900/20 active:scale-95 flex items-center justify-center"
            >
              <Send size={18} />
            </button>
          </div>
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scroll-hide">
            {["How's my hydration?", "Pregnancy tips for this week", "Workout suggestion", "Nutritional advice"].map(suggestion => (
              <button 
                key={suggestion}
                onClick={() => { setInput(suggestion); }}
                className="whitespace-nowrap px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-full text-[10px] text-zinc-500 hover:text-zinc-300 transition-all font-medium uppercase tracking-wider"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- Routine Section ---
function RoutineSection({ water, setWater, sleep, setSleep, habits, setHabits }: { 
  water: number, setWater: any, sleep: number, setSleep: any, habits: Habit[], setHabits: any 
}) {
  const toggleHabit = (id: string) => {
    setHabits(habits.map((h: Habit) => h.id === id ? { ...h, completed: !h.completed } : h));
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-6 max-w-4xl"
    >
      <motion.header variants={itemVariants}>
        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">Health Maintenance</h3>
        <h2 className="text-2xl font-bold text-white tracking-tight">Daily Protocols</h2>
      </motion.header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Water Tracker */}
        <motion.div variants={itemVariants} className="glass-card p-6 bg-zinc-900/40">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-sm font-bold text-zinc-300">Fluid Intake</h3>
             <span className="text-xs font-mono text-blue-400">{(water / 1000).toFixed(2)}L / 2.0L</span>
          </div>
          <div className="relative h-48 bg-zinc-950 rounded-xl overflow-hidden mb-6 border border-zinc-800/50">
            <motion.div 
              className="absolute bottom-0 left-0 right-0 bg-blue-600/20 border-t border-blue-500/50"
              initial={{ height: 0 }}
              animate={{ height: `${Math.min((water / 2000) * 100, 100)}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
              <Droplets size={40} className="text-blue-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setWater(Math.max(0, water - 250))}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-bold uppercase rounded-lg border border-zinc-700 transition-colors"
            >
              Decrease
            </button>
            <button 
              onClick={() => setWater(water + 250)}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase rounded-lg shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={14} /> Add 250ml
            </button>
          </div>
        </motion.div>

        {/* Sleep Tracker */}
        <motion.div variants={itemVariants} className="glass-card p-6 bg-zinc-900/40 flex flex-col">
           <h3 className="text-sm font-bold text-zinc-300 mb-1">Circadian Rhythm</h3>
           <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-6">Cycle Performance</p>

           <div className="flex-1 flex flex-col justify-center items-center gap-6">
              <div className="text-5xl font-black text-white tracking-tighter">
                {sleep}<span className="text-xl font-medium text-zinc-600 ml-1">hrs</span>
              </div>
              
              <div className="w-full space-y-4 px-4">
                  <input 
                      type="range" min="0" max="12" step="0.5" value={sleep}
                      onChange={(e) => setSleep(parseFloat(e.target.value))}
                      className="w-full accent-blue-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
                      <span>0h</span>
                      <span className="text-blue-500/50">8h Goal</span>
                      <span>12h</span>
                  </div>
              </div>
           </div>
        </motion.div>
      </div>

      <motion.div variants={itemVariants} className="glass-card p-6 border-zinc-800/50">
        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">Habit Consistency ENGINE</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {habits.map((habit: Habit) => (
            <motion.div 
              key={habit.id}
              layout
              onClick={() => toggleHabit(habit.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer border transition-all ${
                habit.completed ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-100/70' : 'bg-zinc-900/30 border-zinc-800 text-zinc-400 hover:bg-zinc-800/50'
              }`}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                habit.completed ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-700 bg-zinc-950'
              }`}>
                {habit.completed && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><CheckSquare size={12} className="text-zinc-950" /></motion.div>}
              </div>
              <span className={`text-[11px] font-medium ${habit.completed ? 'line-through opacity-50' : ''}`}>{habit.text}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- Mental Wellness View ---
function WellnessSection({ mood, setMood }: { mood: string | null, setMood: any }) {
  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-6 max-w-4xl"
    >
      <motion.header variants={itemVariants}>
        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">Psychological Status</h3>
        <h2 className="text-2xl font-bold text-white tracking-tight">Mental Wellness</h2>
      </motion.header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div variants={itemVariants} className="md:col-span-2 glass-card p-6">
          <h3 className="text-sm font-bold text-zinc-300 mb-6">Current Sentiment Baseline</h3>
          <div className="flex gap-4">
            {[{ emoji: <Smile size={24} />, label: 'Great', c: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { emoji: <Meh size={24} />, label: 'Okay', c: 'text-amber-400', bg: 'bg-amber-500/10' },
              { emoji: <Frown size={24} />, label: 'Low', c: 'text-rose-400', bg: 'bg-rose-500/10' }].map((m) => (
              <motion.button
                key={m.label}
                onClick={() => setMood(m.label)}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.95 }}
                className={`flex-1 flex flex-col items-center gap-3 p-5 rounded-2xl transition-all border ${
                  mood === m.label ? `bg-zinc-800 border-blue-500 ${m.c} accent-glow` : 'bg-zinc-900/30 border-zinc-800 text-zinc-500 hover:bg-zinc-800/40'
                }`}
              >
                <div className={mood === m.label ? m.c : 'text-zinc-600'}>{m.emoji}</div>
                <span className="text-[10px] font-black uppercase tracking-widest">{m.label}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card p-6 flex flex-col justify-between">
           <div>
              <h3 className="text-xs font-bold text-zinc-300 mb-2 uppercase tracking-wide">Focus Protocol</h3>
              <p className="text-[11px] text-zinc-500 leading-relaxed italic opacity-80">
                Integration of mindfulness improves cognitive resilience. Spend 5 minutes offline.
              </p>
           </div>
           <button className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg text-[10px] font-bold uppercase tracking-[0.15em] transition-all shadow-xl shadow-blue-900/10 active:scale-95">
              Start Cycle
           </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

// --- Pregnancy View ---
function PregnancyTracker({ week, setWeek }: { week: number, setWeek: any }) {
  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-6 max-w-4xl"
    >
      <motion.header variants={itemVariants}>
        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">Gestation Metrics</h3>
        <h2 className="text-2xl font-bold text-white tracking-tight">Pregnancy Journey</h2>
      </motion.header>

      <motion.div variants={itemVariants} className="glass-card p-8 flex flex-col lg:flex-row items-center gap-10 bg-zinc-900/30 relative overflow-hidden">
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-blue-600/5 blur-[100px] rounded-full pointer-events-none" />
        
        <motion.div 
          className="relative shrink-0"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
        >
          <svg className="w-44 h-44 transform -rotate-90">
            <circle cx="88" cy="88" r="80" fill="transparent" stroke="#18181b" strokeWidth="6" />
            <motion.circle 
              cx="88" cy="88" r="80" fill="transparent" stroke="#3b82f6" strokeWidth="6" strokeDasharray={2 * Math.PI * 80}
              initial={{ strokeDashoffset: 2 * Math.PI * 80 }}
              animate={{ strokeDashoffset: (2 * Math.PI * 80) * (1 - week / 40) }}
              transition={{ duration: 1 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-black text-white tracking-tighter">{week}</span>
            <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">Wks</span>
          </div>
        </motion.div>

        <div className="flex-1 space-y-6 w-full">
           <div className="flex justify-between items-center bg-zinc-950/50 p-4 rounded-xl border border-zinc-800">
              <button onClick={() => setWeek(Math.max(1, week - 1))} className="p-1.5 hover:bg-zinc-800 rounded transition-colors text-zinc-400 group"><ChevronRight className="rotate-180 group-active:scale-90" /></button>
              <div className="text-center">
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Current Stage</p>
                <p className="text-sm font-bold text-zinc-100">Week {week} Progress</p>
              </div>
              <button onClick={() => setWeek(Math.min(40, week + 1))} className="p-1.5 hover:bg-zinc-800 rounded transition-colors text-zinc-400 group"><ChevronRight className="group-active:scale-90" /></button>
           </div>

           <div className="p-5 glass-card bg-zinc-900/80 border-zinc-700/30">
              <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-3">System Update</h4>
              <p className="text-[11px] text-zinc-300 leading-relaxed font-medium">
                {week < 13 ? "First Trimester protocol active. Optimization focused on fundamental organ structures." : 
                 week < 27 ? "Second Trimester transition. Fetal movement and sensory development are accelerating." : 
                 "Third Trimester finalization. Lung maturation and weight gain focus."}
              </p>
           </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- Daily Planner View ---
function DailyPlanner({ tasks, setTasks }: { tasks: Task[], setTasks: any }) {
  const [newTask, setNewTask] = useState('');

  const addTask = () => {
    if (!newTask.trim()) return;
    const task: Task = { id: Date.now().toString(), text: newTask.trim(), completed: false };
    setTasks([...tasks, task]);
    setNewTask('');
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map((t: Task) => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter((t: Task) => t.id !== id));
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-6 max-w-2xl h-full"
    >
      <motion.header variants={itemVariants}>
        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">Execution Pipeline</h3>
        <h2 className="text-2xl font-bold text-white tracking-tight">Daily Planner</h2>
      </motion.header>

      <motion.div variants={itemVariants} className="relative">
        <input 
          type="text" value={newTask} onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
          placeholder="New deployment goal..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-4 pr-12 py-3.5 text-xs text-white placeholder:text-zinc-600 focus:border-blue-500/50 transition-all outline-none"
        />
        <button onClick={addTask} className="absolute right-2 top-2 p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-lg shadow-blue-900/20 active:scale-95">
          <Plus size={18} />
        </button>
      </motion.div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-2 scroll-hide">
        <AnimatePresence initial={false} mode="popLayout">
          {tasks.length === 0 ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-24 text-zinc-600"
            >
              <CheckSquare size={32} className="opacity-10 mb-4" />
              <p className="text-[11px] uppercase tracking-widest font-bold">Queue Empty</p>
            </motion.div>
          ) : (
            tasks.map((task: Task) => (
              <motion.div
                key={task.id} 
                layout
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, x: -20 }}
                className={`group flex items-center gap-4 p-3 rounded-xl border transition-all ${
                  task.completed ? 'bg-zinc-950/50 border-zinc-900 text-zinc-600' : 'glass-card bg-zinc-900/50 border-zinc-800 text-zinc-100'
                }`}
              >
                <button onClick={() => toggleTask(task.id)} className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${task.completed ? 'bg-zinc-700 border-zinc-700' : 'border-zinc-700 bg-zinc-950'}`}>
                  {task.completed && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><CheckSquare size={12} className="text-zinc-950" /></motion.div>}
                </button>
                <span className={`flex-1 text-xs font-medium tracking-tight ${task.completed ? 'line-through opacity-50' : ''}`}>{task.text}</span>
                <button onClick={() => deleteTask(task.id)} className="p-1 px-2 text-zinc-700 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// --- Fitness View ---
function FitnessSection({ steps, setSteps, activeMinutes, setActiveMinutes, workouts, setWorkouts }: {
  steps: number, setSteps: any, activeMinutes: number, setActiveMinutes: any, workouts: Workout[], setWorkouts: any
}) {
  const [isLogging, setIsLogging] = useState(false);
  const [workoutType, setWorkoutType] = useState('Running');
  const [duration, setDuration] = useState('30');

  const logWorkout = () => {
    const newWorkout: Workout = {
      id: Date.now().toString(),
      type: workoutType,
      duration: parseInt(duration),
      calories: parseInt(duration) * 10,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setWorkouts([newWorkout, ...workouts]);
    setActiveMinutes(activeMinutes + parseInt(duration));
    setIsLogging(false);
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-6 max-w-4xl"
    >
      <motion.header variants={itemVariants}>
        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">Kinetic Sync</h3>
        <h2 className="text-2xl font-bold text-white tracking-tight">Fitness Engine</h2>
      </motion.header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div variants={itemVariants} className="glass-card p-6 bg-zinc-900/40 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-emerald-500/5 blur-2xl rounded-full"></div>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Pedometer</h3>
            <Activity className="text-emerald-500 opacity-50" size={16} />
          </div>
          <div className="flex flex-col items-center py-6">
            <div className="text-5xl font-black text-white tracking-tighter mb-2">{steps.toLocaleString()}</div>
            <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Steps Transduced</p>
          </div>
          <div className="w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden mt-4">
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${Math.min((steps / 10000) * 100, 100)}%` }}
               className="bg-emerald-500 h-full shadow-[0_0_8px_rgba(16,185,129,0.4)]"
             />
          </div>
          <div className="flex justify-between text-[9px] mt-2 font-mono text-zinc-600">
            <span>0</span>
            <span>10,000 GOAL</span>
          </div>
          <div className="mt-6 flex gap-2">
            <button onClick={() => setSteps(steps + 500)} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[10px] font-bold uppercase transition-all border border-zinc-700">+500</button>
            <button onClick={() => setSteps(steps + 1000)} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[10px] font-bold uppercase transition-all border border-zinc-700">+1k</button>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card p-6 bg-zinc-900/40 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Active Intensity</h3>
            <Clock className="text-blue-500 opacity-50" size={16} />
          </div>
          <div className="flex-1 space-y-6">
             <div className="flex items-end gap-3">
                <span className="text-4xl font-black text-white">{activeMinutes}</span>
                <span className="text-xs text-zinc-500 font-bold uppercase mb-1.5">Mins today</span>
             </div>
             <div className="space-y-3">
               <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Recent Logs</h4>
                  {!isLogging && <button onClick={() => setIsLogging(true)} className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">+ Log</button>}
               </div>
               {isLogging ? (
                 <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <select value={workoutType} onChange={(e) => setWorkoutType(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 outline-none">
                        <option>Running</option><option>Cycling</option><option>Yoga</option><option>Strength</option>
                      </select>
                      <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 outline-none" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setIsLogging(false)} className="flex-1 py-1 bg-zinc-800 rounded text-[9px] font-bold uppercase">Discard</button>
                      <button onClick={logWorkout} className="flex-1 py-1 bg-blue-600 rounded text-[9px] font-bold uppercase text-white">Save</button>
                    </div>
                 </motion.div>
               ) : (
                 <div className="space-y-2 max-h-40 overflow-y-auto scroll-hide">
                    <AnimatePresence initial={false}>
                      {workouts.length > 0 ? workouts.map(w => (
                        <motion.div 
                          key={w.id} 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center justify-between p-2 rounded bg-zinc-950/50 border border-zinc-900"
                        >
                          <span className="text-[11px] font-medium text-zinc-300">{w.type}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">{w.duration}m · {w.calories}cal</span>
                        </motion.div>
                      )) : <p className="text-[10px] text-zinc-600 italic py-4 text-center">No data found.</p>}
                    </AnimatePresence>
                 </div>
               )}
             </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// --- Nutrition View ---
function NutritionSection({ meals, setMeals, calorieGoal, setCalorieGoal }: {
  meals: Meal[], setMeals: any, calorieGoal: number, setCalorieGoal: any
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [mealName, setMealName] = useState('');
  const [mealCals, setMealCals] = useState('300');
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('snack');
  const totalCalories = meals.reduce((acc, m) => acc + m.calories, 0);

  const addMeal = () => {
    if (!mealName.trim()) return;
    setMeals([...meals, { id: Date.now().toString(), name: mealName.trim(), calories: parseInt(mealCals), type: mealType }]);
    setMealName(''); setIsAdding(false);
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-6 max-w-4xl"
    >
      <motion.header variants={itemVariants}><h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">Fuel Optimization</h3><h2 className="text-2xl font-bold text-white tracking-tight">Nutrition Planner</h2></motion.header>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <motion.div variants={itemVariants} className="lg:col-span-4 glass-card p-6 bg-zinc-900/40 flex flex-col items-center">
           <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-8 w-full">Calorie Matrix</h3>
           <div className="relative w-36 h-36 mb-6">
              <svg className="w-full h-full transform -rotate-90">
                 <circle cx="72" cy="72" r="64" fill="transparent" stroke="#18181b" strokeWidth="6" />
                 <motion.circle 
                    cx="72" cy="72" r="64" fill="transparent" stroke="#f97316" strokeWidth="6" strokeDasharray={2 * Math.PI * 64}
                    initial={{ strokeDashoffset: 2 * Math.PI * 64 }}
                    animate={{ strokeDashoffset: (2 * Math.PI * 64) * (1 - Math.min(totalCalories / calorieGoal, 1)) }}
                    transition={{ duration: 1 }}
                 />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-black text-white">{totalCalories}</span><span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">In</span></div>
           </div>
           <div className="w-full space-y-2 text-[10px] font-mono">
              <div className="flex justify-between"><span className="text-zinc-500">GOAL</span><span className="text-orange-400">{calorieGoal}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">LEFT</span><span className="text-zinc-300">{Math.max(0, calorieGoal - totalCalories)}</span></div>
           </div>
        </motion.div>
        <motion.div variants={itemVariants} className="lg:col-span-8 glass-card p-6 bg-zinc-900/40">
           <div className="flex justify-between items-center mb-6"><h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Logs</h3>{!isAdding && <button onClick={() => setIsAdding(true)} className="px-3 py-1 bg-orange-600/20 text-orange-400 text-[9px] font-bold uppercase rounded border border-orange-500/30">+ Add Row</button>}</div>
           {isAdding && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-4">
                 <div className="grid grid-cols-2 gap-3">
                    <input type="text" value={mealName} onChange={(e) => setMealName(e.target.value)} placeholder="Entry Label" className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs text-white outline-none" />
                    <input type="number" value={mealCals} onChange={(e) => setMealCals(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs text-white outline-none" />
                 </div>
                 <div className="flex justify-between"><select value={mealType} onChange={(e) => setMealType(e.target.value as any)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-400"><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option></select><div className="flex gap-2"><button onClick={() => setIsAdding(false)} className="px-3 py-1 bg-zinc-800 rounded text-[10px] font-bold uppercase">Discard</button><button onClick={addMeal} className="px-3 py-1 bg-orange-600 text-white rounded text-[10px] font-bold uppercase">Append</button></div></div>
              </motion.div>
           )}
           <div className="space-y-2 overflow-y-auto pr-2 scroll-hide max-h-[250px]">
              <AnimatePresence initial={false}>
                {meals.length > 0 ? meals.map(m => (
                  <motion.div 
                    key={m.id} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/50 border border-zinc-900 group"
                  >
                    <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-orange-500/60" /><div><p className="text-xs font-bold text-zinc-200">{m.name}</p><p className="text-[9px] text-zinc-500 uppercase font-black">{m.type}</p></div></div>
                    <div className="flex items-center gap-4"><span className="text-[11px] font-mono text-zinc-400">{m.calories} cal</span><button onClick={() => setMeals(meals.filter(meal => meal.id !== m.id))} className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-700 hover:text-rose-500 transition-all"><Trash2 size={12} /></button></div>
                  </motion.div>
                )) : <div className="py-16 text-center opacity-20"><Utensils size={24} className="mx-auto mb-2" /><p className="text-[10px] uppercase font-black">No Data</p></div>}
              </AnimatePresence>
           </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

