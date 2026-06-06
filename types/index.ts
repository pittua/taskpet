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
  // 繰り返しタスク完了時に生成した「次回分」の id。二重生成防止と、未完了化時の撤回に使う。
  recurredChildId?: string | null;
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
