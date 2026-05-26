import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { WebView } from 'react-native-webview';
import { buildTrackerHtml } from './web/trackerHtml';
import { buildGameHtml } from './web/gameHtml';

type Mode = 'home' | 'tracker' | 'game';

const DEFAULT_RELAY = 'ws://172.20.10.10:8787';
const DEFAULT_ROOM = 'hockey-test';

export default function App() {
  useKeepAwake();

  const [mode, setMode] = useState<Mode>('home');
  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY);
  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [fieldLengthCm, setFieldLengthCm] = useState('180');
  const [fieldWidthCm, setFieldWidthCm] = useState('80');
  const [puckDiameterCm, setPuckDiameterCm] = useState('7.5');

  const numericConfig = useMemo(() => ({
    relayUrl: relayUrl.trim(),
    room: room.trim() || DEFAULT_ROOM,
    fieldLengthCm: clampNumber(fieldLengthCm, 100, 233, 180),
    fieldWidthCm: clampNumber(fieldWidthCm, 50, 100, 80),
    puckDiameterCm: clampNumber(puckDiameterCm, 5, 10, 7.5)
  }), [relayUrl, room, fieldLengthCm, fieldWidthCm, puckDiameterCm]);

  const trackerHtml = useMemo(() => buildTrackerHtml(numericConfig), [numericConfig]);
  const gameHtml = useMemo(() => buildGameHtml({ relayUrl: numericConfig.relayUrl, room: numericConfig.room }), [numericConfig.relayUrl, numericConfig.room]);

  const webViewRef = useRef<WebView>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const postToWebView = useCallback((payload: unknown) => {
    const json = JSON.stringify(payload).replace(/</g, '\\u003c');
    webViewRef.current?.injectJavaScript(`window.HR_NATIVE_WS && window.HR_NATIVE_WS(${json}); true;`);
  }, []);

  const closeNativeWs = useCallback(() => {
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
  }, []);

  const connectNativeWs = useCallback((role: 'tracker' | 'game') => {
    closeNativeWs();
    postToWebView({ channel: 'hr-ws', type: 'status', status: 'connecting' });

    try {
      const ws = new WebSocket(numericConfig.relayUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        postToWebView({ channel: 'hr-ws', type: 'status', status: 'connected' });
        ws.send(JSON.stringify({
          type: 'hello',
          role,
          room: numericConfig.room,
          ts: Date.now()
        }));
      };

      ws.onmessage = (event) => {
        postToWebView({ channel: 'hr-ws', type: 'message', data: String(event.data) });
      };

      ws.onerror = () => {
        postToWebView({ channel: 'hr-ws', type: 'status', status: 'error' });
      };

      ws.onclose = () => {
        postToWebView({ channel: 'hr-ws', type: 'status', status: 'closed' });
      };
    } catch (error) {
      postToWebView({
        channel: 'hr-ws',
        type: 'status',
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }, [closeNativeWs, numericConfig.relayUrl, numericConfig.room, postToWebView]);

  const handleBridgeMessage = useCallback((role: 'tracker' | 'game', data: string) => {
    try {
      const msg = JSON.parse(data);
      if (msg?.channel === 'hr-ws') {
        if (msg.action === 'connect') {
          connectNativeWs(role);
          return;
        }

        if (msg.action === 'send') {
          const socket = wsRef.current;
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msg.payload));
          } else {
            postToWebView({ channel: 'hr-ws', type: 'status', status: 'closed' });
          }
          return;
        }
      }
    } catch {
      // Plain log message from the WebView.
    }

    console.log(`[${role}]`, data);
  }, [connectNativeWs, postToWebView]);

  if (mode === 'tracker') {
    return (
      <SafeAreaView style={styles.shell}>
        <ExpoStatusBar style="light" />
        <Header title="Телефон-трекер" onBack={() => setMode('home')} />
        <WebView
          ref={webViewRef}
          style={styles.webview}
          source={{ html: trackerHtml, baseUrl: 'https://hockey-runner.local' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          onMessage={(event) => handleBridgeMessage('tracker', event.nativeEvent.data)}
        />
      </SafeAreaView>
    );
  }

  if (mode === 'game') {
    return (
      <SafeAreaView style={styles.shell}>
        <ExpoStatusBar style="light" />
        <Header title="Экран игры" onBack={() => setMode('home')} />
        <WebView
          ref={webViewRef}
          style={styles.webview}
          source={{ html: gameHtml, baseUrl: 'https://hockey-runner.local' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          onMessage={(event) => handleBridgeMessage('game', event.nativeEvent.data)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="light-content" />
      <ExpoStatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.homeContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>🏒 Hockey Runner</Text>
          <Text style={styles.subtitle}>MVP: калибровка поля, распознавание темной круглой шайбы и игра на втором устройстве.</Text>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>1. Связь устройств</Text>
            <Text style={styles.label}>Relay WebSocket URL на MacBook</Text>
            <TextInput
              style={styles.input}
              value={relayUrl}
              onChangeText={setRelayUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="ws://IP_ВАШЕГО_MAC:8787"
              placeholderTextColor="#6b7280"
            />
            <Text style={styles.hint}>iPhone и iPad/Mac должны быть в одной Wi‑Fi сети. На iPhone нельзя писать localhost — нужен IP MacBook.</Text>

            <Text style={styles.label}>Комната</Text>
            <TextInput
              style={styles.input}
              value={room}
              onChangeText={setRoom}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="hockey-test"
              placeholderTextColor="#6b7280"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>2. Размер поля и шайбы</Text>
            <View style={styles.row}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Длина, см</Text>
                <TextInput style={styles.input} value={fieldLengthCm} onChangeText={setFieldLengthCm} keyboardType="decimal-pad" />
                <Text style={styles.hint}>100–233</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Ширина, см</Text>
                <TextInput style={styles.input} value={fieldWidthCm} onChangeText={setFieldWidthCm} keyboardType="decimal-pad" />
                <Text style={styles.hint}>50–100</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Шайба, см</Text>
                <TextInput style={styles.input} value={puckDiameterCm} onChangeText={setPuckDiameterCm} keyboardType="decimal-pad" />
                <Text style={styles.hint}>примерно 7.5</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>3. Запуск режима</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setMode('tracker')}>
              <Text style={styles.primaryButtonText}>Открыть телефон‑трекер</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setMode('game')}>
              <Text style={styles.secondaryButtonText}>Открыть экран игры</Text>
            </TouchableOpacity>
            <View style={styles.disabledNotice}>
              <Text style={styles.disabledNoticeText}>
                Native iOS-трекер подключим после обучения и добавления CoreML-модели.
              </Text>
            </View>
            <Text style={styles.hint}>Для первого теста можно открыть игру на Mac через симулятор/Xcode или на iPad. Затем вывести экран игры на ТВ кабелем HDMI или AirPlay.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>← Назад</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function clampNumber(value: string, min: number, max: number, fallback: number) {
  const normalized = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(min, Math.min(max, normalized));
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  safeArea: {
    flex: 1,
  },
  shell: {
    flex: 1,
    backgroundColor: '#08111f'
  },
  homeContent: {
    padding: 18,
    gap: 16
  },
  logo: {
    color: '#f8fafc',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 780
  },
  card: {
    backgroundColor: '#101d31',
    borderColor: '#24344e',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10
  },
  sectionTitle: {
    color: '#f8fafc',
    fontWeight: '800',
    fontSize: 18
  },
  label: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4
  },
  input: {
    backgroundColor: '#06101f',
    color: '#f8fafc',
    borderColor: '#2b4263',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16
  },
  hint: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18
  },
  row: {
    flexDirection: 'row',
    gap: 10
  },
  fieldGroup: {
    flex: 1
  },
  primaryButton: {
    backgroundColor: '#38bdf8',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#06101f',
    fontSize: 16,
    fontWeight: '900'
  },
  secondaryButton: {
    backgroundColor: '#0f172a',
    borderColor: '#38bdf8',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#e0f2fe',
    fontSize: 16,
    fontWeight: '900'
  },
  disabledNotice: {
    marginTop: 4,
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#0f172a',
  },
  disabledNoticeText: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  header: {
    height: 54,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#08111f'
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#0f172a',
    borderRadius: 10
  },
  backText: {
    color: '#e0f2fe',
    fontWeight: '800'
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '900'
  },
  headerSpacer: {
    width: 84
  },
  webview: {
    flex: 1,
    backgroundColor: '#020617'
  }
});
