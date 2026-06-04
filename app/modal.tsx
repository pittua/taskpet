import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

export default function AboutModal() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const border = colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const cardBg = colorScheme === 'dark' ? '#1C1F21' : '#F3F5F7';
  const muted = colorScheme === 'dark' ? '#aaa' : '#666';

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={{ marginBottom: 24 }}>このアプリについて</ThemedText>

      <View style={[styles.card, { backgroundColor: cardBg, borderColor: border, marginBottom: 16 }]}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>AIタスク管理</ThemedText>
        <ThemedText style={{ color: muted, lineHeight: 22 }}>
          Gemini APIを使ったAIアシスタント付きタスク管理アプリです。
          キャラクター設定でAIの名前や口調をカスタマイズできます。
        </ThemedText>
      </View>

      <View style={[styles.card, { backgroundColor: cardBg, borderColor: border, marginBottom: 16 }]}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>主な機能</ThemedText>
        {[
          '✅ タスクの追加・編集・削除',
          '🔔 期限通知',
          '🔁 繰り返しタスク',
          '🤖 AIによるアドバイス',
          '💬 AIとのチャット',
          '📝 日報機能',
        ].map(item => (
          <ThemedText key={item} style={{ color: theme.text, marginBottom: 6 }}>{item}</ThemedText>
        ))}
      </View>

      <Link href="/" dismissTo style={styles.link}>
        <ThemedText type="link">閉じる</ThemedText>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 48 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1 },
  link: { marginTop: 24, alignSelf: 'center' },
});
