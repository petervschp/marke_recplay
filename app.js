const DB_NAME = 'marker-recorder-db';
const DB_VERSION = 1;
const STORE_RECORDINGS = 'recordings';

const els = {
  newRecordingTitle: document.getElementById('newRecordingTitle'),
  startRecordingBtn: document.getElementById('startRecordingBtn'),
  stopRecordingBtn: document.getElementById('stopRecordingBtn'),
  addMarkerBtn: document.getElementById('addMarkerBtn'),
  markerNameInput: document.getElementById('markerNameInput'),
  recordingState: document.getElementById('recordingState'),
  recordingElapsed: document.getElementById('recordingElapsed'),
  tempMarkerCount: document.getElementById('tempMarkerCount'),
  tempMarkersList: document.getElementById('tempMarkersList'),
  refreshBtn: document.getElementById('refreshBtn'),
  recordingsList: document.getElementById('recordingsList'),
  recordingsCount: document.getElementById('recordingsCount'),
  emptySelection: document.getElementById('emptySelection'),
  selectedRecordingPanel: document.getElementById('selectedRecordingPanel'),
  selectedRecordingBadge: document.getElementById('selectedRecordingBadge'),
  selectedRecordingTitle: document.getElementById('selectedRecordingTitle'),
  renameRecordingBtn: document.getElementById('renameRecordingBtn'),
  deleteRecordingBtn: document.getElementById('deleteRecordingBtn'),
  audioPlayer: document.getElementById('audioPlayer'),
  playSelectedMarkerBtn: document.getElementById('playSelectedMarkerBtn'),
  playFromStartBtn: document.getElementById('playFromStartBtn'),
  prevMarkerBtn: document.getElementById('prevMarkerBtn'),
  nextMarkerBtn: document.getElementById('nextMarkerBtn'),
  stopPlaybackBtn: document.getElementById('stopPlaybackBtn'),
  playbackPosition: document.getElementById('playbackPosition'),
  selectedMarkerLabel: document.getElementById('selectedMarkerLabel'),
  segmentStopLabel: document.getElementById('segmentStopLabel'),
  editMarkerNameInput: document.getElementById('editMarkerNameInput'),
  renameMarkerBtn: document.getElementById('renameMarkerBtn'),
  deleteMarkerBtn: document.getElementById('deleteMarkerBtn'),
  markersList: document.getElementById('markersList'),
  toast: document.getElementById('toast'),
  recordingCardTemplate: document.getElementById('recordingCardTemplate'),
  markerCardTemplate: document.getElementById('markerCardTemplate'),
};

const state = {
  db: null,
  mediaRecorder: null,
  mediaStream: null,
  chunks: [],
  recordingStartTs: null,
  recordingTimerId: null,
  tempMarkers: [],
  recordings: [],
  selectedRecordingId: null,
  selectedMarkerIndex: -1,
  playbackStopAtSec: null,
  playbackMonitorId: null,
  objectUrl: null,
};

function showToast(message, timeout = 2400) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(() => {
    els.toast.classList.add('hidden');
  }, timeout);
}

function formatTimeMs(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString('sk-SK');
}

function getRecordingTitle() {
  const value = els.newRecordingTitle.value.trim();
  if (value) return value;
  return `Nahrávka ${new Date().toLocaleString('sk-SK')}`;
}

function generateId() {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateMarkerId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_RECORDINGS)) {
        db.createObjectStore(STORE_RECORDINGS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return state.db.transaction(storeName, mode).objectStore(storeName);
}

function saveRecording(recording) {
  return new Promise((resolve, reject) => {
    const request = tx(STORE_RECORDINGS, 'readwrite').put(recording);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteRecordingFromDb(id) {
  return new Promise((resolve, reject) => {
    const request = tx(STORE_RECORDINGS, 'readwrite').delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getAllRecordings() {
  return new Promise((resolve, reject) => {
    const request = tx(STORE_RECORDINGS).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function getRecording(id) {
  return new Promise((resolve, reject) => {
    const request = tx(STORE_RECORDINGS).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function refreshRecordings() {
  state.recordings = await getAllRecordings();
  state.recordings.sort((a, b) => b.createdAt - a.createdAt);
  renderRecordings();
  if (state.selectedRecordingId) {
    const stillExists = state.recordings.some((r) => r.id === state.selectedRecordingId);
    if (!stillExists) {
      clearSelection();
    }
  }
}

function renderTempMarkers() {
  els.tempMarkersList.innerHTML = '';
  els.tempMarkerCount.textContent = String(state.tempMarkers.length);
  if (!state.tempMarkers.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Zatiaľ bez markerov.';
    els.tempMarkersList.appendChild(li);
    return;
  }

  state.tempMarkers.forEach((marker, index) => {
    const li = document.createElement('li');
    li.textContent = `${index + 1}. ${formatTimeMs(marker.timeMs)} — ${marker.label}`;
    els.tempMarkersList.appendChild(li);
  });
}

function renderRecordings() {
  els.recordingsList.innerHTML = '';
  els.recordingsCount.textContent = String(state.recordings.length);

  if (!state.recordings.length) {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.textContent = 'Zatiaľ nemáš uložené žiadne nahrávky.';
    els.recordingsList.appendChild(div);
    return;
  }

  state.recordings.forEach((recording) => {
    const fragment = els.recordingCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.recording-card');
    const title = fragment.querySelector('.recording-title');
    const meta = fragment.querySelector('.recording-meta');
    const openBtn = fragment.querySelector('.open-recording-btn');

    title.textContent = recording.title;
    meta.textContent = `${formatDate(recording.createdAt)} • ${recording.markers.length} markerov`;

    if (recording.id === state.selectedRecordingId) {
      card.classList.add('active');
    }

    openBtn.addEventListener('click', () => selectRecording(recording.id));
    els.recordingsList.appendChild(fragment);
  });
}

function clearSelection() {
  state.selectedRecordingId = null;
  state.selectedMarkerIndex = -1;
  els.emptySelection.classList.remove('hidden');
  els.selectedRecordingPanel.classList.add('hidden');
  els.selectedRecordingBadge.textContent = 'Žiadna';
  els.selectedRecordingBadge.classList.add('muted');
  els.selectedMarkerLabel.textContent = 'Žiadny';
  els.segmentStopLabel.textContent = 'Vypnuté';
  stopPlaybackMonitor();
  releaseObjectUrl();
  els.audioPlayer.removeAttribute('src');
  renderRecordings();
}

function releaseObjectUrl() {
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
}

async function selectRecording(id) {
  const recording = await getRecording(id);
  if (!recording) {
    showToast('Nahrávku sa nepodarilo načítať.');
    return;
  }

  stopPlaybackMonitor();
  releaseObjectUrl();

  state.selectedRecordingId = id;
  state.selectedMarkerIndex = recording.markers.length ? 0 : -1;
  els.emptySelection.classList.add('hidden');
  els.selectedRecordingPanel.classList.remove('hidden');
  els.selectedRecordingBadge.textContent = recording.title;
  els.selectedRecordingBadge.classList.remove('muted');
  els.selectedRecordingTitle.value = recording.title;

  state.objectUrl = URL.createObjectURL(recording.audioBlob);
  els.audioPlayer.src = state.objectUrl;
  els.audioPlayer.load();

  await refreshRecordings();
  renderSelectedRecording(recording);
}

function renderSelectedRecording(recording) {
  renderMarkers(recording);
  updateSelectedMarkerUi(recording);
}

function renderMarkers(recording) {
  els.markersList.innerHTML = '';
  if (!recording.markers.length) {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.textContent = 'Táto nahrávka nemá markery.';
    els.markersList.appendChild(div);
    return;
  }

  recording.markers.forEach((marker, index) => {
    const fragment = els.markerCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.marker-card');
    const title = fragment.querySelector('.marker-title');
    const meta = fragment.querySelector('.marker-meta');
    const selectBtn = fragment.querySelector('.select-marker-btn');
    const playBtn = fragment.querySelector('.play-marker-btn');

    title.textContent = marker.label;
    meta.textContent = `${index + 1}. marker • ${formatTimeMs(marker.timeMs)}`;

    if (index === state.selectedMarkerIndex) {
      card.classList.add('active');
    }

    selectBtn.addEventListener('click', () => {
      state.selectedMarkerIndex = index;
      updateSelectedMarkerUi(recording);
      renderMarkers(recording);
    });

    playBtn.addEventListener('click', async () => {
      state.selectedMarkerIndex = index;
      updateSelectedMarkerUi(recording);
      renderMarkers(recording);
      await playSelectedMarkerSegment();
    });

    els.markersList.appendChild(fragment);
  });
}

function updateSelectedMarkerUi(recording) {
  if (!recording.markers.length || state.selectedMarkerIndex < 0) {
    els.selectedMarkerLabel.textContent = 'Žiadny';
    els.editMarkerNameInput.value = '';
    return;
  }
  const marker = recording.markers[state.selectedMarkerIndex];
  els.selectedMarkerLabel.textContent = `${marker.label} (${formatTimeMs(marker.timeMs)})`;
  els.editMarkerNameInput.value = marker.label;
}

function ensureSecureContextForMic() {
  if (window.isSecureContext) return true;
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return isLocalhost;
}

async function startRecording() {
  if (!ensureSecureContextForMic()) {
    showToast('Mikrofón funguje len cez HTTPS alebo localhost.');
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Tento prehliadač nepodporuje mikrofónové API.');
    return;
  }

  if (typeof MediaRecorder === 'undefined') {
    showToast('Tento prehliadač nepodporuje MediaRecorder.');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaStream = stream;
    state.chunks = [];
    state.tempMarkers = [];
    renderTempMarkers();
    const mimeType = pickSupportedMimeType();
    state.mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.chunks.push(event.data);
      }
    };

    state.mediaRecorder.onstop = async () => {
      try {
        await finalizeRecording(state.mediaRecorder.mimeType || mimeType || 'audio/webm');
      } catch (error) {
        console.error(error);
        showToast('Nahrávku sa nepodarilo uložiť.');
      } finally {
        cleanupMediaStream();
      }
    };

    state.recordingStartTs = performance.now();
    state.mediaRecorder.start();
    state.recordingTimerId = window.setInterval(updateRecordingElapsed, 100);
    els.startRecordingBtn.disabled = true;
    els.stopRecordingBtn.disabled = false;
    els.addMarkerBtn.disabled = false;
    els.recordingState.textContent = 'Nahrávanie beží';
    showToast('Nahrávanie spustené.');
  } catch (error) {
    console.error(error);
    showToast('Prístup k mikrofónu bol zamietnutý alebo zlyhal.');
  }
}

function pickSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return types.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

function updateRecordingElapsed() {
  if (state.recordingStartTs == null) return;
  const elapsed = performance.now() - state.recordingStartTs;
  els.recordingElapsed.textContent = formatTimeMs(elapsed);
}

function addMarker() {
  if (!state.recordingStartTs) return;
  const elapsed = performance.now() - state.recordingStartTs;
  const label = els.markerNameInput.value.trim() || `Marker ${state.tempMarkers.length + 1}`;
  state.tempMarkers.push({ id: generateMarkerId(), label, timeMs: Math.max(0, Math.round(elapsed)) });
  els.markerNameInput.value = '';
  renderTempMarkers();
  showToast(`Pridaný ${label}`);
}

function stopRecording() {
  if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') return;
  els.stopRecordingBtn.disabled = true;
  els.addMarkerBtn.disabled = true;
  els.recordingState.textContent = 'Ukladám...';
  state.mediaRecorder.stop();
}

async function finalizeRecording(mimeType) {
  const audioBlob = new Blob(state.chunks, { type: mimeType || 'audio/webm' });
  const title = getRecordingTitle();
  const recording = {
    id: generateId(),
    title,
    createdAt: Date.now(),
    mimeType: audioBlob.type || mimeType || 'audio/webm',
    audioBlob,
    markers: [...state.tempMarkers].sort((a, b) => a.timeMs - b.timeMs),
  };
  await saveRecording(recording);
  await refreshRecordings();
  resetRecordingUi();
  els.newRecordingTitle.value = '';
  showToast('Nahrávka uložená.');
  await selectRecording(recording.id);
}

function cleanupMediaStream() {
  clearInterval(state.recordingTimerId);
  state.recordingTimerId = null;
  state.recordingStartTs = null;
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
  }
  state.mediaStream = null;
  state.mediaRecorder = null;
  state.chunks = [];
}

function resetRecordingUi() {
  els.startRecordingBtn.disabled = false;
  els.stopRecordingBtn.disabled = true;
  els.addMarkerBtn.disabled = true;
  els.recordingState.textContent = 'Pripravené';
  els.recordingElapsed.textContent = '00:00.0';
  state.tempMarkers = [];
  renderTempMarkers();
}

async function getSelectedRecordingOrToast() {
  if (!state.selectedRecordingId) {
    showToast('Najprv vyber nahrávku.');
    return null;
  }
  const recording = await getRecording(state.selectedRecordingId);
  if (!recording) {
    showToast('Vybraná nahrávka už neexistuje.');
    await refreshRecordings();
    clearSelection();
    return null;
  }
  return recording;
}

function stopPlaybackMonitor() {
  if (state.playbackMonitorId) {
    clearInterval(state.playbackMonitorId);
    state.playbackMonitorId = null;
  }
  state.playbackStopAtSec = null;
  els.segmentStopLabel.textContent = 'Vypnuté';
}

function startPlaybackMonitor() {
  stopPlaybackMonitor();
  state.playbackMonitorId = window.setInterval(() => {
    const position = Number.isFinite(els.audioPlayer.currentTime) ? els.audioPlayer.currentTime : 0;
    els.playbackPosition.textContent = formatTimeMs(Math.round(position * 1000));

    if (state.playbackStopAtSec != null && position >= state.playbackStopAtSec) {
      els.audioPlayer.pause();
      stopPlaybackMonitor();
      showToast('Segment dohraný.');
    }
  }, 50);
}

async function playSelectedMarkerSegment() {
  const recording = await getSelectedRecordingOrToast();
  if (!recording) return;
  if (!recording.markers.length) {
    showToast('Táto nahrávka nemá markery.');
    return;
  }
  if (state.selectedMarkerIndex < 0 || state.selectedMarkerIndex >= recording.markers.length) {
    state.selectedMarkerIndex = 0;
  }

  const marker = recording.markers[state.selectedMarkerIndex];
  const nextMarker = recording.markers[state.selectedMarkerIndex + 1] || null;
  state.playbackStopAtSec = nextMarker ? nextMarker.timeMs / 1000 : null;
  els.segmentStopLabel.textContent = nextMarker ? formatTimeMs(nextMarker.timeMs) : 'Koniec nahrávky';

  els.audioPlayer.currentTime = marker.timeMs / 1000;
  startPlaybackMonitor();
  await els.audioPlayer.play();
}

async function playFromStart() {
  const recording = await getSelectedRecordingOrToast();
  if (!recording) return;

  const firstMarker = recording.markers[0] || null;

  stopPlaybackMonitor();
  state.playbackStopAtSec = firstMarker ? firstMarker.timeMs / 1000 : null;
  els.segmentStopLabel.textContent = firstMarker ? formatTimeMs(firstMarker.timeMs) : 'Koniec nahrávky';
  els.audioPlayer.currentTime = 0;
  startPlaybackMonitor();
  await els.audioPlayer.play();
}

async function renameSelectedRecording() {
  const recording = await getSelectedRecordingOrToast();
  if (!recording) return;
  const title = els.selectedRecordingTitle.value.trim();
  if (!title) {
    showToast('Názov nahrávky nesmie byť prázdny.');
    return;
  }
  recording.title = title;
  await saveRecording(recording);
  await refreshRecordings();
  await selectRecording(recording.id);
  showToast('Nahrávka premenovaná.');
}

async function deleteSelectedRecording() {
  const recording = await getSelectedRecordingOrToast();
  if (!recording) return;
  if (!window.confirm(`Zmazať nahrávku „${recording.title}“?`)) return;
  await deleteRecordingFromDb(recording.id);
  await refreshRecordings();
  clearSelection();
  showToast('Nahrávka zmazaná.');
}

async function renameSelectedMarker() {
  const recording = await getSelectedRecordingOrToast();
  if (!recording) return;
  if (state.selectedMarkerIndex < 0 || !recording.markers[state.selectedMarkerIndex]) {
    showToast('Najprv vyber marker.');
    return;
  }
  const name = els.editMarkerNameInput.value.trim();
  if (!name) {
    showToast('Názov markeru nesmie byť prázdny.');
    return;
  }
  recording.markers[state.selectedMarkerIndex].label = name;
  await saveRecording(recording);
  await selectRecording(recording.id);
  showToast('Marker premenovaný.');
}

async function deleteSelectedMarker() {
  const recording = await getSelectedRecordingOrToast();
  if (!recording) return;
  if (state.selectedMarkerIndex < 0 || !recording.markers[state.selectedMarkerIndex]) {
    showToast('Najprv vyber marker.');
    return;
  }
  const marker = recording.markers[state.selectedMarkerIndex];
  if (!window.confirm(`Zmazať marker „${marker.label}“?`)) return;
  recording.markers.splice(state.selectedMarkerIndex, 1);
  state.selectedMarkerIndex = Math.min(state.selectedMarkerIndex, recording.markers.length - 1);
  await saveRecording(recording);
  await selectRecording(recording.id);
  showToast('Marker zmazaný.');
}

async function selectPreviousMarker() {
  const recording = await getSelectedRecordingOrToast();
  if (!recording || !recording.markers.length) return;
  state.selectedMarkerIndex = Math.max(0, state.selectedMarkerIndex - 1);
  updateSelectedMarkerUi(recording);
  renderMarkers(recording);
}

async function selectNextMarker() {
  const recording = await getSelectedRecordingOrToast();
  if (!recording || !recording.markers.length) return;
  state.selectedMarkerIndex = Math.min(recording.markers.length - 1, state.selectedMarkerIndex + 1);
  updateSelectedMarkerUi(recording);
  renderMarkers(recording);
}

function attachEvents() {
  els.startRecordingBtn.addEventListener('click', startRecording);
  els.stopRecordingBtn.addEventListener('click', stopRecording);
  els.addMarkerBtn.addEventListener('click', addMarker);
  els.refreshBtn.addEventListener('click', refreshRecordings);
  els.renameRecordingBtn.addEventListener('click', renameSelectedRecording);
  els.deleteRecordingBtn.addEventListener('click', deleteSelectedRecording);
  els.playSelectedMarkerBtn.addEventListener('click', async () => {
    try {
      await playSelectedMarkerSegment();
    } catch (error) {
      console.error(error);
      showToast('Prehrávanie sa nepodarilo spustiť.');
    }
  });
  els.playFromStartBtn.addEventListener('click', async () => {
    try {
      await playFromStart();
    } catch (error) {
      console.error(error);
      showToast('Prehrávanie od začiatku zlyhalo.');
    }
  });
  els.prevMarkerBtn.addEventListener('click', selectPreviousMarker);
  els.nextMarkerBtn.addEventListener('click', selectNextMarker);
  els.stopPlaybackBtn.addEventListener('click', () => {
    els.audioPlayer.pause();
    stopPlaybackMonitor();
  });
  els.renameMarkerBtn.addEventListener('click', renameSelectedMarker);
  els.deleteMarkerBtn.addEventListener('click', deleteSelectedMarker);

  els.audioPlayer.addEventListener('ended', () => {
    stopPlaybackMonitor();
    els.playbackPosition.textContent = '00:00.0';
  });
  els.audioPlayer.addEventListener('pause', () => {
    if (els.audioPlayer.ended) return;
    if (state.playbackStopAtSec == null) {
      stopPlaybackMonitor();
    }
  });
  els.audioPlayer.addEventListener('loadedmetadata', () => {
    els.playbackPosition.textContent = '00:00.0';
  });
}

async function init() {
  try {
    state.db = await openDb();
    attachEvents();
    resetRecordingUi();
    await refreshRecordings();
    clearSelection();
    showToast('Aplikácia pripravená.');
  } catch (error) {
    console.error(error);
    els.recordingState.textContent = 'Chyba inicializácie';
    showToast('Inicializácia úložiska zlyhala.');
  }
}

window.addEventListener('beforeunload', releaseObjectUrl);
window.addEventListener('load', init);
