import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { TaskItem } from '@/types';
import { useSettings } from '@/hooks/use-settings';

const DEFAULT_PRAISES = ['お疲れ様！', 'ナイス！', 'その調子！', 'えらい！', '素晴らしい！'];

function useTasksState() {
  const { characterPraises } = useSettings();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const t = await AsyncStorage.getItem('@tasks');
      if (t) {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) setTasks(parsed);
      }
    } catch (e) {
      console.error('Tasks parse error', e);
    }
  }, []);

  const saveTasks = useCallback(async (newTasks: TaskItem[]) => {
    setTasks(newTasks);
    await AsyncStorage.setItem('@tasks', JSON.stringify(newTasks));
  }, []);

  const showToastPraise = useCallback(() => {
    const list = characterPraises.length > 0 ? characterPraises : DEFAULT_PRAISES;
    setToastMsg(list[Math.floor(Math.random() * list.length)]);
    setTimeout(() => setToastMsg(null), 2500);
  }, [characterPraises]);

  const addTask = useCallback((text: string, dueDate: Date | null, notifyMin: number | null) => {
    if (!text.trim()) return;
    setTasks(prev => {
      const next: TaskItem[] = [
        {
          id: Date.now().toString(),
          text: text.trim(),
          memo: '',
          done: false,
          dueDate: dueDate ? dueDate.toISOString() : null,
          notifyMin,
          recurring: 'none',
          completedAt: null,
        },
        ...prev,
      ];
      AsyncStorage.setItem('@tasks', JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => {
      const next = prev.filter(t => t.id !== id);
      AsyncStorage.setItem('@tasks', JSON.stringify(next));
      return next;
    });
  }, []);

  const moveTask = useCallback((index: number, direction: 'up' | 'down') => {
    setTasks(prev => {
      if (direction === 'up' && index === 0) return prev;
      if (direction === 'down' && index === prev.length - 1) return prev;
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      AsyncStorage.setItem('@tasks', JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleDone = useCallback((id: string) => {
    let praise = false;
    setTasks(prev => {
      const next = [...prev];
      const idx = next.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const t = { ...next[idx] };
      t.done = !t.done;
      t.completedAt = t.done ? new Date().toISOString() : null;
      next[idx] = t;

      if (t.done) {
        praise = true;
        if (t.recurring !== 'none' && t.dueDate) {
          const nextDue = new Date(t.dueDate);
          if (t.recurring === 'daily') nextDue.setDate(nextDue.getDate() + 1);
          if (t.recurring === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
          next.push({ ...t, id: Date.now().toString(), done: false, dueDate: nextDue.toISOString(), completedAt: null });
        }
      }
      AsyncStorage.setItem('@tasks', JSON.stringify(next));
      return next;
    });
    if (praise) showToastPraise();
  }, [showToastPraise]);

  const updateTask = useCallback((updated: TaskItem) => {
    setTasks(prev => {
      const next = prev.map(t => (t.id === updated.id ? updated : t));
      AsyncStorage.setItem('@tasks', JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    tasks,
    toastMsg,
    loadTasks,
    saveTasks,
    addTask,
    deleteTask,
    moveTask,
    toggleDone,
    updateTask,
  };
}

type TasksContextValue = ReturnType<typeof useTasksState>;

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const value = useTasksState();
  const { loadTasks } = value;

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  return React.createElement(TasksContext.Provider, { value }, children);
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used within a TasksProvider');
  return ctx;
}
