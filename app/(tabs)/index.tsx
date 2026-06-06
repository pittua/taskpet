import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { adviceKeyOf, useChat } from '@/hooks/use-chat';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSettings } from '@/hooks/use-settings';
import { useTasks } from '@/hooks/use-tasks';
import type { TaskItem } from '@/types';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LogBox,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import DragList, { type DragListRenderItemInfo } from 'react-native-draglist';
import { SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-url-polyfill/auto';

LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

const THEME_COLORS = ['#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0', '#607D8B', '#F44336'];
const NOTIFY_OPTIONS = [
  { l: 'なし', v: null },
  { l: '予定時刻', v: 0 },
  { l: '10分前', v: 10 },
  { l: '1時間前', v: 60 },
  { l: '1日前', v: 1440 },
];

// TimeIntervalTriggerInput does not include channelId in its TypeScript type,
// but expo-notifications passes it through to Android at runtime.
type AndroidAwareTrigger = Notifications.TimeIntervalTriggerInput & { channelId?: string };

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const baseTheme = Colors[colorScheme ?? 'light'];

  const {
    themeColor, setThemeColor,
    aiAvatarUri, setAiAvatarUri,
    aiName, setAiName,
    customCharacterPrompt, setCustomCharacterPrompt,
    geminiApiKey, setGeminiApiKey,
    characterErrorMsg, greetings, genAI,
    saveSettings,
  } = useSettings();

  const theme = { ...baseTheme, tint: themeColor };
  const effPrompt = customCharacterPrompt.trim() || 'あなたは私専用の優秀なアシスタントです。';

  const { tasks, toastMsg, addTask, deleteTask, reorderTasks, toggleDone, updateTask } = useTasks();

  const {
    chatMessages, isSending, detailComment, setDetailComment, chatListRef,
    generateWelcomeMessage, sendChat, handleDailyReport, fetchDetailComment, resetMessages,
  } = useChat({ genAI, effPrompt, characterErrorMsg, aiName, greetings, tasks });

  // --- UI state ---
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | 'datetime' | null>(null);
  const [notifyMin, setNotifyMin] = useState<number | null>(null);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [customNotifyVal, setCustomNotifyVal] = useState('10');
  const [customNotifyUnit, setCustomNotifyUnit] = useState<'min' | 'hour'>('min');
  const [chatText, setChatText] = useState('');

  // --- Initialization ---
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true, shouldShowBanner: true,
        shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
      }),
    });
    (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
          });
        }
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          const { status: newStatus } = await Notifications.requestPermissionsAsync();
          if (newStatus !== 'granted') {
            Alert.alert('権限エラー', '通知権限が許可されませんでした。アプリの設定から通知をONにしてください。');
          }
        }
      } catch (e) {
        Alert.alert('初期設定エラー', String(e));
      }
    })();
  // Settings and tasks are loaded by their providers; this effect only handles notifications.
  }, []);

  // --- Reschedule notifications when notification-relevant fields change ---
  // 通知に関係するフィールド（未完了・期限・通知タイミング・本文）だけの署名で
  // 依存を絞り、並び替えのような無関係な変化では再スケジュールしない。
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const rescheduleSeq = useRef(0);
  const notifySignature = useMemo(
    () =>
      tasks
        .filter(t => !t.done && t.dueDate && t.notifyMin !== null)
        .map(t => `${t.id}:${t.dueDate}:${t.notifyMin}:${t.text}`)
        .join('|'),
    [tasks]
  );

  useEffect(() => {
    // 連続発火時に古い処理が新しい処理の登録分を消さないよう、世代番号で打ち切る。
    const seq = ++rescheduleSeq.current;
    (async () => {
      try {
        await Notifications.cancelAllScheduledNotificationsAsync();
        if (seq !== rescheduleSeq.current) return;
        const nowTime = Date.now();
        for (const t of tasksRef.current) {
          if (t.done || !t.dueDate || t.notifyMin === null) continue;
          const fireTime = new Date(t.dueDate).getTime() - t.notifyMin * 60000;
          const seconds = Math.floor((fireTime - nowTime) / 1000);
          if (seconds > 60) {
            if (seq !== rescheduleSeq.current) return;
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'タスク期限のお知らせ',
                body: `${t.text}\n（期限: ${new Date(t.dueDate).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}）`,
              },
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds,
                channelId: 'default',
              } as AndroidAwareTrigger,
            });
          }
        }
      } catch (e) {
        Alert.alert('通知エラー', String(e));
      }
    })();
  }, [notifySignature]);

  // --- Generate welcome message when chat first opens ---
  useEffect(() => {
    if (isChatOpen && chatMessages.length === 0) generateWelcomeMessage();
  }, [isChatOpen, chatMessages.length, generateWelcomeMessage]);

  const handleAddTask = () => {
    addTask(text, dueDate, notifyMin);
    setText(''); setDueDate(null); setNotifyMin(null); Keyboard.dismiss();
  };

  const openDetail = (t: TaskItem) => {
    setSelectedTask(t);
    if (t.advice && t.adviceKey === adviceKeyOf(t)) setDetailComment(t.advice);
    else setDetailComment('「🤖 アドバイスをもらう」ボタンを押してね');
  };

  const saveDetail = () => {
    if (selectedTask) updateTask(selectedTask);
    setSelectedTask(null);
  };

  const handleSaveSettings = async () => {
    await saveSettings({ aiAvatarUri, customCharacterPrompt, themeColor, aiName, geminiApiKey });
    resetMessages();
    setIsSettingsOpen(false);
  };

  const confirmDailyReport = () => {
    Alert.alert(
      '日報の送信',
      `今日の実績を${aiName}に報告しますか？`,
      [{ text: 'キャンセル', style: 'cancel' }, { text: '報告する', onPress: handleDailyReport }]
    );
  };

  const applyCustomNotify = () => {
    const val = parseInt(customNotifyVal, 10);
    if (!isNaN(val) && val > 0) {
      setNotifyMin(val * (customNotifyUnit === 'hour' ? 60 : 1));
    }
    setShowNotifyModal(false);
  };

  const handleSendChat = () => {
    sendChat(chatText);
    setChatText('');
    Keyboard.dismiss();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return null; }
  };

  const bg = theme.background;
  const cardBg = colorScheme === 'dark' ? '#1C1F21' : '#F3F5F7';
  const border = colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const muted = colorScheme === 'dark' ? '#aaa' : '#666';
  const chatBg = colorScheme === 'dark' ? '#15181A' : '#EEF3F7';

  return (
    <ThemedView style={{ flex: 1, backgroundColor: bg }}>
      {aiAvatarUri && <Image source={{ uri: aiAvatarUri }} style={styles.bgWatermark} />}

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <View style={styles.container}>
          <View style={{ flex: 1, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 }}>
              <ThemedText type="title" style={{ fontSize: 30 }}>タスク</ThemedText>
              <Pressable
                onPress={() => setIsSettingsOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="設定を開く"
                style={[styles.iconBtn, { borderColor: border, backgroundColor: cardBg }]}
              >
                <ThemedText style={{ color: theme.text }}>⚙</ThemedText>
              </Pressable>
            </View>

            <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
              <TextInput
                value={text} onChangeText={setText}
                placeholder="やることを入力…" placeholderTextColor={muted}
                style={[styles.input, { color: theme.text }]}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable
                  onPress={() => setPickerMode(Platform.OS === 'ios' ? 'datetime' : 'date')}
                  style={[styles.smallBtn, { borderColor: border, flex: 1.2 }]}
                >
                  <ThemedText style={{ color: theme.text, fontSize: 13 }}>
                    📅 {dueDate
                      ? `${dueDate.getMonth() + 1}/${dueDate.getDate()} ${String(dueDate.getHours()).padStart(2, '0')}:${String(dueDate.getMinutes()).padStart(2, '0')}`
                      : '期限'}
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => setShowNotifyModal(true)} style={[styles.smallBtn, { borderColor: border, flex: 1 }]}>
                  <ThemedText style={{ color: theme.text, fontSize: 13 }}>
                    🔔 {notifyMin != null
                      ? (notifyMin >= 60 && notifyMin % 60 === 0 ? `${notifyMin / 60}時間前` : `${notifyMin}分前`)
                      : '通知なし'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={handleAddTask} disabled={!text.trim()}
                  style={[styles.smallBtn, { backgroundColor: text.trim() ? theme.tint : border, flex: 0.8 }]}
                >
                  <ThemedText style={{ color: text.trim() ? '#fff' : muted, fontWeight: 'bold' }}>追加</ThemedText>
                </Pressable>
              </View>
            </View>

            {pickerMode && (
              <DateTimePicker
                value={dueDate ?? new Date()}
                mode={pickerMode}
                display="default"
                onChange={(e, d) => {
                  if (Platform.OS === 'android') {
                    if (e.type === 'set' && d) {
                      if (pickerMode === 'date') {
                        const nd = dueDate ? new Date(dueDate) : new Date();
                        nd.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                        setDueDate(nd);
                        setPickerMode('time');
                      } else if (pickerMode === 'time') {
                        const nd = dueDate ? new Date(dueDate) : new Date();
                        nd.setHours(d.getHours(), d.getMinutes());
                        setDueDate(nd);
                        setPickerMode(null);
                      }
                    } else {
                      setDueDate(null);
                      setPickerMode(null);
                    }
                  } else {
                    if (d) setDueDate(d);
                  }
                }}
              />
            )}

            <DragList
              data={tasks}
              keyExtractor={t => t.id}
              contentContainerStyle={{ gap: 10, paddingBottom: 100 }}
              onReordered={(from, to) => reorderTasks(from, to)}
              renderItem={({ item: t, onDragStart, onDragEnd, isActive }: DragListRenderItemInfo<TaskItem>) => (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: cardBg, borderColor: isActive ? theme.tint : border, flexDirection: 'row', alignItems: 'center' },
                    isActive && { opacity: 0.9, elevation: 6 },
                  ]}
                >
                  <Pressable
                    onPress={() => toggleDone(t.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: t.done }}
                    accessibilityLabel={`${t.text} を${t.done ? '未完了に戻す' : '完了にする'}`}
                    style={{ marginRight: 12 }}
                  >
                    <View style={[styles.check, { borderColor: t.done ? theme.tint : border, backgroundColor: t.done ? theme.tint : 'transparent' }]} />
                  </Pressable>
                  <Pressable style={{ flex: 1 }} onPress={() => openDetail(t)}>
                    <ThemedText style={[{ fontSize: 16 }, t.done && { color: muted, textDecorationLine: 'line-through' }]}>{t.text}</ThemedText>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      {t.dueDate && <ThemedText style={{ color: muted, fontSize: 12 }}>期限: {formatDate(t.dueDate)}</ThemedText>}
                      {t.recurring !== 'none' && <ThemedText style={{ color: theme.tint, fontSize: 12 }}>🔁 {t.recurring === 'daily' ? '毎日' : '毎週'}</ThemedText>}
                    </View>
                  </Pressable>
                  {/* ドラッグハンドル: 長押し/押下でドラッグ開始 */}
                  <Pressable
                    onPressIn={onDragStart}
                    onPressOut={onDragEnd}
                    hitSlop={8}
                    accessibilityLabel="ドラッグして並び替え"
                    style={{ paddingHorizontal: 10, paddingVertical: 8, marginLeft: 4 }}
                  >
                    <ThemedText style={{ color: muted, fontSize: 20 }}>≡</ThemedText>
                  </Pressable>
                </View>
              )}
            />
          </View>

          {toastMsg && (
            <View style={[styles.toast, { backgroundColor: theme.tint }]}>
              <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>{toastMsg}</ThemedText>
            </View>
          )}
          <Pressable
            onPress={() => setIsChatOpen(true)}
            style={[styles.fab, { right: 16, backgroundColor: theme.tint, bottom: 30 }]}
          >
            <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>{aiName}に相談</ThemedText>
          </Pressable>
        </View>

        {/* Task Detail Modal */}
        <Modal visible={!!selectedTask} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setSelectedTask(null)}>
          <Pressable style={styles.modalOverlay} onPress={() => setSelectedTask(null)}>
            <Pressable onPress={e => e.stopPropagation()} style={{ width: '90%', maxHeight: '80%', alignSelf: 'center' }}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={[styles.detailBox, { backgroundColor: cardBg, borderColor: border, margin: 0 }]}
              >
                <ScrollView contentContainerStyle={{ padding: 20 }}>
                  <ThemedText type="subtitle">タスクの編集</ThemedText>
                  {selectedTask && (
                    <>
                      <TextInput
                        value={selectedTask.text}
                        onChangeText={v => setSelectedTask({ ...selectedTask, text: v })}
                        style={[styles.input, { color: theme.text, marginTop: 10, borderColor: border, borderWidth: 1 }]}
                      />
                      <ThemedText style={{ color: muted, marginTop: 10 }}>備考・メモ</ThemedText>
                      <TextInput
                        value={selectedTask.memo}
                        onChangeText={v => setSelectedTask({ ...selectedTask, memo: v })}
                        multiline
                        style={[styles.input, { color: theme.text, height: 120, textAlignVertical: 'top', borderColor: border, borderWidth: 1 }]}
                      />
                      <ThemedText style={{ color: muted, marginTop: 10 }}>繰り返し設定</ThemedText>
                      <View style={{ flexDirection: 'row', gap: 5, marginTop: 5 }}>
                        {(['none', 'daily', 'weekly'] as const).map(r => (
                          <Pressable
                            key={r}
                            onPress={() => setSelectedTask({ ...selectedTask, recurring: r })}
                            style={[styles.smallBtn, { flex: 1, borderColor: border, backgroundColor: selectedTask.recurring === r ? theme.tint : 'transparent' }]}
                          >
                            <ThemedText style={{ color: selectedTask.recurring === r ? '#fff' : theme.text, fontSize: 13 }}>
                              {r === 'none' ? 'なし' : r === 'daily' ? '毎日' : '毎週'}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </View>
                      <View style={[styles.card, { backgroundColor: bg, borderColor: border, marginTop: 15 }]}>
                        <ThemedText style={{ color: theme.tint, fontWeight: 'bold', fontSize: 12, marginBottom: 5 }}>💬 {aiName}からのコメント</ThemedText>
                        <Pressable
                          onPress={async () => {
                            const r = await fetchDetailComment(selectedTask);
                            if (r) {
                              setSelectedTask(prev => (prev ? { ...prev, advice: r.text, adviceKey: r.key } : prev));
                              // 保存済みタスクに advice だけマージして即永続化（「閉じる」してもキャッシュは残る）
                              const stored = tasks.find(t => t.id === selectedTask.id);
                              if (stored) updateTask({ ...stored, advice: r.text, adviceKey: r.key });
                            }
                          }}
                          style={[styles.smallBtn, { marginBottom: 10, backgroundColor: theme.tint, alignSelf: 'flex-start' }]}
                        >
                          <ThemedText style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>🤖 アドバイスをもらう</ThemedText>
                        </Pressable>
                        <ThemedText style={{ color: theme.text, fontSize: 14 }}>{detailComment}</ThemedText>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                        <Pressable
                          onPress={() => { deleteTask(selectedTask.id); setSelectedTask(null); }}
                          style={[styles.smallBtn, { flex: 0.8, borderColor: border, backgroundColor: '#FF6B6B' }]}
                        >
                          <ThemedText style={{ color: '#fff' }}>削除</ThemedText>
                        </Pressable>
                        <Pressable onPress={() => setSelectedTask(null)} style={[styles.smallBtn, { flex: 1, borderColor: border }]}>
                          <ThemedText style={{ color: theme.text }}>閉じる</ThemedText>
                        </Pressable>
                        <Pressable onPress={saveDetail} style={[styles.smallBtn, { flex: 1.5, backgroundColor: theme.tint }]}>
                          <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>保存</ThemedText>
                        </Pressable>
                      </View>
                    </>
                  )}
                </ScrollView>
              </KeyboardAvoidingView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Notify Picker Modal */}
        <Modal visible={showNotifyModal} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setShowNotifyModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowNotifyModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={{ width: '90%', maxHeight: '60%', alignSelf: 'center' }}>
              <View style={[styles.detailBox, { backgroundColor: cardBg, borderColor: border, margin: 0 }]}>
                <ScrollView contentContainerStyle={{ padding: 20 }}>
                  <ThemedText type="subtitle" style={{ marginBottom: 10 }}>通知のタイミング</ThemedText>
                  {NOTIFY_OPTIONS.map(o => (
                    <Pressable
                      key={o.l}
                      onPress={() => { setNotifyMin(o.v); setShowNotifyModal(false); }}
                      style={{ padding: 15, borderBottomWidth: 1, borderColor: border }}
                    >
                      <ThemedText style={{ color: theme.text }}>{o.l}</ThemedText>
                    </Pressable>
                  ))}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 15 }}>
                    <TextInput
                      value={customNotifyVal}
                      onChangeText={setCustomNotifyVal}
                      keyboardType="number-pad"
                      style={[styles.input, { flex: 1, color: theme.text, borderColor: border, borderWidth: 1 }]}
                    />
                    <Pressable
                      onPress={() => setCustomNotifyUnit(u => u === 'min' ? 'hour' : 'min')}
                      style={[styles.smallBtn, { borderColor: border, paddingHorizontal: 12 }]}
                    >
                      <ThemedText style={{ color: theme.text }}>{customNotifyUnit === 'min' ? '分前' : '時間前'} 🔃</ThemedText>
                    </Pressable>
                    <Pressable onPress={applyCustomNotify} style={[styles.smallBtn, { backgroundColor: theme.tint }]}>
                      <ThemedText style={{ color: '#fff' }}>決定</ThemedText>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Chat Modal */}
        <Modal visible={isChatOpen} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setIsChatOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}
          >
            <Pressable style={{ flex: 1 }} onPress={() => setIsChatOpen(false)} />
            <View style={[styles.chatDock, { height: isChatExpanded ? '85%' : '60%', backgroundColor: chatBg, borderColor: border }]}>
              <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1 }}>
                <View style={{ flex: 1, padding: 15 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <ThemedText type="subtitle" style={{ flex: 1 }} numberOfLines={1}>{aiName}とのチャット</ThemedText>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Pressable onPress={confirmDailyReport} style={[styles.smallBtn, { backgroundColor: theme.tint, paddingHorizontal: 10, paddingVertical: 8 }]}>
                        <ThemedText style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>📝日報</ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => setIsChatExpanded(e => !e)}
                        accessibilityRole="button"
                        accessibilityLabel={isChatExpanded ? 'チャットを縮小' : 'チャットを拡大'}
                        style={[styles.iconBtn, { borderColor: border }]}
                      >
                        <ThemedText style={{ color: theme.text }}>{isChatExpanded ? '▼' : '▲'}</ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => setIsChatOpen(false)}
                        accessibilityRole="button"
                        accessibilityLabel="チャットを閉じる"
                        style={[styles.iconBtn, { borderColor: border }]}
                      >
                        <ThemedText style={{ color: theme.text }}>✕</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                  <FlatList
                    ref={chatListRef}
                    data={chatMessages}
                    keyExtractor={m => m.id}
                    contentContainerStyle={{ gap: 10, paddingBottom: 10 }}
                    renderItem={({ item: m }) => (
                      <View style={{ flexDirection: 'row', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }}>
                        {m.role === 'model' && (
                          aiAvatarUri
                            ? <Image source={{ uri: aiAvatarUri }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                            : <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: border, alignItems: 'center', justifyContent: 'center' }}>
                                <ThemedText style={{ fontSize: 18, color: theme.text }}>{aiName.charAt(0)}</ThemedText>
                              </View>
                        )}
                        <View style={{ maxWidth: '80%', padding: 12, borderRadius: 16, backgroundColor: m.role === 'user' ? theme.tint : cardBg, borderWidth: 1, borderColor: border }}>
                          <ThemedText style={{ color: m.role === 'user' ? '#fff' : theme.text, fontSize: 15 }}>{m.text}</ThemedText>
                        </View>
                      </View>
                    )}
                    ListFooterComponent={
                      isSending
                        ? <View style={{ flexDirection: 'row', gap: 5, padding: 10 }}>
                            <ActivityIndicator size="small" />
                            <ThemedText style={{ color: muted }}>考え中...</ThemedText>
                          </View>
                        : null
                    }
                  />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
                    <TextInput
                      value={chatText} onChangeText={setChatText} multiline
                      placeholder={`${aiName}にメッセージ…`} placeholderTextColor={muted}
                      style={[styles.input, { flex: 1, color: theme.text, backgroundColor: cardBg, borderColor: border, borderWidth: 1, minHeight: 44, maxHeight: 100, paddingTop: 12 }]}
                    />
                    <Pressable
                      onPress={handleSendChat}
                      style={[styles.smallBtn, { backgroundColor: chatText.trim() && !isSending ? theme.tint : border, height: 44 }]}
                    >
                      <ThemedText style={{ color: chatText.trim() && !isSending ? '#fff' : muted, fontWeight: 'bold' }}>送信</ThemedText>
                    </Pressable>
                  </View>
                </View>
              </SafeAreaView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Settings Modal */}
        <Modal visible={isSettingsOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleSaveSettings}>
          <ThemedView style={{ flex: 1, backgroundColor: bg }}>
            <SafeAreaView style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, alignItems: 'center' }}>
                <ThemedText type="title">設定</ThemedText>
                <Pressable onPress={handleSaveSettings} style={[styles.smallBtn, { backgroundColor: theme.tint }]}>
                  <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>保存して閉じる</ThemedText>
                </Pressable>
              </View>
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              >
              <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                  <ThemedText type="subtitle">Gemini APIキー</ThemedText>
                  <TextInput
                    value={geminiApiKey}
                    onChangeText={setGeminiApiKey}
                    placeholder="AIza..."
                    placeholderTextColor={muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    style={[styles.input, { color: theme.text, marginTop: 10, borderColor: border, borderWidth: 1 }]}
                  />
                  <ThemedText style={{ color: muted, fontSize: 12, marginTop: 8 }}>
                    AI機能の利用にはご自身のGemini APIキーが必要です。Google AI Studio（aistudio.google.com/apikey）で無料で取得できます。キーはこの端末内にのみ保存されます。
                  </ThemedText>
                  {!geminiApiKey.trim() && (
                    <ThemedText style={{ color: '#FF9800', fontSize: 12, marginTop: 6 }}>
                      ⚠ キー未設定のため、チャット・褒め言葉・あいさつなどのAI機能は使えません。
                    </ThemedText>
                  )}
                </View>
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                  <ThemedText type="subtitle">AIの名前 (10文字以内)</ThemedText>
                  <TextInput value={aiName} onChangeText={setAiName} maxLength={10} style={[styles.input, { color: theme.text, marginTop: 10, borderColor: border, borderWidth: 1 }]} />
                </View>
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                  <ThemedText type="subtitle">AI画像</ThemedText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
                    {aiAvatarUri
                      ? <Image source={{ uri: aiAvatarUri }} style={{ width: 60, height: 60, borderRadius: 30 }} />
                      : <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: border, alignItems: 'center', justifyContent: 'center' }}>
                          <ThemedText style={{ color: theme.text }}>{aiName.charAt(0)}</ThemedText>
                        </View>
                    }
                    <Pressable
                      onPress={async () => {
                        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] });
                        if (!r.canceled) setAiAvatarUri(r.assets[0].uri);
                      }}
                      style={[styles.smallBtn, { borderColor: border }]}
                    >
                      <ThemedText style={{ color: theme.text }}>選ぶ</ThemedText>
                    </Pressable>
                    <Pressable onPress={() => setAiAvatarUri(null)} style={[styles.smallBtn, { borderColor: border }]}>
                      <ThemedText style={{ color: muted }}>クリア</ThemedText>
                    </Pressable>
                  </View>
                </View>
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                  <ThemedText type="subtitle">AIキャラクター設定</ThemedText>
                  <TextInput
                    value={customCharacterPrompt} onChangeText={setCustomCharacterPrompt} multiline
                    style={[styles.input, { color: theme.text, marginTop: 10, height: 100, textAlignVertical: 'top', borderColor: border, borderWidth: 1 }]}
                  />
                </View>
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                  <ThemedText type="subtitle">推し色</ThemedText>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 }}>
                    {THEME_COLORS.map(c => (
                      <Pressable key={c} onPress={() => setThemeColor(c)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c, borderWidth: themeColor === c ? 3 : 0, borderColor: theme.text }} />
                    ))}
                  </View>
                </View>
              </ScrollView>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </ThemedView>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  bgWatermark: { position: 'absolute', width: '100%', height: '100%', opacity: 0.08, resizeMode: 'cover' },
  container: { flex: 1, paddingHorizontal: 16 },
  card: { padding: 14, borderRadius: 16, borderWidth: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  input: { fontSize: 16, padding: 12, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.02)' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2 },
  fab: { position: 'absolute', paddingHorizontal: 20, paddingVertical: 15, borderRadius: 30, elevation: 5, shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 4 } },
  toast: { position: 'absolute', top: 60, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, elevation: 10, zIndex: 100 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' },
  detailBox: { margin: 20, padding: 20, borderRadius: 20, borderWidth: 1 },
  chatDock: { width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderBottomWidth: 0 },
});
