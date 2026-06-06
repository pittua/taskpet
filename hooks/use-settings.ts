import { GoogleGenerativeAI } from '@google/generative-ai';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { withRetry } from '@/lib/ai-retry';
import { getApiKey, setApiKey } from '@/lib/secure-key';
import type { Greetings } from '@/types';

const KEYS = {
  avatar: 'set.avatar',
  prompt: 'set.prompt',
  color: 'set.color',
  name: 'set.name',
  praises: 'set.praises',
  errorMsg: 'set.errorMsg',
  greetings: 'set.greetings',
};

type SaveParams = {
  aiAvatarUri: string | null;
  customCharacterPrompt: string;
  themeColor: string;
  aiName: string;
  geminiApiKey: string;
};

function useSettingsState() {
  const [themeColor, setThemeColor] = useState('#2196F3');
  const [aiAvatarUri, setAiAvatarUri] = useState<string | null>(null);
  const [aiName, setAiName] = useState('AI');
  const [customCharacterPrompt, setCustomCharacterPrompt] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [characterPraises, setCharacterPraises] = useState<string[]>([]);
  const [characterErrorMsg, setCharacterErrorMsg] = useState(
    'ごめんなさい、通信の調子が悪いみたいです…。少し待ってからもう一度試してくださいね。'
  );
  const [greetings, setGreetings] = useState<Greetings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // 現在保存済みの褒め言葉/あいさつ等を生成した時のプロンプト。
  // これと一致していれば再生成（=Gemini呼び出し3回）をスキップする。
  const lastGenPromptRef = useRef<string | null>(null);

  const genAI = useMemo(
    () => (geminiApiKey.trim() ? new GoogleGenerativeAI(geminiApiKey.trim()) : null),
    [geminiApiKey]
  );

  const loadSettings = useCallback(async () => {
    try {
      const [a, p, c, n, pr, err, gr, key] = await Promise.all([
        AsyncStorage.getItem(KEYS.avatar),
        AsyncStorage.getItem(KEYS.prompt),
        AsyncStorage.getItem(KEYS.color),
        AsyncStorage.getItem(KEYS.name),
        AsyncStorage.getItem(KEYS.praises),
        AsyncStorage.getItem(KEYS.errorMsg),
        AsyncStorage.getItem(KEYS.greetings),
        getApiKey(),
      ]);
      if (a) setAiAvatarUri(a);
      if (p) setCustomCharacterPrompt(p);
      // 保存済みテキストはこのプロンプトから生成されたものとみなす（不要な再生成を防ぐ基準）。
      lastGenPromptRef.current = p ?? '';
      if (c) setThemeColor(c);
      if (n) setAiName(n);
      if (key) setGeminiApiKey(key);
      if (pr) {
        try {
          const parsed = JSON.parse(pr);
          if (Array.isArray(parsed)) setCharacterPraises(parsed);
        } catch (e) {
          console.error('Praises parse error', e);
        }
      }
      if (err) setCharacterErrorMsg(err);
      if (gr) {
        try {
          const parsed = JSON.parse(gr);
          if (parsed) setGreetings(parsed);
        } catch (e) {
          console.error('Greetings parse error', e);
        }
      }
    } catch (e) {
      console.error('AsyncStorage load error', e);
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  const generateBackgroundTexts = useCallback(async (prompt: string) => {
    if (!genAI) return;
    try {
      const sys = `【設定】${prompt}\n上記の設定になりきって、以下の指示に従って出力してください。`;
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: sys });

      const [resPraise, resError, resGreet] = await Promise.all([
        withRetry(() => model.generateContent([{ text: 'タスク完了時にかける短い褒め言葉（10文字以内）を5つ、カンマ(,)区切りで出力して。例: ナイス！,えらい！,すごい！,お疲れ様！,完璧！' }])),
        withRetry(() => model.generateContent([{ text: '自分が通信エラーやシステムエラーで上手く返答できなかったときの謝罪セリフを1つ教えて。キャラクターの口調で、時間を置いてから再試行するように促して。長すぎず、1〜2文程度で。' }])),
        withRetry(() => model.generateContent([{ text: 'あなたのキャラクターになりきって、朝(5〜11時)、昼(11〜17時)、夜(17〜23時)、深夜(23〜5時)の挨拶を各2パターン、計8つ考えて。JSON形式で出力して。フォーマット: {"morning": ["...", "..."], "afternoon": ["...", "..."], "evening": ["...", "..."], "night": ["...", "..."]}' }])),
      ]);
      // 生成に成功したのでこのプロンプトを基準として記録（以降同じ内容では再生成しない）。
      lastGenPromptRef.current = prompt;

      const list = resPraise.response.text().split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (list.length >= 3) {
        await AsyncStorage.setItem(KEYS.praises, JSON.stringify(list));
        setCharacterPraises(list);
      }

      const errMsg = resError.response.text().trim();
      if (errMsg) {
        await AsyncStorage.setItem(KEYS.errorMsg, errMsg);
        setCharacterErrorMsg(errMsg);
      }

      try {
        const greetText = resGreet.response.text().match(/\{.*\}/s)?.[0];
        if (greetText) {
          const greetObj = JSON.parse(greetText);
          await AsyncStorage.setItem(KEYS.greetings, JSON.stringify(greetObj));
          setGreetings(greetObj);
        }
      } catch (e) {
        console.error('Greetings parse error:', e);
      }
    } catch (e) {
      console.error('generateBackgroundTexts failed:', e);
    }
  }, [genAI]);

  const saveSettings = useCallback(async (params: SaveParams) => {
    await Promise.all([
      params.aiAvatarUri
        ? AsyncStorage.setItem(KEYS.avatar, params.aiAvatarUri)
        : AsyncStorage.removeItem(KEYS.avatar),
      AsyncStorage.setItem(KEYS.prompt, params.customCharacterPrompt),
      AsyncStorage.setItem(KEYS.color, params.themeColor),
      AsyncStorage.setItem(KEYS.name, params.aiName),
      setApiKey(params.geminiApiKey),
    ]);
    // 褒め言葉・あいさつ等の再生成（Gemini 3 リクエスト）は、
    // プロンプトが変わった時か、まだ生成できていない時だけ行う。
    const promptChanged = params.customCharacterPrompt !== lastGenPromptRef.current;
    const missingTexts = characterPraises.length === 0 || !greetings;
    if (promptChanged || missingTexts) {
      generateBackgroundTexts(params.customCharacterPrompt);
    }
  }, [generateBackgroundTexts, characterPraises, greetings]);

  return {
    themeColor, setThemeColor,
    aiAvatarUri, setAiAvatarUri,
    aiName, setAiName,
    customCharacterPrompt, setCustomCharacterPrompt,
    geminiApiKey, setGeminiApiKey,
    characterPraises,
    characterErrorMsg,
    greetings,
    genAI,
    settingsLoaded,
    loadSettings,
    saveSettings,
  };
}

type SettingsContextValue = ReturnType<typeof useSettingsState>;

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const value = useSettingsState();
  const { loadSettings } = value;

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return React.createElement(SettingsContext.Provider, { value }, children);
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
