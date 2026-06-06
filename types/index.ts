export type TaskItem = {
  id: string;
  text: string;
  memo: string;
  done: boolean;
  dueDate: string | null;
  notifyMin: number | null;
  recurring: 'none' | 'daily' | 'weekly';
  completedAt: string | null;
  advice?: string | null;
  adviceKey?: string | null;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

export type Greetings = {
  morning: string[];
  afternoon: string[];
  evening: string[];
  night: string[];
};
