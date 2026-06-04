import { GoogleGenerativeAI } from '@google/generative-ai';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Greetings } from '@/types';

const KEYS = {
  avatar: 'set.avatar',
  prompt: 'set.prompt',
  color: 'set.color',
  name: 'set.name',
  praises: 'set.praises',
  errorMsg: 'set.errorMsg',
  greetings: 'set.greetings',
  apiKey: 'set.apiKey',
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
        AsyncStorage.getItem(KEYS.apiKey),
      ]);
      if (a) setAiAvatarUri(a);
      if (p) setCustomCharacterPrompt(p);
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
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', systemInstruction: sys });

      const [resPraise, resError, resGreet] = await Promise.all([
        model.generateContent([{ text: 'タスク完了時にかける短い褒め言葉（10文字以内）を5つ、カンマ(,)区切りで出力して。例: ナイス！,えらい！,すごい！,お疲れ様！,完璧！' }]),
        model.generateContent([{ text: '自分が通信エラーやシステムエラーで上手く返答できなかったときの謝罪セリフを1つ教えて。キャラクターの口調で、時間を置いてから再試行するように促して。長すぎず、1〜2文程度で。' }]),
        model.generateContent([{ text: 'あなたのキャラクターになりきって、朝(5〜11時)、昼(11〜17時)、夜(17〜23時)、深夜(23〜5時)の挨拶を各2パターン、計8つ考えて。JSON形式で出力して。フォーマット: {"morning": ["...", "..."], "afternoon": ["...", "..."], "evening": ["...", "..."], "night": ["...", "..."]}' }]),
      ]);

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
      params.geminiApiKey.trim()
        ? AsyncStorage.setItem(KEYS.apiKey, params.geminiApiKey.trim())
        : AsyncStorage.removeItem(KEYS.apiKey),
    ]);
    generateBackgroundTexts(params.customCharacterPrompt);
  }, [generateBackgroundTexts]);

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
