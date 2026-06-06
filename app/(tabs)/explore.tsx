import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTasks } from '@/hooks/use-tasks';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function StatsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  // Tasks are shared via TasksProvider, so the list stays in sync automatically.
  const { tasks, completedLog } = useTasks();

  const cardBg = colorScheme === 'dark' ? '#1C1F21' : '#F3F5F7';
  const border = colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const muted = colorScheme === 'dark' ? '#aaa' : '#666';
  const todayStr = new Date().toDateString();

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter(t => t.done).length;
    const pending = total - done;
    // 今日の達成・累計は完了ログ（永続）から。タスクを削除しても減らない。
    const doneToday = completedLog[todayStr] ?? 0;
    const totalCompleted = Object.values(completedLog).reduce((a, b) => a + b, 0);
    const overdue = tasks.filter(t => !t.done && t.dueDate && new Date(t.dueDate) < new Date()).length;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    const recentDone = tasks
      .filter(t => t.done && t.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
      .slice(0, 5);
    return { total, done, pending, doneToday, totalCompleted, overdue, rate, recentDone };
  }, [tasks, completedLog, todayStr]);

  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
          <ThemedText type="title" style={{ marginTop: 15, fontSize: 30 }}>統計</ThemedText>

          {/* Today's & all-time achievement (from the persistent completion log) */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={[styles.card, { flex: 1, backgroundColor: cardBg, borderColor: border }]}>
              <ThemedText style={{ color: muted, fontSize: 13 }}>今日の達成</ThemedText>
              <ThemedText style={{ fontSize: 44, lineHeight: 52, fontWeight: 'bold', color: theme.tint, marginTop: 4 }}>
                {stats.doneToday}
              </ThemedText>
              <ThemedText style={{ color: muted }}>タスク完了</ThemedText>
            </View>
            <View style={[styles.card, { flex: 1, backgroundColor: cardBg, borderColor: border }]}>
              <ThemedText style={{ color: muted, fontSize: 13 }}>累計完了</ThemedText>
              <ThemedText style={{ fontSize: 44, lineHeight: 52, fontWeight: 'bold', color: '#4CAF50', marginTop: 4 }}>
                {stats.totalCompleted}
              </ThemedText>
              <ThemedText style={{ color: muted }}>これまで</ThemedText>
            </View>
          </View>

          {/* Counts row */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={[styles.card, { flex: 1, backgroundColor: cardBg, borderColor: border }]}>
              <ThemedText style={{ color: muted, fontSize: 12 }}>総タスク</ThemedText>
              <ThemedText style={{ fontSize: 28, lineHeight: 34, fontWeight: 'bold', color: theme.text }}>{stats.total}</ThemedText>
            </View>
            <View style={[styles.card, { flex: 1, backgroundColor: cardBg, borderColor: border }]}>
              <ThemedText style={{ color: muted, fontSize: 12 }}>完了</ThemedText>
              <ThemedText style={{ fontSize: 28, lineHeight: 34, fontWeight: 'bold', color: '#4CAF50' }}>{stats.done}</ThemedText>
            </View>
            <View style={[styles.card, { flex: 1, backgroundColor: cardBg, borderColor: border }]}>
              <ThemedText style={{ color: muted, fontSize: 12 }}>未完了</ThemedText>
              <ThemedText style={{ fontSize: 28, lineHeight: 34, fontWeight: 'bold', color: theme.text }}>{stats.pending}</ThemedText>
            </View>
          </View>

          {/* Overdue */}
          {stats.overdue > 0 && (
            <View style={[styles.card, { backgroundColor: '#FF6B6B22', borderColor: '#FF6B6B55' }]}>
              <ThemedText style={{ color: '#FF6B6B', fontWeight: 'bold' }}>
                ⚠ 期限切れのタスクが {stats.overdue} 件あります
              </ThemedText>
            </View>
          )}

          {/* Completion rate */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
            <ThemedText type="subtitle">完了率</ThemedText>
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <ThemedText style={{ color: muted }}>{stats.done} / {stats.total} タスク</ThemedText>
                <ThemedText style={{ color: theme.tint, fontWeight: 'bold', fontSize: 16 }}>{stats.rate}%</ThemedText>
              </View>
              <View style={{ height: 10, backgroundColor: border, borderRadius: 5 }}>
                <View style={{ height: 10, borderRadius: 5, backgroundColor: theme.tint, width: `${stats.rate}%` }} />
              </View>
            </View>
          </View>

          {/* Recently completed */}
          {stats.recentDone.length > 0 && (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
              <ThemedText type="subtitle" style={{ marginBottom: 10 }}>最近完了したタスク</ThemedText>
              {stats.recentDone.map(t => (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: border }}>
                  <ThemedText style={{ color: '#4CAF50', marginRight: 8 }}>✓</ThemedText>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ color: theme.text }}>{t.text}</ThemedText>
                    {t.completedAt && (
                      <ThemedText style={{ color: muted, fontSize: 11 }}>
                        {new Date(t.completedAt).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </ThemedText>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {stats.total === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ThemedText style={{ color: muted, fontSize: 16 }}>まだタスクがありません</ThemedText>
              <ThemedText style={{ color: muted, marginTop: 8 }}>ホームタブからタスクを追加しよう！</ThemedText>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, borderWidth: 1 },
});
