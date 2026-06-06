import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { TaskItem } from '@/types';
import { useSettings } from '@/hooks/use-settings';

const DEFAULT_PRAISES = ['お疲れ様！', 'ナイス！', 'その調子！', 'えらい！', '素晴らしい！'];

// 繰り返しタスクの次回期限を計算する。元の時刻（時分）を保ったまま、
// 今より未来になるまで間隔ぶん進める（期限超過タスクを完了しても次回が過去にならない）。
function computeNextDue(dueIso: string, recurring: 'daily' | 'weekly'): Date {
  const d = new Date(dueIso);
  const step = recurring === 'weekly' ? 7 : 1;
  const now = Date.now();
  do {
    d.setDate(d.getDate() + step);
  } while (d.getTime() <= now);
  return d;
}

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

  // ドラッグ&ドロップでの並び替え: fromIndex の項目を取り出し toIndex に挿入する。
  const reorderTasks = useCallback((fromIndex: number, toIndex: number) => {
    setTasks(prev => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 || toIndex < 0 ||
        fromIndex >= prev.length || toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
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
        // 繰り返しタスクの完了: 次回分を生成する。
        // recurredChildId があれば生成済みなので二重生成しない。
        if (t.recurring !== 'none' && t.dueDate && !t.recurredChildId) {
          const childId = Date.now().toString();
          t.recurredChildId = childId;
          next[idx] = t;
          const child: TaskItem = {
            ...t,
            id: childId,
            done: false,
            dueDate: computeNextDue(t.dueDate, t.recurring).toISOString(),
            completedAt: null,
            recurredChildId: null,
          };
          // 末尾ではなく元タスクの直後に挿入し、手動の並び順を保つ。
          next.splice(idx + 1, 0, child);
        }
      } else if (t.recurredChildId) {
        // 未完了に戻したら、自動生成した次回分が手付かず（未完了）なら撤回する。
        const childId = t.recurredChildId;
        t.recurredChildId = null; // t は既に next[] 内にあるので、ここでの代入で反映される
        const childIdx = next.findIndex(x => x.id === childId);
        if (childIdx !== -1 && !next[childIdx].done) next.splice(childIdx, 1);
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
    reorderTasks,
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
