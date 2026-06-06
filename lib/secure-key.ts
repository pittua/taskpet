import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Gemini APIキーの保存先。ネイティブでは OS のキーストア（暗号化）に保存し、
// 旧バージョンが AsyncStorage に平文で保存していたキーは初回読み込み時に移行する。
// web は SecureStore 非対応のため AsyncStorage にフォールバックする。
const SECURE_KEY = 'set.apiKey'; // SecureStore のスロット名（英数 . - _ のみ可）
const LEGACY_KEY = 'set.apiKey'; // 旧 AsyncStorage のキー名

const isWeb = Platform.OS === 'web';

export async function getApiKey(): Promise<string | null> {
  if (isWeb) return AsyncStorage.getItem(LEGACY_KEY);
  try {
    const secure = await SecureStore.getItemAsync(SECURE_KEY);
    if (secure != null) return secure;
    // 平文の旧キーがあればキーストアへ移行し、平文側は消す。
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy != null) {
      await SecureStore.setItemAsync(SECURE_KEY, legacy);
      await AsyncStorage.removeItem(LEGACY_KEY);
      return legacy;
    }
    return null;
  } catch {
    // キーストアが使えない端末では平文ストレージにフォールバック。
    return AsyncStorage.getItem(LEGACY_KEY);
  }
}

export async function setApiKey(value: string): Promise<void> {
  const v = value.trim();
  if (isWeb) {
    if (v) await AsyncStorage.setItem(LEGACY_KEY, v);
    else await AsyncStorage.removeItem(LEGACY_KEY);
    return;
  }
  try {
    if (v) await SecureStore.setItemAsync(SECURE_KEY, v);
    else await SecureStore.deleteItemAsync(SECURE_KEY);
    // 平文のコピーが残らないよう旧キーは常に削除する。
    await AsyncStorage.removeItem(LEGACY_KEY);
  } catch {
    if (v) await AsyncStorage.setItem(LEGACY_KEY, v);
    else await AsyncStorage.removeItem(LEGACY_KEY);
  }
}
