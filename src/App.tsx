import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ThemeProvider, useTheme } from './components/ThemeProvider.tsx';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Droplets, 
  Moon, 
  Sun,
  Monitor,
  Heart, 
  Check,
  CheckSquare, 
  Baby, 
  Settings, 
  Bell,
  BellOff,
  ShieldCheck,
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
  Brain,
  Waves,
  Utensils,
  Flame,
  Clock,
  Apple,
  LogIn,
  Mic,
  MicOff,
  LogOut,
  Trophy,
  Award,
  Star,
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { askAssistant, askAssistantStream } from './lib/gemini';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePedometer } from './hooks/usePedometer';
import { useNotifications } from './hooks/useNotifications';
import { useVoiceInput } from './hooks/useVoiceInput';
import { generateSmartNotification } from './services/smartNotificationService';
import { runAgenticWorkflow, executeAgentAction, AgentAction, AgentAnalysis } from './services/agentWorkflowService';
import { generateWeeklyReport, WeeklyReport } from './services/reportService';
import { auth, googleProvider, db, handleFirestoreError, OperationType } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, collection, addDoc, deleteDoc, query, orderBy, limit } from 'firebase/firestore';

// --- Types ---
type View = 'dashboard' | 'assistant' | 'routine' | 'wellness' | 'pregnancy' | 'planner' | 'fitness' | 'nutrition' | 'settings' | 'rewards' | 'advisor' | 'reports';

interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string; // Lucide icon name
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  unlockedAt?: string;
  requirement: string;
}

interface UserStats {
  xp: number;
  level: number;
  streak: number;
  lastActivityDate: string | null;
  unlockedThemes: string[];
  unlockedTitles: string[];
}

interface SyncAlert {
  id: string;
  type: 'hydration' | 'workout' | 'system';
  message: string;
  severity: 'low' | 'high';
  timestamp: string;
}

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

interface DailyLog {
  date: string;
  waterAmount: number;
  sleepHours: number;
  mood: string | null;
  steps: number;
  activeMinutes: number;
  completedHabitsCount: number;
  totalHabitsCount: number;
  completedTasksCount: number;
  totalTasksCount: number;
  consumedCalories: number;
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
  return (
    <ThemeProvider defaultTheme="system" storageKey="life-sync-theme">
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  
  // App State
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

  const { isActive: isStepCounterActive, startTracking: startStepCounter, stopTracking: stopStepCounter } = usePedometer(
    useCallback(() => {
      setSteps(prev => prev + 1);
    }, [])
  );

  // Nutrition State
  const [meals, setMeals] = useState<Meal[]>([]);
  const [calorieGoal, setCalorieGoal] = useState(2000);

  // Derived State (Memoized for performance)
  const consumedCalories = useMemo(() => meals.reduce((acc, m) => acc + m.calories, 0), [meals]);
  const completedTasksCount = useMemo(() => tasks.filter(t => t.completed).length, [tasks]);
  const totalTasksCount = useMemo(() => tasks.length, [tasks]);

  // Notification State
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const { permission, requestPermission, sendNotification } = useNotifications();

  // Sleep Tracking State
  const [isTrackingSleep, setIsTrackingSleep] = useState(false);
  const [sleepStartTime, setSleepStartTime] = useState<number | null>(null);
  const [elapsedSleep, setElapsedSleep] = useState(0);

  // Alerts State
  const [alerts, setAlerts] = useState<SyncAlert[]>([]);

  // Gamification State
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [unlockedThemes, setUnlockedThemes] = useState<string[]>(['default']);
  const [unlockedTitles, setUnlockedTitles] = useState<string[]>(['Novice Sync']);
  const [unlockedUpgrades, setUnlockedUpgrades] = useState<string[]>([]);

  // Historical Logs State
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);

  // Refs for debouncing metrics sync
  const metricsSyncTimeout = useRef<NodeJS.Timeout | null>(null);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  // Firestore Sync
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    const tasksRef = collection(db, 'users', user.uid, 'tasks');
    const habitsRef = collection(db, 'users', user.uid, 'habits');
    const workoutsRef = collection(db, 'users', user.uid, 'workouts');
    const mealsRef = collection(db, 'users', user.uid, 'meals');
    const logsRef = collection(db, 'users', user.uid, 'dailyLogs');

    // Sync Metrics
    const unsubMetrics = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setWaterAmount(data.waterAmount ?? 0);
        setSleepHours(data.sleepHours ?? 7);
        setMood(data.mood ?? null);
        setPregnancyWeek(data.pregnancyWeek ?? 1);
        setSteps(data.steps ?? 0);
        setActiveMinutes(data.activeMinutes ?? 0);
        setCalorieGoal(data.calorieGoal ?? 2000);
        setNotificationsEnabled(data.notificationsEnabled ?? false);
        setIsTrackingSleep(data.isTrackingSleep ?? false);
        setSleepStartTime(data.sleepStartTime ?? null);
        setXp(data.xp ?? 0);
        setLevel(data.level ?? 1);
        setStreak(data.streak ?? 0);
        setUnlockedThemes(data.unlockedThemes ?? ['default']);
        setUnlockedTitles(data.unlockedTitles ?? ['Novice Sync']);
        setUnlockedUpgrades(data.unlockedUpgrades ?? []);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}`));

    // Sync Badges
    const badgesRef = collection(db, 'users', user.uid, 'badges');
    const unsubBadges = onSnapshot(badgesRef, (snap) => {
      setBadges(snap.docs.map(d => ({ id: d.id, ...d.data() } as Badge)));
    });

    // Sync Daily Logs (Historical Memory)
    const unsubLogs = onSnapshot(query(logsRef, orderBy('date', 'desc'), limit(7)), (snap) => {
      setDailyLogs(snap.docs.map(d => d.data() as DailyLog));
    });

    // Sync Tasks
    const unsubTasks = onSnapshot(query(tasksRef, orderBy('createdAt', 'desc')), (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
    });

    // Sync Habits
    const unsubHabits = onSnapshot(habitsRef, (snap) => {
      if (snap.docs.length > 0) {
        setHabits(snap.docs.map(d => ({ id: d.id, ...d.data() } as Habit)));
      }
    });

    // Sync Workouts
    const unsubWorkouts = onSnapshot(query(workoutsRef, orderBy('timestamp', 'desc')), (snap) => {
      setWorkouts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Workout)));
    });

    // Sync Meals
    const unsubMeals = onSnapshot(mealsRef, (snap) => {
      setMeals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Meal)));
    });

    return () => {
      unsubMetrics();
      unsubBadges();
      unsubLogs();
      unsubTasks();
      unsubHabits();
      unsubWorkouts();
      unsubMeals();
    };
  }, [user]);

  // Sync Metrics to Firestore (Debounced)
  useEffect(() => {
    if (!user) return;
    
    if (metricsSyncTimeout.current) clearTimeout(metricsSyncTimeout.current);
    
    metricsSyncTimeout.current = setTimeout(async () => {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const today = new Date().toISOString().split('T')[0];
        const logDocRef = doc(db, 'users', user.uid, 'dailyLogs', today);

        const metricsData = {
          waterAmount,
          sleepHours,
          mood,
          pregnancyWeek,
          steps,
          activeMinutes,
          calorieGoal,
          notificationsEnabled,
          isTrackingSleep,
          sleepStartTime,
          xp,
          level,
          streak,
          unlockedThemes,
          unlockedTitles,
          unlockedUpgrades
        };

        // Update User Doc
        await setDoc(userDocRef, metricsData, { merge: true });

        // Update Daily Log
        const logData: DailyLog = {
          date: today,
          waterAmount,
          sleepHours,
          mood,
          steps,
          activeMinutes,
          completedHabitsCount: habits.filter(h => h.completed).length,
          totalHabitsCount: habits.length,
          completedTasksCount: tasks.filter(t => t.completed).length,
          totalTasksCount: tasks.length,
          consumedCalories
        };
        await setDoc(logDocRef, logData, { merge: true });

      } catch (err) {
        // Silent fail for background sync
      }
    }, 2000);

    return () => {
      if (metricsSyncTimeout.current) clearTimeout(metricsSyncTimeout.current);
    };
  }, [user, waterAmount, sleepHours, mood, pregnancyWeek, steps, activeMinutes, calorieGoal, notificationsEnabled, isTrackingSleep, sleepStartTime, habits, tasks, consumedCalories]);

  const handleXpGain = useCallback((amount: number, reason: string) => {
    setXp(prev => {
      const newXp = prev + amount;
      const nextLevelThreshold = level * 1000;
      if (newXp >= nextLevelThreshold) {
        setLevel(l => l + 1);
        sendNotification('Level Up!', { body: `You've reached level ${level + 1}! Neural processing capabilities increased.` });
        return newXp - nextLevelThreshold;
      }
      return newXp;
    });
  }, [level, sendNotification]);

  const awardBadge = useCallback(async (badge: Omit<Badge, 'unlockedAt'>) => {
    if (!user) return;
    const badgeId = badge.id;
    if (badges.some(b => b.id === badgeId)) return;

    try {
      const badgeData: Badge = { ...badge, unlockedAt: new Date().toISOString() };
      await setDoc(doc(db, 'users', user.uid, 'badges', badgeId), badgeData);
      sendNotification('Achievement Unlocked!', { body: `${badge.title}: ${badge.description}` });
      handleXpGain(500, 'Badge Unlocked');
    } catch (err) {
      console.error("Failed to award badge", err);
    }
  }, [user, badges, sendNotification, handleXpGain]);

  // Achievement Checkers
  useEffect(() => {
    if (!user) return;
    
    // Water Milestone
    if (waterAmount >= 2000) {
      awardBadge({
        id: 'hydro_master',
        title: 'Hydro Architect',
        description: 'Sync 2000ml of hydration in a single cycle.',
        icon: 'Droplets',
        rarity: 'common',
        requirement: '2000ml water'
      });
    }

    // Steps Milestone
    if (steps >= 10000) {
      awardBadge({
        id: 'kinetic_king',
        title: 'Kinetic Overlord',
        description: 'Exceed 10,000 steps of mechanical propulsion.',
        icon: 'Zap',
        rarity: 'rare',
        requirement: '10,000 steps'
      });
    }

    // Pregnancy Milestone (specific context)
    if (pregnancyWeek >= 20) {
       awardBadge({
        id: 'halfway_vessel',
        title: 'Biological Core: 50%',
        description: 'Reach the 20-week milestone in biological synthesis.',
        icon: 'Baby',
        rarity: 'epic',
        requirement: '20 weeks pregnancy'
      });
    }
  }, [user, waterAmount, steps, pregnancyWeek, awardBadge]);

  // Streak logic
  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const lastDate = dailyLogs[0]?.date;
    
    if (lastDate && lastDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      if (lastDate === yesterdayStr) {
        // Continue streak - this should probably be handled more robustly in a real app
        // but for now we'll just show the concept
      } else {
        // Reset streak? usually handled by a cloud function or first login of day
      }
    }
  }, [user, dailyLogs]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed", err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentView('dashboard');
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  // Helper functions for collection writes
  const addTaskAsync = useCallback(async (text: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'tasks'), {
        text,
        completed: false,
        createdAt: new Date().toISOString()
      });
      handleXpGain(10, 'Task Created');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/tasks`);
    }
  }, [user, handleXpGain]);

  const toggleTaskAsync = useCallback(async (id: string, completed: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'tasks', id), { completed: !completed });
      if (!completed) handleXpGain(50, 'Task Completed');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/tasks/${id}`);
    }
  }, [user, handleXpGain]);

  const deleteTaskAsync = useCallback(async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'tasks', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/tasks/${id}`);
    }
  }, [user]);

  const addMealAsync = useCallback(async (meal: Omit<Meal, 'id'>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'meals'), meal);
      handleXpGain(30, 'Nutrition Logging');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/meals`);
    }
  }, [user, handleXpGain]);

  const deleteMealAsync = useCallback(async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'meals', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/meals/${id}`);
    }
  }, [user]);

  const toggleHabitAsync = useCallback(async (id: string, completed: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'habits', id), { completed: !completed });
      if (!completed) handleXpGain(40, 'Habit Synced');
    } catch (err) {
      // If doc doesn't exist (first time), we might need to create it.
      // But habits are usually pre-populated. Let's try to set it if it fails.
      try {
        const habit = habits.find(h => h.id === id);
        if (habit) {
          await setDoc(doc(db, 'users', user.uid, 'habits', id), { ...habit, completed: !completed });
          if (!completed) handleXpGain(40, 'Habit Synced');
        }
      } catch (innerErr) {
        handleFirestoreError(innerErr, OperationType.UPDATE, `users/${user.uid}/habits/${id}`);
      }
    }
  }, [user, habits, handleXpGain]);

  const syncDataManually = useCallback(async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), {
        waterAmount,
        sleepHours,
        mood,
        pregnancyWeek,
        steps,
        activeMinutes,
        calorieGoal,
        notificationsEnabled,
        isTrackingSleep,
        sleepStartTime,
        lastManualSync: new Date().toISOString()
      }, { merge: true });
      // Visual feedback could be added here
    } catch (err) {
      console.error("Manual sync failed", err);
    }
  }, [user, waterAmount, sleepHours, mood, pregnancyWeek, steps, activeMinutes, calorieGoal, notificationsEnabled, isTrackingSleep, sleepStartTime]);

  // Background Reminders & Alert Generation
  useEffect(() => {
    // Alert logic
    const checkAlerts = () => {
      const newAlerts: SyncAlert[] = [];
      const now = new Date();
      const hour = now.getHours();

      // Hydration Check
      if (hour >= 10 && waterAmount < 500) {
        newAlerts.push({
          id: 'h1',
          type: 'hydration',
          message: 'Critical: System hydration below 500ml. Fluid intake required for metabolic sync.',
          severity: 'high',
          timestamp: new Date().toISOString()
        });
      }

      // Workout Check
      if (hour >= 17 && activeMinutes < 10) {
        newAlerts.push({
          id: 'w1',
          type: 'workout',
          message: 'Optimization Pending: Daily activity threshold not met. Initiate 15m routine.',
          severity: 'low',
          timestamp: new Date().toISOString()
        });
      }

      setAlerts(newAlerts);
    };

    checkAlerts();
    const interval = setInterval(checkAlerts, 1000 * 60 * 15); // Check every 15 mins

    let notificationInterval: NodeJS.Timeout | null = null;

    if (notificationsEnabled && permission === 'granted') {
      notificationInterval = setInterval(async () => {
        const now = new Date();
        const hour = now.getHours();
        const context = { waterAmount, steps, mood, pregnancyWeek, sleepHours, activeMinutes, consumedCalories, calorieGoal };

        if (hour >= 9 && hour <= 21) {
          try {
            // Hydration logic
            if (waterAmount < 1000 && hour >= 14) {
              const body = await generateSmartNotification('hydration', context);
              sendNotification('Hydration Sync', { body, tag: 'hydration' });
            }
            
            // Steps logic
            else if (steps < 3000 && hour >= 16) {
              const body = await generateSmartNotification('workout', context);
              sendNotification('Movement Sync', { body, tag: 'steps' });
            }

            // Mood check
            else if (mood === 'Low' || mood === 'Stressed') {
              const body = await generateSmartNotification('mood', context);
              sendNotification('Neural Wellness', { body, tag: 'mood' });
            }

            // General Goal/Routine check (Evening)
            else if (hour === 20) {
              const body = await generateSmartNotification('goal', context);
              sendNotification('Daily Optimization', { body, tag: 'routine' });
            }
          } catch (err) {
            console.error("Smart Nudge Error:", err);
          }
        }
      }, 1000 * 60 * 60); // Check every hour
    }

    return () => {
      clearInterval(interval);
      if (notificationInterval) clearInterval(notificationInterval);
    };
  }, [notificationsEnabled, permission, waterAmount, steps, activeMinutes, mood, pregnancyWeek, sleepHours, consumedCalories, calorieGoal, sendNotification]);

  // Handle sleep tracking interval
  useEffect(() => {
    let interval: any;
    if (isTrackingSleep && sleepStartTime) {
      interval = setInterval(() => {
        const now = Date.now();
        const diffMs = now - sleepStartTime;
        const diffHrs = diffMs / (1000 * 60 * 60);
        setElapsedSleep(diffHrs);
      }, 10000); // Update every 10 seconds
      
      // Update immediately
      const now = Date.now();
      setElapsedSleep((now - sleepStartTime) / (1000 * 60 * 60));
    } else {
      setElapsedSleep(0);
    }
    return () => clearInterval(interval);
  }, [isTrackingSleep, sleepStartTime]);

  const startSleep = useCallback(() => {
    setSleepStartTime(Date.now());
    setIsTrackingSleep(true);
  }, []);

  const stopSleep = useCallback(() => {
    if (sleepStartTime) {
      const now = Date.now();
      const diffHrs = (now - sleepStartTime) / (1000 * 60 * 60);
      setSleepHours(prev => parseFloat((prev + diffHrs).toFixed(1)));
    }
    setIsTrackingSleep(false);
    setSleepStartTime(null);
    setElapsedSleep(0);
  }, [sleepStartTime]);

  const handleClaimTheme = useCallback((themeId: string) => {
    if (unlockedThemes.includes(themeId)) return;
    setUnlockedThemes(prev => [...prev, themeId]);
    sendNotification('Reward Claimed', { body: `System aesthetic updated: ${themeId}` });
  }, [unlockedThemes, sendNotification]);

  const handleClaimTitle = useCallback((title: string) => {
    if (unlockedTitles.includes(title)) return;
    setUnlockedTitles(prev => [...prev, title]);
    sendNotification('Prestige Title Unlocked', { body: `Identity augmented: ${title}` });
  }, [unlockedTitles, sendNotification]);

  const handleClaimUpgrade = useCallback((upgradeId: string) => {
    if (unlockedUpgrades.includes(upgradeId)) return;
    setUnlockedUpgrades(prev => [...prev, upgradeId]);
    sendNotification('System Enhanced', { body: `Neural core upgraded: ${upgradeId}` });
  }, [unlockedUpgrades, sendNotification]);

  const renderView = () => {
    const commonContext = {
      waterAmount, sleepHours, mood, pregnancyWeek, steps, activeMinutes,
      consumedCalories, calorieGoal, logs: dailyLogs
    };

    switch (currentView) {
      case 'dashboard': return <Dashboard 
        {...commonContext}
        water={waterAmount}
        sleep={sleepHours}
        mood={mood}
        completedTasks={completedTasksCount} 
        totalTasks={totalTasksCount}
        tasks={tasks}
        habits={habits}
        onNavigate={setCurrentView} 
        isStepCounterActive={isStepCounterActive}
        onToggleHabit={toggleHabitAsync}
        isTrackingSleep={isTrackingSleep}
        elapsedSleep={elapsedSleep}
        alerts={alerts}
        logs={dailyLogs}
        onLogWater={() => setWaterAmount(prev => prev + 250)}
        onLogSteps={() => setSteps(prev => prev + 500)}
        onLogMood={() => setCurrentView('wellness')}
      />;
      case 'routine': return <RoutineSection 
        water={waterAmount} 
        setWater={setWaterAmount}
        sleep={sleepHours}
        setSleep={setSleepHours}
        habits={habits}
        toggleHabit={toggleHabitAsync}
        isTrackingSleep={isTrackingSleep}
        startSleep={startSleep}
        stopSleep={stopSleep}
        elapsedSleep={elapsedSleep}
        addXp={handleXpGain}
      />;
      case 'wellness': return <WellnessSection mood={mood} setMood={setMood} addXp={handleXpGain} />;
      case 'pregnancy': return <PregnancyTracker week={pregnancyWeek} setWeek={setPregnancyWeek} addXp={handleXpGain} />;
      case 'planner': return <DailyPlanner 
        tasks={tasks} 
        addTask={addTaskAsync}
        toggleTask={toggleTaskAsync}
        deleteTask={deleteTaskAsync}
      />;
      case 'fitness': return <FitnessSection 
        steps={steps} setSteps={setSteps} 
        activeMinutes={activeMinutes} setActiveMinutes={setActiveMinutes}
        workouts={workouts} setWorkouts={setWorkouts}
        isStepCounterActive={isStepCounterActive}
        startStepCounter={startStepCounter}
        stopStepCounter={stopStepCounter}
        addXp={handleXpGain}
      />;
      case 'nutrition': return <NutritionSection 
        meals={meals} 
        addMeal={addMealAsync}
        deleteMeal={deleteMealAsync}
        calorieGoal={calorieGoal} setCalorieGoal={setCalorieGoal}
      />;
      case 'assistant': return <AssistantSection 
        user={user}
        context={commonContext}
        logs={dailyLogs}
        addXp={handleXpGain}
      />;
      case 'settings': return <SettingsSection 
        notificationsEnabled={notificationsEnabled}
        setNotificationsEnabled={setNotificationsEnabled}
        permission={permission}
        requestPermission={requestPermission}
        onLogout={handleLogout}
      />;
      case 'rewards': return <RewardsCenter 
        xp={xp}
        level={level}
        streak={streak}
        badges={badges}
        unlockedThemes={unlockedThemes}
        unlockedTitles={unlockedTitles}
        unlockedUpgrades={unlockedUpgrades}
        onClaimTheme={handleClaimTheme}
        onClaimTitle={handleClaimTitle}
        onClaimUpgrade={handleClaimUpgrade}
        addXp={handleXpGain}
      />;
      case 'advisor': return <AdvisorSection 
        user={user}
        context={commonContext}
        existingHabits={habits.map(h => h.text)}
        addXp={handleXpGain}
      />;
      case 'reports': return <ReportsView 
        logs={dailyLogs}
        context={commonContext}
        onNavigate={setCurrentView}
      />;
      default: return <Dashboard 
        {...commonContext}
        water={waterAmount}
        sleep={sleepHours}
        mood={mood}
        completedTasks={completedTasksCount} 
        totalTasks={totalTasksCount} 
        tasks={tasks}
        habits={habits} 
        onNavigate={setCurrentView} 
        isStepCounterActive={isStepCounterActive}
        onToggleHabit={toggleHabitAsync}
        isTrackingSleep={isTrackingSleep}
        elapsedSleep={elapsedSleep}
        alerts={alerts}
        logs={dailyLogs}
        onLogWater={() => setWaterAmount(prev => prev + 250)}
        onLogSteps={() => setSteps(prev => prev + 500)}
        onLogMood={() => setCurrentView('wellness')}
      />;
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center gap-6">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360]
          }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30"
        >
          <Zap className="text-white w-6 h-6" />
        </motion.div>
        <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] animate-pulse">Initializing Neural Link</p>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-zinc-200 dark:border-zinc-800 p-6 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-md shrink-0">
         <div className="flex items-center gap-2 mb-10 px-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">LifeSync AI</h1>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          <NavItem active={currentView === 'dashboard'} icon={<LayoutDashboard size={18} />} label="Dashboard" onClick={() => setCurrentView('dashboard')} />
          <NavItem active={currentView === 'reports'} icon={<Monitor size={18} />} label="Sync Reports" onClick={() => setCurrentView('reports')} />
          <NavItem active={currentView === 'advisor'} icon={<Brain size={18} />} label="AI Neural Advisor" onClick={() => setCurrentView('advisor')} />
          <NavItem active={currentView === 'assistant'} icon={<MessageSquare size={18} />} label="AI Assistant" onClick={() => setCurrentView('assistant')} />
          <NavItem active={currentView === 'routine'} icon={<Droplets size={18} />} label="Daily Routine" onClick={() => setCurrentView('routine')} />
          <NavItem active={currentView === 'fitness'} icon={<Activity size={18} />} label="Fitness" onClick={() => setCurrentView('fitness')} />
          <NavItem active={currentView === 'nutrition'} icon={<Utensils size={18} />} label="Nutrition" onClick={() => setCurrentView('nutrition')} />
          <NavItem active={currentView === 'wellness'} icon={<Heart size={18} />} label="Wellness" onClick={() => setCurrentView('wellness')} />
          <NavItem active={currentView === 'planner'} icon={<CheckSquare size={18} />} label="Planner" onClick={() => setCurrentView('planner')} />
          <NavItem active={currentView === 'rewards'} icon={<Trophy size={18} />} label="Rewards Hub" onClick={() => setCurrentView('rewards')} />
          <NavItem active={currentView === 'pregnancy'} icon={<Baby size={18} />} label="Pregnancy" onClick={() => setCurrentView('pregnancy')} />
          <NavItem active={currentView === 'settings'} icon={<Settings size={18} />} label="Settings" onClick={() => setCurrentView('settings')} />
        </nav>

        <div className="flex flex-col gap-4">
          <div className="p-4 glass-card bg-zinc-100/30 dark:bg-zinc-900/30 flex items-center gap-3 relative group">
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950 z-20" />
            <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs overflow-hidden border border-blue-500/10">
              {user.photoURL ? <img src={user.photoURL} alt="User" /> : user.displayName?.charAt(0) || 'U'}
            </div>
              <div className="truncate flex-1">
                <p className="text-xs font-black truncate leading-none mb-1 text-zinc-900 dark:text-zinc-100 uppercase tracking-tight">{user.displayName || user.email}</p>
                <div className="flex items-center gap-2">
                  <p className="text-[9px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-widest leading-none">LVL {level}</p>
                  <div className="w-12 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(xp / (level * 1000)) * 100}%` }}
                      className="h-full bg-blue-600 shadow-[0_0_8px_rgba(59,130,246,0.5)]" 
                    />
                  </div>
                </div>
              </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full py-3 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-[10px] font-bold uppercase tracking-widest rounded-lg border border-zinc-200 dark:border-zinc-800 transition-all flex items-center justify-center gap-2 group"
          >
            <LogOut size={14} className="group-hover:-translate-x-1 transition-transform" />
            Desync Session
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden relative">
        <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-8 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400 italic font-medium tracking-wide">
             <span className="text-blue-600 dark:text-blue-400 font-semibold">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
             <span className="opacity-30">|</span>
             <span className="flex items-center gap-1"><Wind size={12} /> Calm Focus</span>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setCurrentView('planner')} className="px-3 py-1.5 glass-card bg-white/50 dark:bg-zinc-900/50 text-[10px] font-bold uppercase tracking-wider hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-zinc-700 dark:text-zinc-300">New Task</button>
             <button onClick={syncDataManually} className="px-3 py-1.5 bg-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-blue-900/20 hover:bg-blue-500 transition-all text-white">Sync Data</button>
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
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-600 dark:text-blue-500" />
            <h1 className="text-md font-bold tracking-tight text-zinc-900 dark:text-white">LifeSync AI</h1>
          </div>
          <button 
            onClick={() => setCurrentView('settings')}
            className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 text-[10px] font-bold overflow-hidden"
          >
            {user.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" alt="User" /> : user.displayName?.charAt(0) || 'U'}
          </button>
        </div>

        {/* Mobile Navigation */}
        <nav className="lg:hidden flex items-center justify-around p-3 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 sticky bottom-0 z-10 shrink-0">
          <MobileNavItem active={currentView === 'dashboard'} icon={<LayoutDashboard size={22} />} onClick={() => setCurrentView('dashboard')} />
          <MobileNavItem active={currentView === 'reports'} icon={<Monitor size={22} />} onClick={() => setCurrentView('reports')} />
          <MobileNavItem active={currentView === 'assistant'} icon={<MessageSquare size={22} />} onClick={() => setCurrentView('assistant')} />
          <MobileNavItem active={currentView === 'routine'} icon={<Droplets size={22} />} onClick={() => setCurrentView('routine')} />
          <MobileNavItem active={currentView === 'fitness'} icon={<Activity size={22} />} onClick={() => setCurrentView('fitness')} />
          <MobileNavItem active={currentView === 'nutrition'} icon={<Utensils size={22} />} onClick={() => setCurrentView('nutrition')} />
          <MobileNavItem active={currentView === 'rewards'} icon={<Trophy size={22} />} onClick={() => setCurrentView('rewards')} />
          <MobileNavItem active={currentView === 'planner'} icon={<CheckSquare size={22} />} onClick={() => setCurrentView('planner')} />
          <MobileNavItem active={currentView === 'settings'} icon={<Settings size={22} />} onClick={() => setCurrentView('settings')} />
        </nav>
      </main>

      {/* Right AI Sidebar - Persistent on Desktop */}
      <aside className={`hidden ${currentView === 'assistant' ? 'xl:hidden' : 'xl:flex'} w-80 border-l border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md flex-col shrink-0`}>
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)] dark:shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse"></div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">AI Sync Assistant</h3>
          </div>
          <p className="text-[9px] text-zinc-500 uppercase font-black tracking-[0.2em]">Always Active</p>
        </div>
        <div className="flex-1 overflow-hidden h-full">
          <AIAssistantCompact 
            context={{
              waterAmount, sleepHours, mood, pregnancyWeek, steps, activeMinutes,
              consumedCalories,
              calorieGoal,
              logs: dailyLogs
            }} 
            addXp={handleXpGain}
          />
        </div>
      </aside>
    </div>
  );
}

// --- Sub-components ---

const NavItem = React.memo(({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${
        active 
          ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400 font-semibold shadow-sm' 
          : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900/50'
      } text-sm min-h-[44px]`}
    >
      {icon}
      <span>{label}</span>
      {active && <motion.div layoutId="nav-glow" className="ml-auto w-1 h-1 rounded-full bg-blue-600 dark:bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
    </button>
  );
});

const MobileNavItem = React.memo(({ active, icon, onClick }: { active: boolean, icon: React.ReactNode, onClick: () => void }) => {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      className={`p-4 rounded-xl transition-all ${
        active 
          ? 'text-blue-600 dark:text-blue-400 bg-blue-600/5 dark:bg-blue-400/5' 
          : 'text-zinc-400 dark:text-zinc-600'
      } min-w-[44px] min-h-[44px] flex items-center justify-center`}
    >
      {icon}
    </motion.button>
  );
});

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

// --- Insights Module ---
// --- Neural Insights ---
const NeuralInsights = React.memo(({ logs, context }: { logs: DailyLog[], context: any }) => {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generateInsight = useCallback(async () => {
    if (logs.length === 0) {
      setInsight("Neural link established. Baseline data collection in progress. Keep logging to unlock personalized optimization streams.");
      return;
    }
    setLoading(true);
    try {
      const prompt = "Based on my recent metrics and historical logs, provide one highly specific, personalized health optimization insight. Focus on patterns you see. Keep it under 40 words and very professional yet warm.";
      const res = await askAssistant(prompt, { ...context, logs });
      setInsight(res);
    } catch (err) {
      setInsight("Optimization cycle interrupted. Patterns indicate positive trajectory.");
    } finally {
      setLoading(false);
    }
  }, [logs, context]);

  useEffect(() => {
    generateInsight();
  }, [logs.length]); // Only re-run when we get new days of data

  return (
    <motion.div 
      variants={itemVariants}
      className="glass-card p-6 bg-blue-600/5 dark:bg-blue-500/5 border-blue-500/20 dark:border-blue-500/10 relative overflow-hidden group"
    >
      <div className="absolute top-0 right-0 p-4">
        <Brain size={16} className={`text-blue-600 dark:text-blue-400 ${loading ? 'animate-spin' : 'animate-pulse'}`} />
      </div>
      <div className="flex flex-col gap-3 relative z-10">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">Neural Insight Stream</h3>
          <button 
            onClick={generateInsight} 
            disabled={loading}
            className="text-[8px] font-black uppercase tracking-widest text-zinc-400 hover:text-blue-500 transition-colors"
          >
            Refine Signal
          </button>
        </div>
        {loading ? (
          <div className="space-y-2">
            <div className="h-2 w-3/4 bg-blue-200 dark:bg-blue-900/40 rounded animate-pulse" />
            <div className="h-2 w-1/2 bg-blue-200 dark:bg-blue-900/40 rounded animate-pulse" />
          </div>
        ) : (
          <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed italic">
            "{insight}"
          </p>
        )}
      </div>
      <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-blue-600/5 blur-3xl rounded-full" />
    </motion.div>
  );
});

// --- Reports View ---
const ReportsView = React.memo(({ logs, context, onNavigate }: { logs: DailyLog[], context: any, onNavigate: (v: View) => void }) => {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      const res = await generateWeeklyReport(logs, context);
      setReport(res);
      setLoading(false);
    };
    if (logs.length > 0) fetchReport();
  }, [logs.length]);

  return (
    <motion.div initial="hidden" animate="visible" variants={containerVariants} className="flex flex-col gap-8 pb-20">
      <header className="flex justify-between items-end">
        <div>
          <h3 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em] mb-1">Health Memory Processor</h3>
          <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">Sync Reports</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Active Link</span>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 glass-card bg-zinc-100/50 dark:bg-zinc-800/20 animate-pulse" />)}
        </div>
      ) : report ? (
        <div className="space-y-8">
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <motion.div variants={itemVariants} className="lg:col-span-2 glass-card p-8 bg-blue-600 text-white relative overflow-hidden">
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 blur-3xl rounded-full" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 opacity-70 text-blue-100">Executive Summary</h4>
                <p className="text-xl font-bold leading-relaxed mb-8 relative z-10">{report.summary}</p>
                <div className="flex items-end justify-between relative z-10">
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Neural Sync Score</p>
                     <p className="text-5xl font-black tracking-tighter">{report.score}%</p>
                   </div>
                   <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`w-1.5 h-6 rounded-full ${i <= (report.score / 20) ? 'bg-white' : 'bg-white/20 animate-pulse'}`} style={{ animationDelay: `${i * 0.1}s` }} />
                      ))}
                   </div>
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="glass-card p-8 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] mb-6 text-zinc-500">Next Cycle Objectives</h4>
                <div className="space-y-6">
                  {report.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 font-bold text-[10px] shrink-0 border border-blue-500/20">0{i+1}</div>
                      <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 leading-tight">{rec}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <TrendCard icon={<Droplets />} label="Hydration" trend={report.trends.hydration} color="blue" />
              <TrendCard icon={<Activity />} label="Movement" trend={report.trends.activity} color="emerald" />
              <TrendCard icon={<Moon />} label="Recovery" trend={report.trends.sleep} color="indigo" />
              <TrendCard icon={<Utensils />} label="Nutrition" trend={report.trends.nutrition} color="orange" />
           </div>

           <motion.div variants={itemVariants} className="glass-card p-8 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-center">
              <p className="text-xs font-bold text-zinc-500 mb-6">Insufficient historical cycles for deeper neural mapping. Keep syncing for 30 days to unlock predictive analysis.</p>
              <button 
                onClick={() => onNavigate('dashboard')}
                className="px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg active:scale-95 transition-all"
              >
                Return to Dashboard
              </button>
           </motion.div>
        </div>
      ) : (
        <div className="p-20 glass-card text-center border-zinc-200 dark:border-zinc-800">
          <Brain size={48} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4 animate-pulse" />
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Awaiting sufficient memory logs for synthesis.</p>
        </div>
      )}
    </motion.div>
  );
});

const TrendCard = ({ icon, label, trend, color }: { icon: React.ReactNode, label: string, trend: string, color: string }) => {
  const colors = {
    blue: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
    orange: 'bg-orange-500/10 text-orange-600 border-orange-500/20'
  } as any;

  return (
    <motion.div variants={itemVariants} className="glass-card p-6 bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800">
      <div className={`w-8 h-8 rounded-lg ${colors[color]} flex items-center justify-center mb-4 border`}>
        {React.cloneElement(icon as React.ReactElement, { size: 16 })}
      </div>
      <h5 className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2">{label} Pattern</h5>
      <p className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 leading-relaxed">{trend}</p>
    </motion.div>
  );
};

// --- AI Advisor Section ---
const AdvisorSection = React.memo(({ user, context, existingHabits, addXp }: { user: User | null, context: any, existingHabits: string[], addXp: (amt: number, r: string) => void }) => {
  const [analysis, setAnalysis] = useState<AgentAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [appliedActions, setAppliedActions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const performAnalysis = useCallback(async () => {
    if (!user) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      addXp(20, 'Neural Analysis');
      const result = await runAgenticWorkflow(user.uid, context);
      setAnalysis(result);
    } catch (err) {
      setError("Synchronization failure. Could not parse neural patterns.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [user, context, addXp]);

  const handleExecuteAction = useCallback(async (action: AgentAction, index: number) => {
    if (!user) return;
    const actionId = `action-${index}`;
    if (appliedActions.includes(actionId)) return;

    try {
      await executeAgentAction(user.uid, action, existingHabits);
      setAppliedActions(prev => [...prev, actionId]);
      addXp(50, 'Neural Optimization Applied');
    } catch (err) {
      setError("Partial execution failure.");
    }
  }, [user, appliedActions, existingHabits, addXp]);

  useEffect(() => {
    performAnalysis();
  }, [user?.uid]);

  return (
    <motion.div 
      initial="hidden" animate="visible" variants={containerVariants}
      className="flex flex-col gap-8 max-w-4xl"
    >
      <motion.header variants={itemVariants} className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></div>
            <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Advanced Neural Strategy</h3>
          </div>
          <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">AI Neural Advisor</h2>
        </div>
        <button 
          onClick={performAnalysis}
          disabled={isAnalyzing}
          className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-xl shadow-blue-500/20 active:scale-95 flex items-center gap-2 group transition-all"
        >
          <Activity size={14} className={isAnalyzing ? 'animate-spin' : 'group-hover:rotate-12 transition-transform'} />
          {isAnalyzing ? 'Optimizing...' : 'Refresh Strategy'}
        </button>
      </motion.header>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-widest rounded-xl text-center">
          {error}
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <motion.div variants={itemVariants} className="lg:col-span-12 glass-card p-10 bg-white/60 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 relative overflow-hidden accent-glow cyber-border">
          <div className="absolute top-0 right-0 p-8 opacity-5">
             <Brain size={120} className="text-blue-600" />
          </div>
          <div className="relative z-10 flex flex-col gap-6">
            <div className="flex items-center gap-3">
               <div className="w-8 h-1 bg-blue-600 rounded-full" />
               <h4 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">Optimization Summary</h4>
            </div>
            {isAnalyzing ? (
              <div className="space-y-4">
                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse w-full" />
                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse w-5/6" />
                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse w-4/6" />
              </div>
            ) : (
              <p className="text-lg font-bold text-zinc-800 dark:text-zinc-200 leading-relaxed max-w-2xl">
                {analysis?.summary || "Initialization in progress. Please refresh the signal for a deeper analysis of your biological metrics."}
              </p>
            )}
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="lg:col-span-12 flex flex-col gap-4">
          <div className="flex items-center gap-3">
             <div className="w-8 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
             <h4 className="text-[10px] font-black text-zinc-500 dark:text-zinc-500 uppercase tracking-[0.3em]">AI Generated Routine</h4>
          </div>
          <div className="glass-card p-8 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
            <div className="space-y-6">
              {isAnalyzing ? (
                [1,2,3].map(i => <div key={i} className="h-10 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-lg" />)
              ) : analysis?.routine?.map((item, idx) => (
                <div key={idx} className="flex gap-6 items-start relative group">
                  <div className="flex flex-col items-center">
                    <div className="p-2 bg-blue-600 rounded-lg text-white shadow-lg shadow-blue-600/20 z-10">
                      <Clock size={14} />
                    </div>
                    {idx < analysis.routine!.length - 1 && <div className="w-0.5 h-full bg-zinc-100 dark:bg-zinc-800 absolute top-8 bottom-0" />}
                  </div>
                  <div className="pb-8 flex-1">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">{item.time}</p>
                    <h5 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">{item.activity}</h5>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium italic">{item.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="lg:col-span-12 flex flex-col gap-4">
          <div className="flex items-center gap-3">
             <div className="w-8 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
             <h4 className="text-[10px] font-black text-zinc-500 dark:text-zinc-500 uppercase tracking-[0.3em]">Proposed Directives</h4>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {isAnalyzing ? (
              [1, 2, 3].map(i => <div key={i} className="h-48 glass-card bg-zinc-100/50 dark:bg-zinc-900/50 animate-pulse" />)
            ) : (
              analysis?.actions.map((action, idx) => {
                const isApplied = appliedActions.includes(`action-${idx}`);
                return (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`glass-card p-6 flex flex-col justify-between group border transition-all ${
                      isApplied ? 'bg-emerald-500/5 border-emerald-500/20 opacity-80' : 'bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 hover:border-blue-500/30 shadow-xl'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <div className={`p-2.5 rounded-lg border ${
                          isApplied ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-600' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 group-hover:text-blue-500'
                        }`}>
                          {action.type === 'add_task' && <CheckSquare size={16} />}
                          {action.type === 'add_habit' && <Zap size={16} />}
                          {action.type === 'update_goal' && <Target size={16} />}
                          {action.type === 'tip' && <Brain size={16} />}
                        </div>
                        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">{action.type.replace('_', ' ')}</span>
                      </div>
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 leading-relaxed mb-6 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
                        {action.payload.text || (action.type === 'update_goal' ? `Set ${action.payload.field} to ${action.payload.value}` : 'New Insight Available')}
                      </p>
                    </div>
                    
                    {action.type !== 'tip' && (
                      <button 
                        onClick={() => handleExecuteAction(action, idx)}
                        disabled={isApplied}
                        className={`w-full py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                          isApplied 
                            ? 'bg-emerald-500 text-white cursor-default' 
                            : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white'
                        }`}
                      >
                        {isApplied ? 'Successfully Synced' : 'Apply Directive'}
                      </button>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>

      <motion.div variants={itemVariants} className="p-8 glass-card bg-orange-500/5 border-orange-500/20 flex flex-col md:flex-row items-center gap-8 shadow-2xl relative overflow-hidden group">
         <div className="absolute top-0 left-0 w-2 h-full bg-orange-500 opacity-30" />
         <div className="p-4 bg-orange-500/10 rounded-2xl text-orange-600 border border-orange-500/20 shadow-lg shrink-0 group-hover:scale-110 transition-transform">
           <Heart size={32} />
         </div>
         <div className="space-y-2 flex-1">
           <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-[0.2em]">Medical Disclaimer</h4>
           <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">
             The LifeSync AI Neural Advisor provides optimization strategies based on lifestyle metrics. These are not medical prescriptions. Always consult with a certified biological professional for clinical medical concerns, especially regarding pregnancy care protocols.
           </p>
         </div>
      </motion.div>
    </motion.div>
  );
});

// --- Quick Action Component ---
const QuickActionButtons = ({ onLogWater, onLogSteps, onLogMood }: { onLogWater: () => void, onLogSteps: () => void, onLogMood: () => void }) => {
  return (
    <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3">
       <button onClick={onLogWater} className="p-4 glass-card bg-white dark:bg-zinc-900/60 border-blue-500/10 hover:border-blue-500/40 flex flex-col items-center gap-2 group transition-all active:scale-95">
          <Droplets size={18} className="text-blue-500 group-hover:scale-110 transition-transform" />
          <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Add 250ml</span>
       </button>
       <button onClick={onLogSteps} className="p-4 glass-card bg-white dark:bg-zinc-900/60 border-emerald-500/10 hover:border-emerald-500/40 flex flex-col items-center gap-2 group transition-all active:scale-95">
          <Activity size={18} className="text-emerald-500 group-hover:scale-110 transition-transform" />
          <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Log 500 Steps</span>
       </button>
       <button onClick={onLogMood} className="p-4 glass-card bg-white dark:bg-zinc-900/60 border-rose-500/10 hover:border-rose-500/40 flex flex-col items-center gap-2 group transition-all active:scale-95">
          <Heart size={18} className="text-rose-500 group-hover:scale-110 transition-transform" />
          <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Record Mood</span>
       </button>
    </motion.div>
  );
};

const Dashboard = React.memo(({ 
  water, sleep, mood, completedTasks, totalTasks, tasks, habits, pregnancyWeek, onNavigate, steps, activeMinutes, consumedCalories, calorieGoal, isStepCounterActive,
  isTrackingSleep, elapsedSleep, onToggleHabit, alerts, logs, onLogWater, onLogSteps, onLogMood
}: { 
  water: number, sleep: number, mood: string | null, completedTasks: number, totalTasks: number, tasks: Task[], habits: Habit[], pregnancyWeek: number, onNavigate: (v: any) => void,
  steps: number, activeMinutes: number, consumedCalories: number, calorieGoal: number, isStepCounterActive: boolean,
  isTrackingSleep: boolean, elapsedSleep: number, onToggleHabit: (id: string, completed: boolean) => void,
  alerts: SyncAlert[], logs: DailyLog[], onLogWater: () => void, onLogSteps: () => void, onLogMood: () => void
}) => {
  const commonContext = { 
    waterAmount: water, sleepHours: sleep, mood, pregnancyWeek, steps, activeMinutes, consumedCalories, calorieGoal,
    logs
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-6"
    >
      <motion.header variants={itemVariants} className="mb-2 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-500 neon-glow-blue animate-pulse"></div>
             <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Neural Node: AIS-X1</p>
          </div>
          <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">System Overview</h2>
        </div>
        <div className="flex items-center gap-4 bg-white/40 dark:bg-zinc-900/40 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 backdrop-blur-sm">
           <div className="text-right">
              <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">Connectivity</p>
              <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">UPTALINK: STABLE</p>
           </div>
           <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800" />
           <div className="text-right">
              <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">Sync Hash</p>
              <p className="text-[10px] font-mono text-blue-600 dark:text-blue-400">0x7F22...B31</p>
           </div>
        </div>
      </motion.header>

      {/* AI Memory Insights */}
      <NeuralInsights logs={logs} context={commonContext} />

      <QuickActionButtons onLogWater={onLogWater} onLogSteps={onLogSteps} onLogMood={onLogMood} />

      <motion.div variants={itemVariants} className="p-1 rounded-2xl bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-purple-600/20 group cursor-pointer" onClick={() => onNavigate('advisor')}>
        <div className="glass-card p-6 bg-white/40 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 transition-all group-hover:bg-white/60 dark:group-hover:bg-zinc-900/80 flex items-center justify-between">
           <div className="flex items-center gap-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-600/30 group-hover:scale-110 transition-transform">
                <Brain size={28} />
              </div>
              <div>
                <h4 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-tight">AI Neural Strategy Hub</h4>
                <p className="text-xs text-zinc-500 font-medium max-w-sm mt-1">Initialize deep biometric analysis to automatically generate routines, adjust goals, and optimize pregnancy protocols.</p>
              </div>
           </div>
           <div className="hidden md:flex items-center gap-3 bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-blue-600 transition-colors">
              Synchronize AI <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
           </div>
        </div>
      </motion.div>

      {/* Persistent Alerts Section */}
      <AnimatePresence>
        {alerts.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {alerts.map(alert => (
                <motion.div 
                  key={alert.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className={`p-4 rounded-xl border flex items-center gap-4 relative overflow-hidden backdrop-blur-md ${
                    alert.severity === 'high' 
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400' 
                      : 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                  }`}
                >
                  <div className={`absolute left-0 top-0 w-1 h-full ${alert.severity === 'high' ? 'bg-rose-500' : 'bg-blue-500'}`} />
                  {alert.type === 'hydration' ? <Droplets size={18} /> : alert.type === 'workout' ? <Activity size={18} /> : <Zap size={18} />}
                  <div className="flex-1">
                    <p className="text-[11px] font-bold leading-tight">{alert.message}</p>
                    <p className="text-[9px] opacity-60 mt-1 uppercase font-black tracking-widest">{alert.severity} priority sync</p>
                  </div>
                  {alert.severity === 'high' && <div className="p-1 rounded-full bg-rose-500/10 animate-ping absolute top-2 right-2 w-2 h-2" />}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
            icon={<Moon size={18} className={`${isTrackingSleep ? 'text-blue-400' : 'text-zinc-500'}`} />} 
            label="Sleep Mode" 
            value={isTrackingSleep ? `${elapsedSleep.toFixed(1)}h` : `${sleep}h`} 
            subValue={isTrackingSleep ? 'SESSION IN PROGRESS' : 'Rest period complete'}
            onClick={() => onNavigate('routine')}
            extra={isTrackingSleep && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[8px] font-black text-blue-400 tracking-widest animate-pulse">
                SLEEPING
              </div>
            )}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            icon={<Activity size={18} className="text-emerald-400" />} 
            label="Daily Steps" 
            value={steps.toLocaleString()} 
            subValue={isStepCounterActive ? 'LIVE SENSOR SYNC' : `${activeMinutes} active mins`}
            onClick={() => onNavigate('fitness')}
            extra={isStepCounterActive && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[8px] font-black text-emerald-400 tracking-widest animate-pulse">
                SYNCING
              </div>
            )}
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
        <motion.div variants={itemVariants} className="lg:col-span-8 glass-card p-6 relative overflow-hidden accent-glow bg-white/60 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800">
          <div className="absolute -right-20 -top-20 w-48 h-48 bg-pink-500/5 blur-3xl rounded-full"></div>
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">Pregnancy Protocol</h3>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">Week {pregnancyWeek} <span className="text-xs font-normal text-zinc-500 ml-2 uppercase tracking-widest">Trimester {pregnancyWeek < 13 ? 'I' : pregnancyWeek < 27 ? 'II' : 'III'}</span></p>
            </div>
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold rounded border border-emerald-500/20 uppercase tracking-tighter">Active Sync</span>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between text-[10px] mb-1 font-mono">
              <span className="text-zinc-500 uppercase">Development Progress</span>
              <span className="text-blue-600 dark:text-blue-400">{Math.round((pregnancyWeek / 40) * 100)}%</span>
            </div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-800/50 h-1.5 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: `${(pregnancyWeek / 40) * 100}%` }}
                 className="bg-gradient-to-r from-pink-500 to-blue-500 h-full"
               />
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 italic font-medium leading-relaxed mt-2 opacity-80">
              Insight: Pregnancy week {pregnancyWeek}. {pregnancyWeek < 5 ? "Early cell division stage." : "Critical growth phase active."}
            </p>
          </div>
        </motion.div>

          {/* Habits Checklist */}
        <motion.div variants={itemVariants} className="lg:col-span-4 glass-card p-5 bg-white/60 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800">
           <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">Daily Habits</h3>
           <div className="space-y-3">
             {habits.slice(0, 3).map(habit => (
               <motion.div 
                 key={habit.id} 
                 initial={{ opacity: 0, x: -10 }}
                 animate={{ opacity: 1, x: 0 }}
                 onClick={() => onToggleHabit(habit.id, habit.completed)}
                 className="flex items-center gap-3 cursor-pointer group min-h-[32px]"
               >
                  <div className={`w-4 h-4 rounded border transition-colors ${habit.completed ? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500 flex items-center justify-center' : 'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/30 group-hover:border-zinc-400 dark:group-hover:border-zinc-600'}`}>
                    {habit.completed && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={12} className="text-white" /></motion.div>}
                  </div>
                  <span className={`text-xs transition-colors ${habit.completed ? 'text-zinc-400 dark:text-zinc-500 line-through opacity-50' : 'text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white'}`}>{habit.text}</span>
               </motion.div>
             ))}
           </div>
           <button onClick={() => onNavigate('routine')} className="mt-4 text-[9px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-widest hover:text-blue-500 dark:hover:text-blue-300 transition-colors py-2 px-1">View All Protocols</button>
        </motion.div>
      </motion.div>

      {/* Second Row Grid */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Planner Summary */}
        <motion.div variants={itemVariants} className="glass-card p-5 flex flex-col gap-4 bg-white/60 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800">
           <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Planner Engine</h3>
              <button onClick={() => onNavigate('planner')} className="text-[9px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-widest p-2 -mr-2">Open List</button>
           </div>
           <div className="flex-1 space-y-3">
              {tasks.length > 0 ? (
                tasks.slice(0, 3).map(task => (
                  <motion.div 
                    key={task.id} 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 group min-h-[24px]"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${task.completed ? 'bg-zinc-300 dark:bg-zinc-700' : 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.3)]'}`} />
                    <p className={`text-xs font-medium truncate ${task.completed ? 'text-zinc-400 dark:text-zinc-500 line-through' : 'text-zinc-800 dark:text-zinc-200'}`}>{task.text}</p>
                  </motion.div>
                ))
              ) : (
                <p className="text-xs text-zinc-400 dark:text-zinc-600 italic">No cycles pending for today.</p>
              )}
           </div>
        </motion.div>

        {/* Wellness Shortcut */}
        <motion.div variants={itemVariants} className="glass-card p-5 flex flex-col justify-between bg-white/60 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3">Wellness Module</h3>
          <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-800/50">
             <p className="text-[9px] text-blue-600 dark:text-blue-300 font-bold uppercase mb-1 tracking-wider">Scheduled Meditation</p>
             <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed italic opacity-80">"Focus on your breath for 5 minutes. Awareness is the first step to balance."</p>
          </div>
          <button onClick={() => onNavigate('wellness')} className="mt-4 w-full py-3 bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-widest transition-all">Launch Session</button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
});

function StatCard({ icon, label, value, subValue, onClick, extra }: { icon: React.ReactNode, label: string, value: string, subValue: string, onClick: () => void, extra?: React.ReactNode }) {
  return (
    <motion.button 
      onClick={onClick}
      whileHover={{ y: -4, borderColor: 'rgba(59, 130, 246, 0.5)' }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="glass-card glass-card-hover p-4 flex flex-col items-start gap-4 transition-all group text-left w-full accent-glow relative bg-white/60 dark:bg-zinc-900/40 cyber-border"
    >
      {extra && <div className="absolute top-4 right-4">{extra}</div>}
      <div className="p-2 bg-white dark:bg-zinc-800/80 rounded-xl border border-zinc-200 dark:border-zinc-700/50 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{label}</p>
        <p className="text-2xl font-black text-zinc-900 dark:text-white tracking-tighter font-mono">{value}</p>
        <p className="text-[10px] text-zinc-500 mt-1 uppercase font-bold tracking-widest opacity-60">{subValue}</p>
      </div>
      {/* Decorative pulse line */}
      <div className="absolute bottom-4 right-4 flex gap-0.5">
         <div className="w-1 h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full group-hover:bg-blue-500/40 transition-colors" />
         <div className="w-1 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-full group-hover:bg-blue-500/60 transition-colors [animation-delay:0.1s]" />
         <div className="w-1 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full group-hover:bg-blue-500/40 transition-colors [animation-delay:0.2s]" />
      </div>
    </motion.button>
  );
}

// --- AIAssistantCompact (Persistent Panel) ---
const AIAssistantCompact = React.memo(({ context, addXp }: { context: any, addXp: (amt: number, r: string) => void }) => {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: 'Neural link stable. Infrastructure ready for daily optimization. How can I assist?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    const history = [...messages];
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);
    
    // Add placeholder for AI response
    setMessages(prev => [...prev, { role: 'ai', text: '' }]);
    
    let fullResponse = '';
    try {
      addXp(5, 'AI Interaction');
      const stream = askAssistantStream(userMsg, context, history);
      for await (const chunk of stream) {
        fullResponse += chunk;
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], text: fullResponse };
          return newMsgs;
        });
      }
    } catch (error) {
      console.error("Streaming error:", error);
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].text = "Error: System synchronization failed. Please try again.";
        return newMsgs;
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, context]);

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
              <div className={`max-w-[90%] p-3 rounded-2xl text-[10px] leading-relaxed shadow-sm relative ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'glass-card bg-zinc-50 dark:bg-zinc-800/40 text-zinc-800 dark:text-zinc-200 rounded-tl-none border border-zinc-200 dark:border-zinc-800/30'
              }`}>
                {msg.role === 'ai' && (
                  <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-full neon-glow-blue" />
                )}
                {msg.role === 'ai' ? (
                  <div className="markdown-content prose prose-zinc dark:prose-invert prose-xs max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                  </div>
                ) : (
                  msg.text
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="glass-card bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-2xl rounded-tl-none border border-zinc-200 dark:border-zinc-800/30">
              <div className="flex flex-col gap-2">
                <p className="text-[8px] text-blue-600 dark:text-blue-400 font-black uppercase tracking-[0.2em] opacity-80 animate-pulse">Syncing...</p>
                <div className="flex gap-1">
                  <div className="w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce [animation-duration:0.6s]"></div>
                  <div className="w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.15s]"></div>
                  <div className="w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.3s]"></div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="p-4 bg-zinc-50/50 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-900 mt-auto backdrop-blur-md">
        <div className="relative group">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Neural prompt..."
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-4 pr-12 py-3.5 text-[11px] text-zinc-900 dark:text-zinc-100 focus:border-blue-500/50 outline-none transition-all placeholder:text-zinc-500 min-h-[44px] shadow-inner"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-2 p-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-600 hover:text-white text-zinc-500 dark:text-zinc-400 rounded-lg transition-all border border-zinc-200 dark:border-zinc-700 shadow-sm min-w-[36px] min-h-[36px] flex items-center justify-center mt-0.5"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
});

// --- Assistant Section (Full View) ---
const AssistantSection = React.memo(({ user, context, logs, addXp }: { user: User | null, context: any, logs: DailyLog[], addXp: (amt: number, r: string) => void }) => {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: "Systems online. Neural link established. How can I assist with your biological optimization today? 🌌" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { isListening, transcript, startListening, stopListening, setTranscript } = useVoiceInput();

  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const handleSend = useCallback(async (overrideMsg?: string) => {
    const userMsg = (overrideMsg || input).trim();
    if (!userMsg || isLoading) return;
    
    const history = [...messages];
    setInput('');
    setTranscript('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);
    
    // Add placeholder for AI response
    setMessages(prev => [...prev, { role: 'ai', text: '' }]);
    
    let fullResponse = '';
    const fullContext = { ...context, logs };
    
    try {
      addXp(10, 'AI Session');
      const stream = askAssistantStream(userMsg, fullContext, history);
      for await (const chunk of stream) {
        fullResponse += chunk;
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], text: fullResponse };
          return newMsgs;
        });
      }
    } catch (error) {
      console.error("Streaming error:", error);
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].text = "Error: High-level neural synchronization failed. Retrying in next cycle...";
        return newMsgs;
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, context, setTranscript]);

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col h-[calc(100vh-180px)] lg:h-[calc(100vh-140px)] gap-4"
    >
        <motion.header variants={itemVariants}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-500 animate-pulse"></div>
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Neural Intelligence Layer</h3>
          </div>
          <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">AI Life Sync</h2>
        </motion.header>

        <motion.div variants={itemVariants} className="flex-1 glass-card h-full flex flex-col overflow-hidden relative shadow-2xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900/10 cyber-border">
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-white/50 dark:from-zinc-950/50 to-transparent pointer-events-none z-10" />
        
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
                  <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-[10px] font-bold transition-all relative ${
                    msg.role === 'user' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 shadow-inner' : 'bg-blue-600 text-white shadow-xl shadow-blue-500/20'
                  }`}>
                    {msg.role === 'user' ? 'USER' : <Zap size={18} />}
                    {msg.role === 'ai' && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-400 border-2 border-white dark:border-zinc-900 rounded-full" />}
                  </div>
                  <div className={`p-5 rounded-2xl text-[13px] leading-relaxed relative overflow-hidden ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none shadow-xl' 
                      : 'bg-zinc-50 dark:bg-zinc-800/40 text-zinc-800 dark:text-zinc-100 rounded-tl-none border border-zinc-200 dark:border-zinc-700/30'
                  }`}>
                    {msg.role === 'ai' ? (
                      <div className="markdown-content prose prose-zinc dark:prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
            {isLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                 <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center animate-pulse shadow-xl shadow-blue-600/30">
                      <Zap size={18} className="text-white" />
                    </div>
                    <div className="bg-zinc-100 dark:bg-zinc-800/80 p-5 rounded-2xl rounded-tl-none border border-zinc-200 dark:border-zinc-700/30 shadow-sm">
                      <div className="flex flex-col gap-2.5">
                        <p className="text-[10px] text-blue-600 dark:text-blue-400 font-black uppercase tracking-[0.2em] animate-pulse">Syncing Brain-Link...</p>
                        <div className="flex gap-1.5 pt-1">
                          <div className="w-1.5 h-1.5 bg-blue-600 dark:bg-blue-500 rounded-full animate-bounce [animation-duration:0.6s]"></div>
                          <div className="w-1.5 h-1.5 bg-blue-600 dark:bg-blue-500 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.15s]"></div>
                          <div className="w-1.5 h-1.5 bg-blue-600 dark:bg-blue-500 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.3s]"></div>
                        </div>
                      </div>
                    </div>
                 </div>
              </motion.div>
            )}
        </div>

        <div className="p-6 border-t border-zinc-200 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-3xl">
          <div className="flex gap-3 relative items-end">
            <div className="flex-1 relative group">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={isListening ? "Listening... Neural Input Active" : "How can I support your evolution?..."}
                className={`w-full bg-white dark:bg-zinc-900 border ${isListening ? 'border-blue-600 neon-glow-blue' : 'border-zinc-200 dark:border-zinc-800'} rounded-2xl pl-6 pr-14 py-5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:border-blue-500 transition-all outline-none min-h-[64px] shadow-inner font-medium`}
                disabled={isLoading}
              />
              <button 
                onMouseDown={startListening}
                onMouseUp={stopListening}
                onTouchStart={startListening}
                onTouchEnd={stopListening}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-xl transition-all ${
                  isListening ? 'bg-blue-600 text-white animate-pulse' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400'
                } min-w-[48px] min-h-[48px] flex items-center justify-center`}
              >
                <Mic size={20} />
              </button>
            </div>
            <button 
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="p-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-2xl transition-all shadow-xl shadow-blue-500/20 active:scale-95 flex items-center justify-center shrink-0 min-w-[64px] min-h-[64px]"
            >
              <Send size={24} />
            </button>
          </div>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1 scroll-hide">
            {["Vital status check", "Sync pregnancy week", "Active recovery protocol", "Nutritional recalibration"].map(suggestion => (
              <button 
                key={suggestion}
                onClick={() => handleSend(suggestion)}
                className="whitespace-nowrap px-5 py-2.5 bg-white/50 dark:bg-zinc-900/50 hover:bg-white dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-full text-[9px] text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all font-black uppercase tracking-widest min-h-[36px] shadow-sm backdrop-blur-sm"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});

// --- Routine Section ---
const RoutineSection = React.memo(({ 
  water, setWater, sleep, setSleep, habits, toggleHabit,
  isTrackingSleep, startSleep, stopSleep, elapsedSleep, addXp
}: { 
  water: number, setWater: any, sleep: number, setSleep: any, habits: Habit[], toggleHabit: (id: string, completed: boolean) => Promise<void>,
  isTrackingSleep: boolean, startSleep: () => void, stopSleep: () => void, elapsedSleep: number, addXp: (amt: number, r: string) => void
}) => {
  const handleToggle = useCallback((id: string, completed: boolean) => {
    toggleHabit(id, completed);
  }, [toggleHabit]);

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-6 max-w-4xl"
    >
      <motion.header variants={itemVariants}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-500 neon-glow-emerald animate-pulse"></div>
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Maintenance Protocols</h3>
        </div>
        <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">Sync Optimization</h2>
      </motion.header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Water Tracker */}
        <motion.div variants={itemVariants} className="glass-card p-8 bg-white/40 dark:bg-zinc-900/10 cyber-border border-zinc-200 dark:border-zinc-800 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[80px] rounded-full group-hover:bg-blue-500/10 transition-all duration-700" />
          
          <div className="flex justify-between items-center mb-8 relative z-10">
             <div>
               <h3 className="text-sm font-black text-zinc-800 dark:text-white uppercase tracking-wider">Hydration Sync</h3>
               <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">H2O Saturation</p>
             </div>
             <div className="text-right">
               <span className="text-xl font-black text-blue-600 dark:text-blue-400">{(water / 1000).toFixed(2)}</span>
               <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 ml-1">/ 2.00L</span>
             </div>
          </div>

          <div className="relative h-48 bg-zinc-100 dark:bg-zinc-950/50 rounded-2xl overflow-hidden mb-8 border border-zinc-200 dark:border-zinc-800/80 shadow-inner group-hover:border-blue-500/30 transition-colors">
            <div className="absolute inset-x-0 bottom-0 h-full w-full opacity-[0.03] dark:opacity-[0.07] pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            
            <motion.div 
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-600/40 via-blue-500/20 to-blue-400/10 border-t border-blue-500/50 neon-glow-blue"
              initial={{ height: 0 }}
              animate={{ height: `${Math.min((water / 2000) * 100, 100)}%` }}
              transition={{ type: 'spring', damping: 20, stiffness: 60 }}
            >
               <motion.div 
                 animate={{ y: [0, -4, 0] }}
                 transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                 className="absolute -top-1 left-0 right-0 h-2 bg-blue-400/30 blur-sm"
               />
            </motion.div>
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Droplets size={32} className={`transition-all duration-500 ${water > 0 ? 'text-blue-600 dark:text-blue-400 opacity-20 scale-110' : 'text-zinc-300 dark:text-zinc-800 opacity-10'}`} />
            </div>
          </div>

          <div className="flex gap-3 relative z-10">
            <button 
              onClick={() => setWater(Math.max(0, water - 250))}
              className="px-5 py-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[9px] font-black uppercase tracking-widest rounded-xl border border-zinc-200 dark:border-zinc-700/50 transition-all active:scale-95 text-zinc-600 dark:text-zinc-400"
            >
              Flush 250ml
            </button>
            <button 
              onClick={() => {
                setWater(water + 250);
                addXp(15, 'Hydration Sync');
              }}
              className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest rounded-xl shadow-xl shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Plus size={14} className="stroke-[3]" /> Inject 250ml
            </button>
          </div>
        </motion.div>

        {/* Sleep Tracker */}
        <motion.div variants={itemVariants} className="glass-card p-8 bg-white/40 dark:bg-zinc-900/10 cyber-border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[80px] rounded-full group-hover:bg-indigo-500/10 transition-all duration-700" />
           <AnimatePresence>
             {isTrackingSleep && (
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 className="absolute inset-0 bg-blue-900/40 dark:bg-blue-950/80 backdrop-blur-xl z-20 flex flex-col items-center justify-center p-8"
               >
                 <div className="absolute inset-0 opacity-10 pointer-events-none" 
                      style={{ backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, .05) 25%, rgba(255, 255, 255, .05) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .05) 75%, rgba(255, 255, 255, .05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(255, 255, 255, .05) 25%, rgba(255, 255, 255, .05) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .05) 75%, rgba(255, 255, 255, .05) 76%, transparent 77%, transparent)', backgroundSize: '50px 50px' }} />
                 
                 <motion.div 
                   animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
                   transition={{ repeat: Infinity, duration: 6 }}
                   className="w-24 h-24 rounded-3xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center mb-8 shadow-2xl relative"
                 >
                    <Moon size={32} className="text-blue-400 neon-glow-blue" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full neon-glow-blue animate-ping" />
                 </motion.div>
                 
                 <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-2 animate-pulse">Deep Delta Protocol Active</h3>
                 
                 <div className="text-6xl font-black text-white tracking-tighter mb-10 flex items-baseline gap-2">
                   {elapsedSleep.toFixed(2)}<span className="text-sm font-medium text-zinc-500 uppercase tracking-widest">Hrs</span>
                 </div>
                 
                 <button 
                   onClick={stopSleep}
                   className="w-full py-5 bg-white text-zinc-950 font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl hover:bg-zinc-200 transition-all shadow-2xl active:scale-95"
                 >
                   Terminate Rest Cycle
                 </button>
               </motion.div>
             )}
           </AnimatePresence>

           <div className="flex justify-between items-center mb-8 relative z-10">
             <div>
               <h3 className="text-sm font-black text-zinc-800 dark:text-white uppercase tracking-wider">Rest Recovery</h3>
               <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Neural Reset Cycle</p>
             </div>
             <div className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700/50 text-[8px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">
               Optimal
             </div>
           </div>

           <div className="flex-1 flex flex-col justify-center items-center py-6 relative z-10">
              <div className="relative mb-12">
                <div className="text-7xl font-black text-zinc-900 dark:text-white tracking-tighter text-center flex items-baseline justify-center gap-1">
                  {sleep}<span className="text-xl font-medium text-zinc-300 dark:text-zinc-700">h</span>
                </div>
                <div className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.3em] text-center mt-3">
                  Rest Phase Quality
                </div>
              </div>
              
              <div className="w-full space-y-5 px-2 mb-10">
                  <div className="relative h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800/50">
                    <motion.div 
                      className="absolute inset-y-0 left-0 bg-blue-500 neon-glow-blue rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(sleep / 12) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[8px] text-zinc-400 dark:text-zinc-600 font-black uppercase tracking-widest">
                      <span>Min Power</span>
                      <span className="text-blue-500">8h Base Sync</span>
                      <span>Max Ultra</span>
                  </div>
              </div>

              <button 
                onClick={startSleep}
                className="w-full py-5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-900 dark:hover:bg-zinc-700 hover:text-white text-zinc-600 dark:text-zinc-400 text-[9px] font-black uppercase tracking-[0.2em] rounded-xl border border-zinc-200 dark:border-zinc-700/50 transition-all flex items-center justify-center gap-3 shadow-inner active:scale-95"
              >
                <Moon size={14} className="group-hover:text-blue-400 transition-colors" />
                Initiate Hibernate
              </button>
           </div>
        </motion.div>
      </div>

      <motion.div variants={itemVariants} className="glass-card p-8 bg-white/40 dark:bg-zinc-900/10 cyber-border border-zinc-200 dark:border-zinc-800 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
           <Zap size={16} className="text-emerald-500" />
           <h3 className="text-[10px] font-black text-zinc-800 dark:text-zinc-300 uppercase tracking-[0.3em]">Habit Reinforcement Engine</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {habits.map((habit: Habit) => (
            <motion.div 
              key={habit.id}
              layout
              onClick={() => handleToggle(habit.id, habit.completed)}
              whileHover={{ y: -2, x: 2 }}
              className={`flex items-center gap-4 p-5 rounded-2xl cursor-pointer border transition-all relative overflow-hidden group ${
                habit.completed 
                  ? 'bg-emerald-500/5 border-emerald-500/30 dark:border-emerald-500/10' 
                  : 'bg-white dark:bg-zinc-900/30 border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              {habit.completed && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute -right-2 -bottom-2 opacity-5 pointer-events-none"
                >
                  <Check size={64} className="text-emerald-500" />
                </motion.div>
              )}
              
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
                habit.completed 
                  ? 'bg-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/20' 
                  : 'border-zinc-300 dark:border-zinc-700 group-hover:border-emerald-500/50'
              }`}>
                {habit.completed && <Check size={14} className="text-white stroke-[4]" />}
              </div>
              
              <div className="flex flex-col">
                <span className={`text-[11px] font-black uppercase tracking-tight transition-all ${habit.completed ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {habit.text}
                </span>
                <span className="text-[8px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mt-0.5">
                  {habit.completed ? 'Protocol Success' : 'Awaiting Execution'}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
});

// --- Mental Wellness View ---
const WellnessSection = React.memo(({ mood, setMood, addXp }: { mood: string | null, setMood: any, addXp: (amt: number, r: string) => void }) => {
  const [sessionActive, setSessionActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 mins

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (sessionActive && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0) {
      setSessionActive(false);
      setTimeLeft(300);
    }
    return () => clearInterval(timer);
  }, [sessionActive, timeLeft]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-8 max-w-4xl"
    >
      <motion.header variants={itemVariants}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-600 dark:bg-rose-500 neon-glow-rose animate-pulse"></div>
          <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Cerebral Calibration</h3>
        </div>
        <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">Neural Equilibrium</h2>
      </motion.header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div variants={itemVariants} className="md:col-span-2 glass-card p-8 bg-white/40 dark:bg-zinc-900/10 cyber-border border-zinc-200 dark:border-zinc-800 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-[80px] rounded-full group-hover:bg-emerald-500/10 transition-all duration-700" />
          
          <h3 className="text-xs font-black text-zinc-800 dark:text-zinc-300 uppercase tracking-[0.2em] mb-8 relative z-10">Current Sentiment Baseline</h3>
          <div className="flex gap-6 relative z-10">
            {[{ emoji: <Smile size={28} />, label: 'Great', c: 'text-emerald-600 dark:text-emerald-400', activeC: 'bg-emerald-600 shadow-xl shadow-emerald-600/30 text-white border-emerald-400' },
              { emoji: <Meh size={28} />, label: 'Okay', c: 'text-amber-600 dark:text-amber-400', activeC: 'bg-amber-500 shadow-xl shadow-amber-500/30 text-white border-amber-300' },
              { emoji: <Frown size={28} />, label: 'Low', c: 'text-rose-600 dark:text-rose-400', activeC: 'bg-rose-600 shadow-xl shadow-rose-600/30 text-white border-rose-400' }].map((m) => (
              <motion.button
                key={m.label}
                onClick={() => {
                  setMood(m.label);
                  addXp(20, 'Mental Reflection');
                }}
                whileHover={{ y: -8, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`flex-1 flex flex-col items-center gap-4 p-6 rounded-3xl border transition-all duration-300 ${
                  mood === m.label 
                    ? `${m.activeC} border-2` 
                    : 'bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-sm'
                }`}
              >
                <div className={mood === m.label ? 'text-white' : m.c}>{m.emoji}</div>
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${mood === m.label ? 'text-white' : 'text-zinc-500'}`}>{m.label}</span>
              </motion.button>
            ))}
          </div>
          
          <div className="mt-10 p-6 bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-inner relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4">
                <Brain size={16} className="text-zinc-200 dark:text-zinc-800 animate-pulse" />
             </div>
             <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">
               Neural synchronization history indicates a 12% improvement in positive sentiment cycles over the last 72 hours. Protocol adherence remains critical for long-term stability.
             </p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card p-8 bg-white/40 dark:bg-zinc-900/10 cyber-border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col relative overflow-hidden group">
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-rose-500/5 blur-[80px] rounded-full group-hover:bg-rose-500/10 transition-all duration-700" />
          <AnimatePresence>
            {sessionActive && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-rose-600/90 dark:bg-rose-950/90 backdrop-blur-2xl z-20 flex flex-col items-center justify-center p-8 text-center"
              >
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                  className="w-32 h-32 rounded-full border-4 border-white/20 absolute z-0"
                />
                <h3 className="text-[10px] font-black text-rose-200 uppercase tracking-[0.4em] mb-4 relative z-10">Sync Initiation</h3>
                <div className="text-6xl font-black text-white tracking-tighter mb-8 relative z-10 tabular-nums">
                  {formatTime(timeLeft)}
                </div>
                <p className="text-[11px] text-rose-100/70 font-medium mb-10 max-w-[200px] relative z-10 leading-relaxed">
                  Focus on neural alignment. Synchronize biological rhythm with the counter.
                </p>
                <button 
                  onClick={() => setSessionActive(false)}
                  className="w-full py-4 bg-white text-rose-600 font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl hover:bg-zinc-100 transition-all shadow-2xl relative z-10 active:scale-95"
                >
                  Terminate Protocol
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <h3 className="text-xs font-black text-zinc-800 dark:text-zinc-300 uppercase tracking-[0.2em] mb-2 relative z-10">Neural Calm</h3>
          <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-8 relative z-10 tabular-nums">5:00 MIN PROTOCOL</p>

          <div className="flex-1 flex flex-col items-center justify-center relative z-10">
             <div className="w-24 h-24 rounded-3xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-8 shadow-inner group-hover:scale-105 transition-transform duration-500">
               <Waves size={32} className="text-rose-500 neon-glow-rose" />
             </div>
             <button 
               onClick={() => setSessionActive(true)}
               className="w-full py-5 bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-rose-600/30 transition-all active:scale-95"
             >
               Start Calibration
             </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
});

// --- Pregnancy Insights ---
const PregnancyInsights = React.memo(({ week }: { week: number }) => {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchInsight = async () => {
      setLoading(true);
      try {
        const prompt = `I am currently in week ${week} of pregnancy. Provide one high-level, medically-informed AI care recommendation or physical tip specific to this week. Focus on comfort, nutrition, or preparation. Keep it under 35 words.`;
        const res = await askAssistant(prompt, { pregnancyWeek: week });
        setInsight(res);
      } catch (err) {
        setInsight("Neural link unstable. Focus on balanced nutrition and hydration protocols.");
      } finally {
        setLoading(false);
      }
    };
    fetchInsight();
  }, [week]);

  return (
    <div className="p-8 glass-card bg-blue-600/5 dark:bg-blue-500/5 border-blue-500/20 dark:border-blue-500/10 relative overflow-hidden group">
      <div className="flex items-center gap-3 mb-4 relative z-10">
        <Brain size={14} className={`text-blue-500 ${loading ? 'animate-spin' : 'animate-pulse'}`} />
        <h4 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">AI Prenatal Guide</h4>
      </div>
      {loading ? (
        <div className="space-y-2 relative z-10">
          <div className="h-3 bg-blue-200 dark:bg-blue-900/40 rounded animate-pulse w-full" />
          <div className="h-3 bg-blue-200 dark:bg-blue-900/40 rounded animate-pulse w-5/6" />
        </div>
      ) : (
        <p className="text-[12px] text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium relative z-10">
          {insight}
        </p>
      )}
      <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-blue-600/5 blur-2xl rounded-full" />
    </div>
  );
});

// --- Pregnancy View ---
const PregnancyTracker = React.memo(({ week, setWeek, addXp }: { week: number, setWeek: any, addXp: (amt: number, r: string) => void }) => {
  const handleWeekUpdate = useCallback((newWeek: number) => {
    setWeek(newWeek);
    addXp(200, 'Biosynthesis Milestone');
  }, [setWeek, addXp]);

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-8 max-w-4xl"
    >
      <motion.header variants={itemVariants}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-500 neon-glow-blue animate-pulse"></div>
          <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Gestation Metrics</h3>
        </div>
        <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">Genesis Protocol</h2>
      </motion.header>

      <motion.div variants={itemVariants} className="glass-card p-10 flex flex-col lg:flex-row items-center gap-12 bg-white/40 dark:bg-zinc-900/10 cyber-border border-zinc-200 dark:border-zinc-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        
        <motion.div 
          className="relative shrink-0"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
        >
          <svg className="w-56 h-56 transform -rotate-90">
            <circle cx="112" cy="112" r="100" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-zinc-100 dark:text-zinc-800" />
            <motion.circle 
              cx="112" cy="112" r="100" fill="transparent" stroke="#3b82f6" strokeWidth="8" strokeDasharray={2 * Math.PI * 100}
              initial={{ strokeDashoffset: 2 * Math.PI * 100 }}
              animate={{ strokeDashoffset: (2 * Math.PI * 100) * (1 - week / 40) }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              strokeLinecap="round"
              className="neon-glow-blue"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-6xl font-black text-zinc-900 dark:text-white tracking-tighter">{week}</span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.4em]">Weeks</span>
          </div>
        </motion.div>

        <div className="flex-1 space-y-8 w-full">
           <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-950/50 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-inner relative z-10">
              <button 
                onClick={() => handleWeekUpdate(Math.max(1, week - 1))} 
                className="p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all text-zinc-400 dark:text-zinc-600 group active:scale-90 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 min-w-[56px] min-h-[56px] flex items-center justify-center"
              >
                <ChevronRight className="rotate-180 stroke-[3]" />
              </button>
              <div className="text-center">
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-[0.2em] mb-1">Development Phase</p>
                <p className="text-lg font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-tighter tabular-nums">Week {week} Progress</p>
              </div>
              <button 
                onClick={() => handleWeekUpdate(Math.min(40, week + 1))} 
                className="p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all text-zinc-400 dark:text-zinc-600 group active:scale-90 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 min-w-[56px] min-h-[56px] flex items-center justify-center"
              >
                <ChevronRight className="stroke-[3]" />
              </button>
            </div>
            <PregnancyInsights week={week} />
          </div>
        </motion.div>
      </motion.div>
    );
  }
);

// --- Daily Planner View ---
const DailyPlanner = React.memo(({ 
  tasks, addTask, toggleTask, deleteTask 
}: { 
  tasks: Task[], 
  addTask: (text: string) => Promise<void>,
  toggleTask: (id: string, completed: boolean) => Promise<void>,
  deleteTask: (id: string) => Promise<void>
}) => {
  const [newTask, setNewTask] = useState('');

  const handleAdd = useCallback(() => {
    if (!newTask.trim()) return;
    addTask(newTask.trim());
    setNewTask('');
  }, [newTask, addTask]);

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-8 max-w-2xl h-full"
    >
      <motion.header variants={itemVariants}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-500 neon-glow-blue animate-pulse"></div>
          <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Execution Pipeline</h3>
        </div>
        <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">Task Manifest</h2>
      </motion.header>

      <motion.div variants={itemVariants} className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
        <input 
          type="text" value={newTask} onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="New deployment goal..."
          className="relative w-full bg-white dark:bg-zinc-900/60 cyber-border border-zinc-200 dark:border-zinc-800 rounded-xl pl-6 pr-16 py-5 text-[11px] font-bold text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-700 outline-none transition-all shadow-inner uppercase tracking-wider"
        />
        <button 
          onClick={handleAdd} 
          className="absolute right-3 top-3 bottom-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all shadow-xl shadow-blue-600/30 active:scale-95 flex items-center justify-center group-hover:scale-105"
        >
          <Plus size={18} className="stroke-[3]" />
        </button>
      </motion.div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-4 scroll-hide tabular-nums">
        <AnimatePresence initial={false} mode="popLayout">
          {tasks.length === 0 ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-24 text-zinc-400 dark:text-zinc-800"
            >
              <div className="w-16 h-16 rounded-full border-2 border-zinc-100 dark:border-zinc-900 flex items-center justify-center mb-6 opacity-50">
                <CheckSquare size={32} className="opacity-20" />
              </div>
              <p className="text-[10px] uppercase tracking-[0.4em] font-black opacity-30">Manifest Clear</p>
            </motion.div>
          ) : (
            tasks.map((task: Task) => (
              <motion.div
                key={task.id} 
                layout
                initial={{ opacity: 0, x: -20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, scale: 0.9 }}
                className={`group flex items-center gap-5 p-5 rounded-2xl border transition-all relative overflow-hidden ${
                  task.completed 
                    ? 'bg-zinc-50/50 dark:bg-zinc-950/30 border-zinc-100 dark:border-zinc-900 text-zinc-400 dark:text-zinc-600' 
                    : 'glass-card bg-white dark:bg-zinc-900/30 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 hover:border-blue-500/30 shadow-sm'
                }`}
              >
                <button 
                  onClick={() => toggleTask(task.id, task.completed)} 
                  className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
                    task.completed 
                      ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-600/30' 
                      : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 group-hover:border-blue-500/50'
                  }`}
                >
                  {task.completed && <Check size={14} className="text-white stroke-[4]" />}
                </button>
                <span className={`flex-1 text-[11px] font-black uppercase tracking-tight ${task.completed ? 'opacity-30' : ''}`}>
                  {task.text}
                </span>
                <button 
                  onClick={() => deleteTask(task.id)} 
                  className="p-3 text-zinc-300 dark:text-zinc-800 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100 active:scale-90"
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

// --- Fitness View ---
const FitnessSection = React.memo(({ 
  steps, setSteps, activeMinutes, setActiveMinutes, workouts, setWorkouts,
  isStepCounterActive, startStepCounter, stopStepCounter, addXp
}: {
  steps: number, setSteps: any, activeMinutes: number, setActiveMinutes: any, workouts: Workout[], setWorkouts: any,
  isStepCounterActive: boolean, startStepCounter: () => void, stopStepCounter: () => void, addXp: (amt: number, r: string) => void
}) => {
  const [isLogging, setIsLogging] = useState(false);
  const [workoutType, setWorkoutType] = useState('Running');
  const [duration, setDuration] = useState('30');

  const logWorkout = useCallback(() => {
    const newWorkout: Workout = {
      id: Date.now().toString(),
      type: workoutType,
      duration: parseInt(duration),
      calories: parseInt(duration) * 10,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setWorkouts([newWorkout, ...workouts]);
    setActiveMinutes((prev: number) => prev + parseInt(duration));
    addXp(100, 'Physical Optimization');
    setIsLogging(false);
  }, [workoutType, duration, workouts, setWorkouts, setActiveMinutes, addXp]);

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-6 max-w-4xl"
    >
      <motion.header variants={itemVariants}>
        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">Kinetic Sync</h3>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Fitness Engine</h2>
      </motion.header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div variants={itemVariants} className="glass-card p-6 bg-white/60 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-emerald-500/5 blur-2xl rounded-full"></div>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Pedometer</h3>
            <Activity className="text-emerald-500 opacity-50" size={16} />
          </div>
          <div className="flex flex-col items-center py-6">
            <div className="text-5xl font-black text-zinc-900 dark:text-white tracking-tighter mb-2">{steps.toLocaleString()}</div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-600 uppercase font-black tracking-widest">Steps Transduced</p>
          </div>
          <div className="w-full bg-zinc-100 dark:bg-zinc-950 h-1.5 rounded-full overflow-hidden mt-4 shadow-inner">
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${Math.min((steps / 10000) * 100, 100)}%` }}
               className="bg-emerald-500 h-full shadow-[0_0_8px_rgba(16,185,129,0.4)]"
             />
          </div>
          <div className="flex justify-between text-[9px] mt-2 font-mono text-zinc-500">
            <span>0</span>
            <span>10,000 GOAL</span>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <button 
              onClick={isStepCounterActive ? stopStepCounter : startStepCounter}
              className={`w-full py-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border flex items-center justify-center gap-2 min-h-[44px] ${
                isStepCounterActive 
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${isStepCounterActive ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400 dark:bg-zinc-600'}`}></div>
              {isStepCounterActive ? 'Live Sync Active' : 'Enable Live Sensor Sync'}
            </button>
            <div className="flex gap-2">
              <button 
                onClick={() => setSteps(steps + 500)} 
                className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-[10px] font-bold uppercase transition-all border border-zinc-200 dark:border-zinc-700 min-h-[44px] text-zinc-600 dark:text-zinc-400"
              >
                +500
              </button>
              <button 
                onClick={() => setSteps(steps + 1000)} 
                className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-[10px] font-bold uppercase transition-all border border-zinc-200 dark:border-zinc-700 min-h-[44px] text-zinc-600 dark:text-zinc-400"
              >
                +1k
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card p-6 bg-white/60 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Active Intensity</h3>
            <Clock className="text-blue-600 dark:text-blue-500 opacity-50" size={16} />
          </div>
          <div className="flex-1 space-y-6">
             <div className="flex items-end gap-3">
                <span className="text-4xl font-black text-zinc-900 dark:text-white">{activeMinutes}</span>
                <span className="text-xs text-zinc-500 font-bold uppercase mb-1.5">Mins today</span>
             </div>
             <div className="space-y-3">
                <div className="flex justify-between items-center">
                   <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Recent Logs</h4>
                   {!isLogging && <button onClick={() => setIsLogging(true)} className="text-[9px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-widest min-h-[44px] px-2 flex items-center hover:text-blue-500 transition-colors">+ Log</button>}
                </div>
                {isLogging ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 bg-zinc-50/50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800 space-y-4 shadow-inner">
                     <div className="grid grid-cols-2 gap-2">
                       <select value={workoutType} onChange={(e) => setWorkoutType(e.target.value)} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-3 text-[10px] text-zinc-700 dark:text-zinc-300 outline-none min-h-[44px] shadow-sm">
                         <option>Running</option><option>Cycling</option><option>Yoga</option><option>Strength</option>
                       </select>
                       <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-3 text-[10px] text-zinc-700 dark:text-zinc-300 outline-none min-h-[44px] shadow-sm" />
                     </div>
                     <div className="flex gap-2">
                       <button onClick={() => setIsLogging(false)} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-[9px] font-bold uppercase min-h-[44px] text-zinc-500 dark:text-zinc-400 transition-colors">Discard</button>
                       <button onClick={logWorkout} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded text-[9px] font-bold uppercase text-white min-h-[44px] transition-all shadow-lg shadow-blue-500/20">Save</button>
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
                          className="flex items-center justify-between p-3 rounded-lg bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-900"
                        >
                          <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">{w.type}</span>
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono">{w.duration}m · {w.calories}cal</span>
                        </motion.div>
                      )) : <p className="text-[10px] text-zinc-400 dark:text-zinc-700 italic py-4 text-center">No data found.</p>}
                    </AnimatePresence>
                  </div>
                )}
             </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
});

// --- Nutrition View ---
const NutritionSection = React.memo(({ 
  meals, addMeal, deleteMeal, calorieGoal, setCalorieGoal 
}: { 
  meals: Meal[], 
  addMeal: (meal: Omit<Meal, 'id'>) => Promise<void>,
  deleteMeal: (id: string) => Promise<void>,
  calorieGoal: number, 
  setCalorieGoal: any 
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [mealName, setMealName] = useState('');
  const [mealCals, setMealCals] = useState('300');
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('snack');
  const totalCalories = useMemo(() => meals.reduce((acc, m) => acc + m.calories, 0), [meals]);

  const handleAdd = useCallback(() => {
    if (!mealName.trim()) return;
    addMeal({
      name: mealName.trim(),
      calories: parseInt(mealCals),
      type: mealType
    });
    setMealName(''); setIsAdding(false);
  }, [mealName, mealCals, mealType, addMeal]);

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-6 max-w-4xl"
    >
      <motion.header variants={itemVariants}>
        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">Fuel Optimization</h3>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Nutrition Planner</h2>
      </motion.header>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <motion.div variants={itemVariants} className="lg:col-span-4 glass-card p-6 bg-white/60 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 flex flex-col items-center">
           <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-8 w-full">Calorie Matrix</h3>
           <div className="relative w-36 h-36 mb-6">
              <svg className="w-full h-full transform -rotate-90">
                 <circle cx="72" cy="72" r="64" fill="transparent" stroke="currentColor" strokeWidth="6" className="text-zinc-100 dark:text-zinc-800" />
                 <motion.circle 
                    cx="72" cy="72" r="64" fill="transparent" stroke="#f97316" strokeWidth="6" strokeDasharray={2 * Math.PI * 64}
                    initial={{ strokeDashoffset: 2 * Math.PI * 64 }}
                    animate={{ strokeDashoffset: (2 * Math.PI * 64) * (1 - Math.min(totalCalories / calorieGoal, 1)) }}
                    transition={{ duration: 1 }}
                    strokeLinecap="round"
                 />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-zinc-900 dark:text-white">{totalCalories}</span>
                <span className="text-[9px] text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-widest">In</span>
              </div>
           </div>
           <div className="w-full space-y-2 text-[10px] font-mono">
              <div className="flex justify-between"><span className="text-zinc-500">GOAL</span><span className="text-orange-500 dark:text-orange-400 font-bold">{calorieGoal}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">LEFT</span><span className="text-zinc-700 dark:text-zinc-300 font-bold">{Math.max(0, calorieGoal - totalCalories)}</span></div>
           </div>
        </motion.div>
        <motion.div variants={itemVariants} className="lg:col-span-8 glass-card p-6 bg-white/60 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800">
           <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-widest">Logs</h3>
            {!isAdding && <button onClick={() => setIsAdding(true)} className="px-3 py-1 bg-orange-600/10 text-orange-600 dark:text-orange-400 text-[9px] font-bold uppercase rounded border border-orange-500/30 min-h-[44px] flex items-center hover:bg-orange-600/20 transition-all">+ Add Row</button>}
          </div>
           {isAdding && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 p-6 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-4 shadow-inner">
                 <div className="grid grid-cols-2 gap-3">
                    <input type="text" value={mealName} onChange={(e) => setMealName(e.target.value)} placeholder="Entry Label" className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-900 dark:text-white outline-none min-h-[44px] shadow-sm" />
                    <input type="number" value={mealCals} onChange={(e) => setMealCals(e.target.value)} className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-900 dark:text-white outline-none min-h-[44px] shadow-sm" />
                 </div>
                 <div className="flex justify-between items-center">
                  <select value={mealType} onChange={(e) => setMealType(e.target.value as any)} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-3 text-xs text-zinc-700 dark:text-zinc-400 min-h-[44px] outline-none shadow-sm">
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="snack">Snack</option>
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => setIsAdding(false)} className="px-4 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl text-[10px] font-bold uppercase min-h-[44px] text-zinc-500 transition-colors">Discard</button>
                    <button onClick={handleAdd} className="px-4 py-3 bg-orange-600 text-white rounded-xl text-[10px] font-bold uppercase min-h-[44px] shadow-lg shadow-orange-900/20 transition-all">Append</button>
                  </div>
                 </div>
              </motion.div>
           )}
           <div className="space-y-2 overflow-y-auto pr-2 scroll-hide max-h-[300px]">
              <AnimatePresence initial={false}>
                {meals.length > 0 ? meals.map(m => (
                  <motion.div 
                    key={m.id} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center justify-between p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-900 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-orange-500/60 shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
                      <div>
                        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{m.name}</p>
                        <p className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase font-black tracking-widest">{m.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">{m.calories} cal</span>
                      <button onClick={() => deleteMeal(m.id)} className="opacity-0 group-hover:opacity-100 p-3 text-zinc-400 hover:text-rose-500 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                )) : (
                  <div className="py-20 text-center">
                    <div className="w-16 h-16 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-2xl flex items-center justify-center mx-auto mb-4 opacity-20">
                      <Utensils size={32} className="text-zinc-400" />
                    </div>
                    <p className="text-[10px] uppercase font-black text-zinc-400 tracking-[0.2em]">Matrix Empty</p>
                  </div>
                )}
              </AnimatePresence>
           </div>
        </motion.div>
      </div>
    </motion.div>
  );
});

// --- Settings View ---
const SettingsSection = React.memo(({ 
  notificationsEnabled, setNotificationsEnabled,
  permission, requestPermission, onLogout
}: { 
  notificationsEnabled: boolean, setNotificationsEnabled: any,
  permission: NotificationPermission, requestPermission: () => Promise<NotificationPermission>,
  onLogout: () => Promise<void>
}) => {
  const [isRequesting, setIsRequesting] = useState(false);
  const { theme, setTheme } = useTheme();

  const handleToggle = useCallback(async () => {
    if (!notificationsEnabled && permission !== 'granted') {
      setIsRequesting(true);
      const res = await requestPermission();
      setIsRequesting(false);
      if (res === 'granted') {
        setNotificationsEnabled(true);
      }
    } else {
      setNotificationsEnabled(!notificationsEnabled);
    }
  }, [notificationsEnabled, permission, requestPermission, setNotificationsEnabled]);

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-8 max-w-2xl mx-auto py-8"
    >
      <motion.header variants={itemVariants}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 neon-glow-zinc animate-pulse"></div>
          <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">System Preferences</h3>
        </div>
        <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">Core Configuration</h2>
      </motion.header>

      <div className="space-y-6">
        {/* Appearance Theme */}
        <motion.div variants={itemVariants} className="glass-card p-10 bg-white/40 dark:bg-zinc-900/10 cyber-border border-zinc-200 dark:border-zinc-800 shadow-2xl relative overflow-hidden group">
           <div className="flex items-center gap-6 mb-10 relative z-10">
            <div className="p-4 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-2xl shadow-inner">
              {theme === 'dark' ? <Moon size={24} className="neon-glow-blue" /> : <Sun size={24} className="text-amber-500" />}
            </div>
            <div>
              <h4 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider">Visual Interface</h4>
              <p className="text-[11px] text-zinc-500 font-medium mt-1">Configure atmospheric synchronization.</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 relative z-10">
            {[
              { id: 'light', label: 'Light', icon: <Sun size={16} /> },
              { id: 'dark', label: 'Dark', icon: <Moon size={16} /> },
              { id: 'system', label: 'System', icon: <Monitor size={16} /> },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id as any)}
                className={`flex flex-col items-center justify-center gap-4 py-6 rounded-2xl border text-[10px] font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden ${
                  theme === t.id 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-2xl shadow-blue-600/40 translate-z-10' 
                    : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                {theme === t.id && (
                  <motion.div 
                    layoutId="theme-active"
                    className="absolute inset-0 bg-blue-500/10 blur-xl opacity-50"
                  />
                )}
                {t.icon}
                <span className="relative z-10">{t.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Notifications */}
        <motion.div variants={itemVariants} className="glass-card p-10 bg-white/40 dark:bg-zinc-900/10 cyber-border border-zinc-200 dark:border-zinc-800 shadow-2xl relative overflow-hidden group">
          <div className="flex items-center justify-between mb-10 relative z-10">
            <div className="flex items-center gap-6">
              <div className={`p-4 rounded-2xl border transition-all ${notificationsEnabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600'}`}>
                {notificationsEnabled ? <Bell size={24} className="neon-glow-emerald animate-pulse" /> : <BellOff size={24} />}
              </div>
              <div>
                <h4 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider">Neural Nudges</h4>
                <p className="text-[11px] text-zinc-500 font-medium mt-1">Status: {notificationsEnabled ? 'ACTIVE' : 'DEACTIVATED'}</p>
              </div>
            </div>
            <button 
              onClick={handleToggle}
              disabled={isRequesting}
              className={`w-16 h-9 rounded-full transition-all relative flex items-center px-1.5 ${notificationsEnabled ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700'}`}
            >
              <motion.div 
                animate={{ x: notificationsEnabled ? 28 : 0 }}
                className="w-6 h-6 bg-white rounded-full shadow-2xl relative z-10"
              >
                {isRequesting && (
                  <div className="absolute inset-0 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                )}
              </motion.div>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
             <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-inner group/card">
               <h5 className="text-[10px] font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                 <Droplets size={12} className="text-blue-500" />
                 Hydration Pulse
               </h5>
               <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">Critical alerts triggered when H2O saturation drops below optimal baseline.</p>
             </div>
             <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-inner group/card">
               <h5 className="text-[10px] font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                 <Zap size={12} className="text-amber-500" />
                 Activity Sync
               </h5>
               <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">Kinetic engagement alerts when neuro-muscular inactivity persists.</p>
             </div>
          </div>
        </motion.div>

        {/* Security & Access */}
        <motion.div variants={itemVariants} className="glass-card p-10 bg-white/40 dark:bg-zinc-900/10 cyber-border border-zinc-200 dark:border-zinc-800 shadow-2xl relative overflow-hidden group">
          <div className="flex items-center gap-6 mb-10 relative z-10">
            <div className="p-4 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-2xl shadow-inner">
              <ShieldCheck size={24} className="text-blue-500" />
            </div>
            <div>
              <h4 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider">Access Control</h4>
              <p className="text-[11px] text-zinc-500 font-medium mt-1">Manage session status and biometric identity.</p>
            </div>
          </div>

          <button 
            onClick={onLogout}
            className="w-full py-5 bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-rose-600/30 transition-all flex items-center justify-center gap-3 active:scale-95"
          >
            <LogOut size={16} />
            Terminate Current Session
          </button>
        </motion.div>

        <div className="text-center py-6">
           <p className="text-[9px] text-zinc-400 dark:text-zinc-700 font-black uppercase tracking-[0.5em]">LifeSync AI • Protocol v4.0.2</p>
        </div>
      </div>
    </motion.div>
  );
});

// --- Rewards View ---
const RewardsCenter = React.memo(({ 
  xp, level, streak, badges, unlockedThemes, unlockedTitles, unlockedUpgrades, onClaimTheme, onClaimTitle, onClaimUpgrade 
}: { 
  xp: number, level: number, streak: number, badges: Badge[], 
  unlockedThemes: string[], unlockedTitles: string[], unlockedUpgrades: string[],
  onClaimTheme: (id: string) => void, onClaimTitle: (t: string) => void, onClaimUpgrade: (id: string) => void,
  addXp: (amt: number, r: string) => void
}) => {
  const nextLevelXp = level * 1000;
  const progress = (xp / nextLevelXp) * 100;

    const claimableRewards = [
      { id: 'theme_dark_pro', title: 'Carbon Matrix Theme', type: 'theme', costXP: 5000, description: 'High-contrast professional interface.' },
      { id: 'theme_neon_pulse', title: 'Neon Pulse Theme', type: 'theme', costXP: 10000, description: 'Reactive ultraviolet aesthetic.' },
      { id: 'title_optimization_engine', title: 'Optimization Engine', type: 'title', costXP: 2500, description: 'Special prestige title for your profile.' },
      { id: 'upgrade_ai_v2', title: 'Neural Core v2.0', type: 'upgrade', costXP: 15000, description: 'Unlocks deeper biometric analysis and longer memory.' }
    ];

    const canAfford = (cost: number) => xp >= cost;

    return (
      <motion.div 
        initial="hidden" animate="visible" variants={containerVariants}
        className="flex flex-col gap-8 max-w-5xl"
      >
        <motion.header variants={itemVariants} className="flex justify-between items-end flex-wrap gap-4">
          <div>
            <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] mb-1">Incentive Layer</h3>
            <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">Rewards Hub</h2>
          </div>
          <div className="flex items-center gap-6 p-4 glass-card bg-blue-600/5 border-blue-500/20">
            <div className="text-right">
               <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Global Streak</p>
               <p className="text-xl font-black text-zinc-900 dark:text-white">{streak} Days</p>
            </div>
            <div className="w-px h-10 bg-zinc-200 dark:bg-zinc-800" />
            <div className="text-right">
               <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Level {level}</p>
               <p className="text-xl font-black text-zinc-900 dark:text-white">{xp} / {nextLevelXp} XP</p>
            </div>
          </div>
        </motion.header>

        {/* Level Progress Detailed */}
        <motion.div variants={itemVariants} className="glass-card p-1 pb-10 bg-white/50 dark:bg-zinc-900/20">
          <div className="p-8">
             <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Processing Progress</span>
                <span className="text-xs font-mono text-blue-600 font-bold">{Math.round(progress)}% to Level {level + 1}</span>
             </div>
             <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden p-1 shadow-inner border border-zinc-200/50 dark:border-zinc-800/50">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                />
             </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Achievements Section */}
          <div className="lg:col-span-12">
             <div className="flex items-center gap-4 mb-6">
                <Award className="text-amber-500" size={20} />
                <h4 className="text-sm font-black uppercase tracking-widest">Achievements & Badges</h4>
                <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {badges.length > 0 ? badges.map(b => (
                  <motion.div 
                    key={b.id} variants={itemVariants}
                    className="glass-card p-6 bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 group hover:border-amber-500/30 transition-all flex flex-col"
                  >
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-amber-500/5 shrink-0">
                      {b.icon === 'Droplets' && <Droplets size={24} />}
                      {b.icon === 'Zap' && <Zap size={24} />}
                      {b.icon === 'Baby' && <Baby size={24} />}
                      {!['Droplets', 'Zap', 'Baby'].includes(b.icon) && <Star size={24} />}
                    </div>
                    <h5 className="text-[11px] font-black uppercase tracking-wider text-zinc-900 dark:text-white mb-1">{b.title}</h5>
                    <p className="text-[10px] text-zinc-500 leading-relaxed font-medium mb-3 flex-1">{b.description}</p>
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-zinc-50 dark:border-zinc-800/50">
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                        b.rarity === 'legendary' ? 'bg-purple-100 text-purple-600' :
                        b.rarity === 'epic' ? 'bg-orange-100 text-orange-600' :
                        b.rarity === 'rare' ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-600'
                      }`}>
                        {b.rarity}
                      </span>
                      <span className="text-[8px] font-mono text-zinc-400 italic">Unlocked {new Date(b.unlockedAt!).toLocaleDateString()}</span>
                    </div>
                  </motion.div>
                )) : (
                  <div className="col-span-full py-12 text-center glass-card border-dashed border-zinc-300 dark:border-zinc-800">
                    <Star size={32} className="text-zinc-200 dark:text-zinc-800 mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Biological achievements pending</p>
                  </div>
                )}
             </div>
          </div>

          {/* Claim Rewards Section */}
          <div className="lg:col-span-12">
             <div className="flex items-center gap-4 mb-6 mt-4">
                <Star className="text-blue-500" size={20} />
                <h4 className="text-sm font-black uppercase tracking-widest">Claim Optimization Assets</h4>
                <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {claimableRewards.map(reward => {
                  const isClaimed = reward.type === 'theme' ? unlockedThemes.includes(reward.id) : 
                                   reward.type === 'title' ? unlockedTitles.includes(reward.title) :
                                   unlockedUpgrades.includes(reward.id);
                  const affordable = canAfford(reward.costXP);

                  return (
                    <motion.div 
                      key={reward.id} variants={itemVariants}
                      className={`glass-card p-6 bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 relative overflow-hidden flex flex-col ${isClaimed ? 'opacity-60 grayscale-[0.5]' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-4">
                         <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-500">
                            {reward.type === 'theme' && <Monitor size={20} />}
                            {reward.type === 'title' && <Target size={20} />}
                            {reward.type === 'upgrade' && <Brain size={20} />}
                         </div>
                         <div className="text-right">
                            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{reward.type}</p>
                            <p className={`text-xs font-black uppercase tracking-tighter ${affordable ? 'text-blue-600 dark:text-blue-400' : 'text-rose-500'}`}>
                              {reward.costXP} XP
                            </p>
                         </div>
                      </div>
                      <h5 className="text-sm font-black text-zinc-900 dark:text-white mb-2">{reward.title}</h5>
                      <p className="text-[11px] text-zinc-500 font-medium leading-relaxed mb-6 flex-1">{reward.description}</p>
                      
                      <button 
                        disabled={isClaimed || !affordable}
                        onClick={() => {
                          if (reward.type === 'theme') onClaimTheme(reward.id);
                          else if (reward.type === 'title') onClaimTitle(reward.title);
                          else onClaimUpgrade(reward.id);
                        }}
                        className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all min-h-[44px] flex items-center justify-center ${
                          isClaimed ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed' : 
                          !affordable ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed border border-dashed border-rose-500/20' :
                          'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20 active:scale-95'
                        }`}
                      >
                        {isClaimed ? 'Access Established' : !affordable ? 'Insufficient Xp' : 'Authorize Sync'}
                      </button>
                    </motion.div>
                  );
                })}
             </div>
          </div>
        </div>
      </motion.div>
    );
  }
);

// --- Login View ---
const Login = React.memo(({ onLogin }: { onLogin: () => void }) => {
  return (
    <div className="h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full glass-card p-10 bg-white/80 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-center shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600"></div>
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-600/40">
            <Zap className="w-8 h-8 text-white" />
          </div>
        </div>
        
        <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter mb-2">Neural Synchronization</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-10 leading-relaxed font-medium">
          Welcome to LifeSync AI. Log in to synchronize your health data across the neural mesh.
        </p>

        <button 
          onClick={onLogin}
          className="w-full py-5 bg-blue-600 dark:bg-white text-white dark:text-zinc-950 rounded-xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-blue-500 dark:hover:bg-zinc-200 transition-all shadow-xl shadow-blue-600/20 dark:shadow-white/5 active:scale-95 min-h-[56px]"
        >
          <LogIn size={18} />
          Establish Link with Google
        </button>

        <div className="mt-10 pt-10 border-t border-zinc-100 dark:border-zinc-800/50">
          <div className="flex justify-center gap-6 opacity-30 grayscale saturate-0 text-zinc-900 dark:text-white">
             <div className="flex flex-col items-center gap-1">
               <ShieldCheck size={16} />
               <span className="text-[8px] font-bold uppercase tracking-widest">Secure</span>
             </div>
             <div className="flex flex-col items-center gap-1">
               <Activity size={16} />
               <span className="text-[8px] font-bold uppercase tracking-widest">Realtime</span>
             </div>
             <div className="flex flex-col items-center gap-1">
               <Heart size={16} />
               <span className="text-[8px] font-bold uppercase tracking-widest">Wellness</span>
             </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
});

