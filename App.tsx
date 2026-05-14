import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

type Marker = {
  id: string;
  label: string;
  time: number; // seconds
};

type RecordingItem = {
  id: string;
  title: string;
  uri: string;
  createdAt: number;
  durationSeconds: number;
  markers: Marker[];
};

const STORAGE_KEY = 'marker-recorder-recordings-v1';
const EPSILON_SECONDS = 0.12;

export default function App() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [currentMarkers, setCurrentMarkers] = useState<Marker[]>([]);
  const [selectedMarkerIndex, setSelectedMarkerIndex] = useState(0);
  const [isSegmentPlayback, setIsSegmentPlayback] = useState(false);
  const [segmentEndTime, setSegmentEndTime] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [storageLoaded, setStorageLoaded] = useState(false);

  const activeRecording = useMemo(
    () => recordings.find((item) => item.id === activeRecordingId) ?? null,
    [activeRecordingId, recordings],
  );

  const hasReviewableAudio = !!activeRecording;

  useEffect(() => {
    (async () => {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Mikrofón nie je povolený', 'Bez povolenia mikrofónu sa nedá nahrávať.');
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
    })().catch((error) => {
      console.error(error);
      Alert.alert('Chyba inicializácie', 'Nepodarilo sa pripraviť audio režim aplikácie.');
    });
  }, []);

  useEffect(() => {
    loadSavedRecordings().catch((error) => {
      console.error(error);
      Alert.alert('Chyba načítania', 'Nepodarilo sa načítať uložené nahrávky.');
      setStorageLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    persistRecordings().catch((error) => {
      console.error(error);
      Alert.alert('Chyba ukladania', 'Nepodarilo sa uložiť zoznam nahrávok.');
    });
  }, [recordings, storageLoaded]);

  useEffect(() => {
    if (!activeRecording) {
      setDraftTitle('');
      setCurrentMarkers([]);
      setSelectedMarkerIndex(0);
      player.pause();
      return;
    }

    setDraftTitle(activeRecording.title);
    setCurrentMarkers(activeRecording.markers);
    setSelectedMarkerIndex(0);
    setIsSegmentPlayback(false);
    setSegmentEndTime(null);
    player.pause();
    player.replace({ uri: activeRecording.uri, name: activeRecording.title });
    void player.seekTo(0);
  }, [activeRecordingId]);

  useEffect(() => {
    if (!playerStatus.playing || !isSegmentPlayback || segmentEndTime == null) {
      return;
    }

    if (playerStatus.currentTime >= segmentEndTime - EPSILON_SECONDS) {
      player.pause();
      void player.seekTo(segmentEndTime);
      setIsSegmentPlayback(false);
      moveSelectionToClosestMarkerAtOrBefore(segmentEndTime);
    }
  }, [
    isSegmentPlayback,
    player,
    playerStatus.currentTime,
    playerStatus.playing,
    segmentEndTime,
    currentMarkers,
  ]);

  const segments = useMemo(() => {
    if (!currentMarkers.length) return [];

    return currentMarkers.map((marker, index) => ({
      ...marker,
      endTime: currentMarkers[index + 1]?.time ?? activeRecording?.durationSeconds ?? 0,
    }));
  }, [activeRecording?.durationSeconds, currentMarkers]);

  function moveSelectionToClosestMarkerAtOrBefore(time: number) {
    const foundIndex = currentMarkers.reduce((bestIndex, marker, index) => {
      if (marker.time <= time + EPSILON_SECONDS) {
        return index;
      }
      return bestIndex;
    }, 0);
    setSelectedMarkerIndex(foundIndex);
  }

  async function loadSavedRecordings() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setStorageLoaded(true);
      return;
    }

    const parsed = JSON.parse(raw) as RecordingItem[];
    const sorted = parsed.sort((a, b) => b.createdAt - a.createdAt);
    setRecordings(sorted);
    setActiveRecordingId(sorted[0]?.id ?? null);
    setStorageLoaded(true);
  }

  async function persistRecordings() {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recordings));
  }

  async function startRecording() {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      setCurrentMarkers([{ id: 'start', label: 'Začiatok', time: 0 }]);
      setSelectedMarkerIndex(0);
      setIsSegmentPlayback(false);
      setSegmentEndTime(null);
      player.pause();

      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error) {
      console.error(error);
      Alert.alert('Nahrávanie sa nespustilo', 'Skús to prosím ešte raz.');
    }
  }

  async function stopRecording() {
    try {
      await recorder.stop();
      const uri = recorder.uri || recorderState.url;
      if (!uri) {
        Alert.alert('Nahrávka sa nenašla', 'Súbor s nahrávkou sa nepodarilo získať.');
        return;
      }

      const durationSeconds = Math.max(0, recorderState.durationMillis / 1000);
      const createdAt = Date.now();
      const newRecording: RecordingItem = {
        id: `rec-${createdAt}`,
        title: `Nahrávka ${formatDate(createdAt)}`,
        uri,
        createdAt,
        durationSeconds,
        markers: currentMarkers,
      };

      const nextRecordings = [newRecording, ...recordings];
      setRecordings(nextRecordings);
      setActiveRecordingId(newRecording.id);
      player.replace({ uri, name: newRecording.title });
      await player.seekTo(0);
      setSelectedMarkerIndex(0);
      setIsSegmentPlayback(false);
      setSegmentEndTime(null);
    } catch (error) {
      console.error(error);
      Alert.alert('Nahrávanie sa nezastavilo korektne', 'Skús to prosím ešte raz.');
    }
  }

  function addMarker() {
    if (!recorderState.isRecording) return;

    const seconds = Math.max(0, recorderState.durationMillis / 1000);
    const rounded = Math.round(seconds * 10) / 10;
    const nextIndex = currentMarkers.length;

    setCurrentMarkers((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}`,
        label: `Marker ${nextIndex}`,
        time: rounded,
      },
    ]);
  }

  async function seekToMarker(index: number) {
    if (!hasReviewableAudio || !currentMarkers[index]) return;
    const marker = currentMarkers[index];
    setSelectedMarkerIndex(index);
    setIsSegmentPlayback(false);
    setSegmentEndTime(null);
    player.pause();
    await player.seekTo(marker.time);
  }

  async function playFromCurrentMarker() {
    if (!hasReviewableAudio || !segments[selectedMarkerIndex]) return;

    const currentSegment = segments[selectedMarkerIndex];
    const endTime = Math.max(currentSegment.time, currentSegment.endTime);

    await player.seekTo(currentSegment.time);
    setSegmentEndTime(endTime);
    setIsSegmentPlayback(true);
    player.play();
  }

  async function goToPreviousMarker() {
    const target = Math.max(0, selectedMarkerIndex - 1);
    await seekToMarker(target);
  }

  async function goToNextMarker() {
    const target = Math.min(currentMarkers.length - 1, selectedMarkerIndex + 1);
    await seekToMarker(target);
  }

  function selectRecording(recordingId: string) {
    setActiveRecordingId(recordingId);
  }

  function saveTitle() {
    if (!activeRecording) return;

    const clean = draftTitle.trim();
    if (!clean) {
      Alert.alert('Názov je prázdny', 'Zadaj prosím názov nahrávky.');
      return;
    }

    setRecordings((prev) =>
      prev.map((item) => (item.id === activeRecording.id ? { ...item, title: clean } : item)),
    );
  }

  function deleteActiveRecording() {
    if (!activeRecording) return;

    Alert.alert(
      'Vymazať nahrávku?',
      `Naozaj chceš vymazať „${activeRecording.title}“?`,
      [
        { text: 'Zrušiť', style: 'cancel' },
        {
          text: 'Vymazať',
          style: 'destructive',
          onPress: () => {
            void confirmDeleteActiveRecording();
          },
        },
      ],
    );
  }

  async function confirmDeleteActiveRecording() {
    if (!activeRecording) return;

    const deletingId = activeRecording.id;
    const deletingUri = activeRecording.uri;

    player.pause();
    setIsSegmentPlayback(false);
    setSegmentEndTime(null);

    const nextRecordings = recordings.filter((item) => item.id !== deletingId);
    setRecordings(nextRecordings);
    setActiveRecordingId(nextRecordings[0]?.id ?? null);

    try {
      await FileSystem.deleteAsync(deletingUri, { idempotent: true });
    } catch (error) {
      console.error(error);
      Alert.alert(
        'Metaúdaje zmazané, súbor možno zostal',
        'Záznam bol odobratý zo zoznamu, ale zvukový súbor sa nemusel z disku odstrániť.',
      );
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Marker Recorder MVP+</Text>
        <Text style={styles.subtitle}>
          Nahrávanie s markermi, prehrávanie po úsekoch a jednoduchý manažment nahrávok.
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Nahrávanie</Text>
          <Text style={styles.timer}>{formatTime(recorderState.durationMillis / 1000)}</Text>

          <View style={styles.row}>
            {!recorderState.isRecording ? (
              <ActionButton label="Spustiť nahrávanie" onPress={startRecording} primary />
            ) : (
              <ActionButton label="Zastaviť" onPress={stopRecording} danger />
            )}
            <ActionButton
              label="Pridať marker"
              onPress={addMarker}
              disabled={!recorderState.isRecording}
            />
          </View>

          <Text style={styles.helpText}>
            Pri spustení sa automaticky vytvorí marker „Začiatok“ na čase 0:00.
          </Text>

          {recorderState.isRecording && (
            <View style={styles.inlineList}>
              {currentMarkers.map((marker) => (
                <View key={marker.id} style={styles.inlineChip}>
                  <Text style={styles.inlineChipText}>
                    {marker.label} · {formatTime(marker.time)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>2. Knižnica nahrávok</Text>
          <Text style={styles.metaLine}>Počet uložených nahrávok: {recordings.length}</Text>

          {recordings.length === 0 ? (
            <Text style={styles.helpText}>Zatiaľ tu nič nie je. Nahraj prvý záznam.</Text>
          ) : (
            <View style={styles.list}>
              {recordings.map((item) => {
                const isActive = item.id === activeRecordingId;
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.recordingRow, isActive && styles.recordingRowActive]}
                    onPress={() => selectRecording(item.id)}>
                    <View style={styles.recordingRowTextWrap}>
                      <Text style={styles.recordingTitle}>{item.title}</Text>
                      <Text style={styles.recordingMeta}>
                        {formatDate(item.createdAt)} · {formatTime(item.durationSeconds)} · {item.markers.length}{' '}
                        markerov
                      </Text>
                    </View>
                    <Text style={styles.selectHint}>{isActive ? 'Aktívna' : 'Otvoriť'}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {activeRecording && (
            <>
              <View style={styles.renameRow}>
                <TextInput
                  value={draftTitle}
                  onChangeText={setDraftTitle}
                  placeholder="Názov nahrávky"
                  placeholderTextColor="#888"
                  style={styles.input}
                />
                <ActionButton label="Uložiť názov" onPress={saveTitle} />
              </View>
              <ActionButton label="Vymazať aktívnu nahrávku" onPress={deleteActiveRecording} danger />
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>3. Prehrávanie po markerových úsekoch</Text>
          <Text style={styles.metaLine}>
            Súbor: {activeRecording ? activeRecording.title : 'zatiaľ nič nevybraté'}
          </Text>
          <Text style={styles.metaLine}>
            Pozícia: {formatTime(playerStatus.currentTime)} /{' '}
            {formatTime(activeRecording?.durationSeconds ?? playerStatus.duration)}
          </Text>
          <Text style={styles.metaLine}>
            Aktívny marker: {currentMarkers[selectedMarkerIndex]?.label ?? '—'}
          </Text>

          <View style={styles.row}>
            <ActionButton
              label="Predchádzajúci marker"
              onPress={goToPreviousMarker}
              disabled={!hasReviewableAudio || currentMarkers.length === 0}
            />
            <ActionButton
              label="Ďalší marker"
              onPress={goToNextMarker}
              disabled={!hasReviewableAudio || currentMarkers.length === 0}
            />
          </View>

          <View style={styles.row}>
            <ActionButton
              label="Prehrať od markeru"
              onPress={playFromCurrentMarker}
              disabled={!hasReviewableAudio || currentMarkers.length === 0}
              primary
            />
            <ActionButton
              label={playerStatus.playing ? 'Pauza' : 'Zostať stáť'}
              onPress={() => {
                player.pause();
                setIsSegmentPlayback(false);
              }}
              disabled={!hasReviewableAudio}
            />
          </View>

          <View style={styles.list}>
            {currentMarkers.length === 0 ? (
              <Text style={styles.helpText}>Žiadne markery.</Text>
            ) : (
              currentMarkers.map((marker, index) => (
                <Pressable
                  key={marker.id}
                  onPress={() => {
                    void seekToMarker(index);
                  }}
                  style={[
                    styles.markerRow,
                    index === selectedMarkerIndex && styles.markerRowSelected,
                  ]}>
                  <Text style={styles.markerText}>{marker.label}</Text>
                  <Text style={styles.markerTime}>{formatTime(marker.time)}</Text>
                </Pressable>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  primary,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        primary && styles.buttonPrimary,
        danger && styles.buttonDanger,
        disabled && styles.buttonDisabled,
      ]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function formatTime(totalSeconds?: number) {
  const safeSeconds = Math.max(0, totalSeconds ?? 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const tenths = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString('sk-SK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f1115',
  },
  container: {
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 15,
    color: '#c5cad3',
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#1a1f29',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  timer: {
    fontSize: 36,
    fontWeight: '700',
    color: '#9bd1ff',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  renameRow: {
    gap: 10,
  },
  button: {
    backgroundColor: '#2a3342',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  buttonPrimary: {
    backgroundColor: '#1d6fd6',
  },
  buttonDanger: {
    backgroundColor: '#a93636',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  helpText: {
    color: '#b2b9c6',
    lineHeight: 20,
  },
  metaLine: {
    color: '#d8dde7',
  },
  list: {
    gap: 8,
  },
  markerRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#232b38',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  markerRowSelected: {
    borderWidth: 1,
    borderColor: '#7dc3ff',
  },
  markerText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  markerTime: {
    color: '#9bd1ff',
    fontVariant: ['tabular-nums'],
  },
  inlineList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineChip: {
    backgroundColor: '#232b38',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inlineChipText: {
    color: '#dfe6f1',
    fontSize: 12,
  },
  recordingRow: {
    backgroundColor: '#232b38',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  recordingRowActive: {
    borderWidth: 1,
    borderColor: '#7dc3ff',
  },
  recordingRowTextWrap: {
    flex: 1,
    gap: 4,
  },
  recordingTitle: {
    color: '#ffffff',
    fontWeight: '700',
  },
  recordingMeta: {
    color: '#b2b9c6',
    fontSize: 12,
  },
  selectHint: {
    color: '#9bd1ff',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#232b38',
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
});
