import type { GoogleGenerativeAI } from '@google/generative-ai';
import { useCallback, useRef, useState } from 'react';
import { FlatList } from 'react-native';
import type { ChatMessage, Greetings, TaskItem } from '@/types';

interface UseChatParams {
  genAI: GoogleGenerativeAI | null;
  effPrompt: string;
  characterErrorMsg: string;
  aiName: string;
  greetings: Greetings | null;
  tasks: TaskItem[];
}

export function useChat({ genAI, effPrompt, characterErrorMsg, aiName, greetings, tasks }: UseChatParams) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  chatMessagesRef.current = chatMessages;

  const [isSending, setIsSending] = useState(false);
  const [detailComment, setDetailComment] = useState('「🤖 アドバイスをもらう」ボタンを押してね');
  const chatListRef = useRef<FlatList<ChatMessage> | null>(null);

  const taskSum = tasks.length
    ? tasks
        .map((t, i) => `${i + 1}. [${t.done ? '完' : '未'}] ${t.text}${t.dueDate ? ` (${new Date(t.dueDate).toLocaleDateString()})` : ''}`)
        .join('\n')
    : '（タスクなし）';

  const generateWelcomeMessage = useCallback(() => {
    const h = new Date().getHours();
    let key: keyof Greetings = 'night';
    if (h >= 5 && h < 11) key = 'morning';
    else if (h >= 11 && h < 17) key = 'afternoon';
    else if (h >= 17 && h < 23) key = 'evening';

    if (greetings?.[key]?.length) {
      const list = greetings[key];
      setChatMessages([{ id: `w-${Date.now()}`, role: 'model', text: list[Math.floor(Math.random() * list.length)] }]);
      return;
    }

    const fallback = {
      morning: [`おはようございます！${aiName}です。今日も一日頑張りましょう！`, `おはよう！${aiName}だよ。朝の空気は気持ちいいね。`],
      afternoon: [`こんにちは！${aiName}です。午後の調子はどうですか？`, `お疲れ様です！${aiName}だよ。一息つきながら頑張ろう。`],
      evening: [`こんばんは！${aiName}です。今日のタスクは順調かな？`, `お疲れ様！${aiName}だよ。夜もサポートするからね。`],
      night: [`夜分に失礼します、${aiName}です。無理は禁物ですよ。`, `こんばんは、${aiName}だよ。明日に備えて少しずつ片付けよう。`],
    };
    const list = fallback[key];
    setChatMessages([{ id: `w-${Date.now()}`, role: 'model', text: list[Math.floor(Math.random() * list.length)] }]);
  }, [aiName, greetings]);

  const sendChat = async (userText: string, hiddenSysPrompt?: string) => {
    if (!userText.trim() || isSending) return;
    setChatMessages(prev => [...prev, { id: `${Date.now()}-u`, role: 'user', text: userText }]);

    if (!genAI) {
      setChatMessages(prev => [...prev, { id: `${Date.now()}-e`, role: 'model', text: characterErrorMsg }]);
      return;
    }

    setIsSending(true);
    try {
      const sys = `【設定】${effPrompt}\n【現在】${new Date().toLocaleString('ja-JP')}\n【タスク】\n${taskSum}\n${hiddenSysPrompt || 'タスク状況を踏まえて自然に会話して。'}`;
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', systemInstruction: sys });

      const safeHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
      let expectedRole: 'user' | 'model' = 'user';
      for (const m of chatMessagesRef.current) {
        if (m.id.startsWith('w-') || m.id === 'welcome') continue;
        if (m.role === expectedRole) {
          safeHistory.push({ role: m.role, parts: [{ text: m.text }] });
          expectedRole = expectedRole === 'user' ? 'model' : 'user';
        }
      }
      if (safeHistory.at(-1)?.role === 'user') safeHistory.pop();

      const chat = model.startChat({ history: safeHistory });
      const res = await chat.sendMessage([{ text: userText }]);
      setChatMessages(prev => [...prev, { id: `${Date.now()}-m`, role: 'model', text: res.response.text() }]);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      console.error('Gemini API Error:', e);
      setChatMessages(prev => [...prev, { id: `${Date.now()}-e2`, role: 'model', text: characterErrorMsg }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleDailyReport = () => {
    const today = new Date();
    const doneToday = tasks.filter(
      t => t.done && t.completedAt && new Date(t.completedAt).toDateString() === today.toDateString()
    );
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;
    const prompt =
      doneToday.length === 0
        ? `【裏指示】今日は完了タスクがゼロでした。本日は${isWeekend ? '週末' : '平日'}です。ユーザーが祝日や休みで休養をとっていたなら、ゆっくり休めたか優しく聞いてあげて。そうでないなら、明日に向けて励まして！`
        : `【裏指示】今日は以下のタスクを完了しました！\n${doneToday.map(t => t.text).join('\n')}\n今日1日の頑張りをめちゃくちゃ褒めて、最高の締めくくりをしてあげて！`;
    sendChat('今日の実績を報告します！', prompt);
  };

  const fetchDetailComment = async (t: TaskItem) => {
    if (!genAI) return;
    setDetailComment('アドバイスを考え中...');
    try {
      const sys = `【設定】${effPrompt}\nユーザーがタスク詳細を開きました。`;
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', systemInstruction: sys });
      const res = await model.generateContent([
        { text: `タスク「${t.text}」、備考「${t.memo || 'なし'}」。このタスクについて、1〜2文で専用のアドバイスやコメントをしてください。` },
      ]);
      setDetailComment(res.response.text());
    } catch {
      setDetailComment('アドバイスの取得に失敗しました。');
    }
  };

  const resetMessages = () => setChatMessages([]);

  return {
    chatMessages,
    isSending,
    detailComment,
    setDetailComment,
    chatListRef,
    generateWelcomeMessage,
    sendChat,
    handleDailyReport,
    fetchDetailComment,
    resetMessages,
  };
}
