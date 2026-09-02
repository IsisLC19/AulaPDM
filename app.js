/**
 * SpectrumHz - SPA Audio Visualizer & Frequency Therapy Engine
 * Developed using Vanilla JS and Web Audio API
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = themeToggleBtn.querySelector('.theme-icon');

  const canvas = document.getElementById('spectrumCanvas');
  const canvasCtx = canvas.getContext('2d');
  const canvasOverlay = document.getElementById('canvasOverlay');
  const liveFreqDisplay = document.getElementById('liveFreqDisplay');
  const visualizerModeBtns = document.querySelectorAll('.mode-btn');

  const audioFileInput = document.getElementById('audioFileInput');
  const dropZone = document.getElementById('dropZone');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const currentTrackTitle = document.getElementById('currentTrackTitle');
  const seekBar = document.getElementById('seekBar');
  const currentTimeDisplay = document.getElementById('currentTimeDisplay');
  const durationDisplay = document.getElementById('durationDisplay');
  const volumeControl = document.getElementById('volumeControl');

  const presetChips = document.querySelectorAll('.chip');
  const activeHzBadge = document.getElementById('activeHzBadge');
  const pitchShiftToggle = document.getElementById('pitchShiftToggle');
  const binauralToggle = document.getElementById('binauralToggle');
  const exportWavBtn = document.getElementById('exportWavBtn');
  const exportStatus = document.getElementById('exportStatus');

  const emotionBtns = document.querySelectorAll('.emotion-btn');

  const volChannelA = document.getElementById('volChannelA');
  const channelBSelect = document.getElementById('channelBSelect');
  const volChannelB = document.getElementById('volChannelB');
  const crossfader = document.getElementById('crossfader');

  // --- Audio State Variables ---
  let audioCtx = null;
  let audioBuffer = null;
  let sourceNode = null;
  let analyser = null;
  let gainNodeA = null;
  let gainNodeB = null;
  let masterGainNode = null;
  let binauralOscillator = null;
  let binauralGain = null;

  // Sound generator node for Channel B
  let channelBSource = null;

  // Playback state
  let isPlaying = false;
  let startTime = 0;
  let pauseOffset = 0;
  let animationFrameId = null;

  // Settings state
  let currentTargetHz = 440;
  let visualizationMode = 'bars'; // 'bars', 'wave', 'circle'
  let currentFileName = '';

  // Theme Hz Color Mapping (Purple Shades)
  const hzThemeColors = {
    440: { primary: '#8b5cf6', secondary: '#a855f7', glow: 'rgba(139, 92, 246, 0.4)', name: '440 Hz (Padrão)' },
    432: { primary: '#9333ea', secondary: '#c084fc', glow: 'rgba(147, 51, 234, 0.4)', name: '432 Hz (Cura/Natureza)' },
    528: { primary: '#a855f7', secondary: '#e879f9', glow: 'rgba(168, 85, 247, 0.4)', name: '528 Hz (Transformação)' },
    639: { primary: '#7e22ce', secondary: '#d8b4fe', glow: 'rgba(126, 34, 206, 0.4)', name: '639 Hz (Conexão)' },
    741: { primary: '#6b21a8', secondary: '#e9d5ff', glow: 'rgba(107, 33, 168, 0.4)', name: '741 Hz (Intuição)' },
    852: { primary: '#581c87', secondary: '#f3e8ff', glow: 'rgba(88, 28, 135, 0.4)', name: '852 Hz (Espiritual)' }
  };

  // Resize Canvas to fit wrapper
  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio || rect.width;
    canvas.height = rect.height * window.devicePixelRatio || rect.height;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // --- Theme Toggle ---
  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    themeIcon.textContent = newTheme === 'dark' ? '🌙' : '☀️';
  });

  // --- Update Purple Dynamic Theme based on Hz ---
  function updateHzTheme(hz) {
    currentTargetHz = hz;
    const colorInfo = hzThemeColors[hz] || hzThemeColors[440];

    document.documentElement.style.setProperty('--hz-color-primary', colorInfo.primary);
    document.documentElement.style.setProperty('--hz-color-secondary', colorInfo.secondary);
    document.documentElement.style.setProperty('--hz-color-glow', colorInfo.glow);
    activeHzBadge.textContent = colorInfo.name;

    // Update active chip UI
    presetChips.forEach(chip => {
      chip.classList.toggle('active', parseInt(chip.dataset.hz, 10) === hz);
    });

    // Update Pitch shift if playing
    if (isPlaying && sourceNode && pitchShiftToggle.checked) {
      applyPitchShift();
    }

    // Update Binaural Oscillator if active
    if (binauralOscillator && binauralToggle.checked) {
      binauralOscillator.frequency.setValueAtTime(currentTargetHz, audioCtx.currentTime);
    }
  }

  // --- Web Audio Context Initialization ---
  function initAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;

      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.value = parseFloat(volumeControl.value);

      gainNodeA = audioCtx.createGain();
      gainNodeB = audioCtx.createGain();

      updateMixerGains();

      gainNodeA.connect(masterGainNode);
      gainNodeB.connect(masterGainNode);

      masterGainNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // --- Update Mixer & Crossfader Gains ---
  function updateMixerGains() {
    if (!gainNodeA || !gainNodeB) return;
    const volA = parseFloat(volChannelA.value);
    const volB = parseFloat(volChannelB.value);
    const xFade = parseFloat(crossfader.value); // 0 (100% A) -> 0.5 (100% A & B) -> 1 (100% B)

    const gainAVal = volA * Math.cos(xFade * 0.5 * Math.PI);
    const gainBVal = volB * Math.sin(xFade * 0.5 * Math.PI);

    gainNodeA.gain.setValueAtTime(gainAVal, audioCtx ? audioCtx.currentTime : 0);
    gainNodeB.gain.setValueAtTime(gainBVal, audioCtx ? audioCtx.currentTime : 0);
  }

  // --- Calculate Pitch Shift ratio based on Target Hz (Base 440Hz) ---
  function applyPitchShift() {
    if (!sourceNode) return;
    if (pitchShiftToggle.checked) {
      const playbackRate = currentTargetHz / 440;
      sourceNode.playbackRate.setValueAtTime(playbackRate, audioCtx.currentTime);
    } else {
      sourceNode.playbackRate.setValueAtTime(1.0, audioCtx.currentTime);
    }
  }

  // --- Binaural Tone Generator Toggle ---
  function updateBinauralOscillator() {
    if (!audioCtx) return;

    if (binauralToggle.checked && isPlaying) {
      if (!binauralOscillator) {
        binauralOscillator = audioCtx.createOscillator();
        binauralGain = audioCtx.createGain();

        binauralOscillator.type = 'sine';
        binauralOscillator.frequency.setValueAtTime(currentTargetHz, audioCtx.currentTime);

        // Soft volume for overlay binaural tone
        binauralGain.gain.setValueAtTime(0.08, audioCtx.currentTime);

        binauralOscillator.connect(binauralGain);
        binauralGain.connect(masterGainNode);

        binauralOscillator.start();
      } else {
        binauralOscillator.frequency.setValueAtTime(currentTargetHz, audioCtx.currentTime);
      }
    } else {
      if (binauralOscillator) {
        try {
          binauralOscillator.stop();
          binauralOscillator.disconnect();
        } catch (e) {}
        binauralOscillator = null;
        binauralGain = null;
      }
    }
  }

  // --- Load Audio File ---
  function loadAudioFile(file) {
    if (!file) return;

    initAudioContext();
    stopAudio();

    currentFileName = file.name;
    currentTrackTitle.textContent = currentFileName;
    exportStatus.textContent = '';

    const reader = new FileReader();
    reader.onload = function (e) {
      const arrayBuffer = e.target.result;
      audioCtx.decodeAudioData(
        arrayBuffer,
        (decodedBuffer) => {
          audioBuffer = decodedBuffer;
          durationDisplay.textContent = formatTime(audioBuffer.duration);
          seekBar.max = audioBuffer.duration;
          seekBar.disabled = false;
          playPauseBtn.disabled = false;
          stopBtn.disabled = false;
          exportWavBtn.disabled = false;
          canvasOverlay.classList.add('hidden');

          // Auto-play after loading
          playAudio();
        },
        (error) => {
          alert('Erro ao decodificar o arquivo de áudio MP3/Áudio: ' + error.message);
        }
      );
    };
    reader.readAsArrayBuffer(file);
  }

  // --- Synthetic Audio Track Generator (for Emotions) ---
  function createSyntheticAudioTrack(type) {
    initAudioContext();
    const sampleRate = audioCtx.sampleRate;
    const duration = 12; // 12 seconds loop track
    const numSamples = sampleRate * duration;
    const buffer = audioCtx.createBuffer(2, numSamples, sampleRate);

    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let baseFreq = 440;
    if (type === 'relaxed') baseFreq = 432;
    if (type === 'focused') baseFreq = 528;
    if (type === 'energetic') baseFreq = 639;
    if (type === 'calm') baseFreq = 741;

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Ambient synth chord generation
      let sampleL = 0.3 * Math.sin(2 * Math.PI * baseFreq * t) +
                    0.2 * Math.sin(2 * Math.PI * (baseFreq * 1.25) * t) +
                    0.15 * Math.sin(2 * Math.PI * (baseFreq * 1.5) * t);

      let sampleR = 0.3 * Math.sin(2 * Math.PI * (baseFreq * 1.005) * t) +
                    0.2 * Math.sin(2 * Math.PI * (baseFreq * 1.251) * t) +
                    0.15 * Math.sin(2 * Math.PI * (baseFreq * 1.502) * t);

      // Add gentle modulation envelope
      const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t);
      left[i] = sampleL * env * 0.4;
      right[i] = sampleR * env * 0.4;
    }

    return buffer;
  }

  // --- Channel B Sound Generators (Ambient) ---
  function startChannelB(soundType) {
    if (channelBSource) {
      try {
        channelBSource.stop();
        channelBSource.disconnect();
      } catch (e) {}
      channelBSource = null;
    }

    if (soundType === 'none' || !isPlaying) return;

    initAudioContext();
    const sampleRate = audioCtx.sampleRate;
    const bufferSize = sampleRate * 3; // 3 second loop
    const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (soundType === 'white_noise') {
        data[i] = white * 0.15;
      } else if (soundType === 'pink_noise') {
        // Simple pink noise filter
        lastOut = (lastOut + (0.02 * white)) / 1.02;
        data[i] = lastOut * 0.5;
      } else if (soundType === 'rain') {
        // Rain effect synthesis
        lastOut = (lastOut + (0.01 * white)) / 1.01;
        const drop = Math.random() > 0.998 ? (Math.random() * 0.3) : 0;
        data[i] = (lastOut * 0.4) + drop;
      } else if (soundType === 'waves') {
        // Ocean wave modulation
        const t = i / sampleRate;
        const mod = Math.sin(2 * Math.PI * 0.1 * t);
        lastOut = (lastOut + (0.015 * white)) / 1.015;
        data[i] = lastOut * Math.max(0, mod) * 0.5;
      }
    }

    channelBSource = audioCtx.createBufferSource();
    channelBSource.buffer = buffer;
    channelBSource.loop = true;
    channelBSource.connect(gainNodeB);
    channelBSource.start();
  }

  // --- Audio Playback Functions ---
  function playAudio() {
    if (!audioBuffer) return;

    if (isPlaying) {
      pauseAudio();
      return;
    }

    initAudioContext();

    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(gainNodeA);

    applyPitchShift();

    const offset = pauseOffset % audioBuffer.duration;
    sourceNode.start(0, offset);
    startTime = audioCtx.currentTime - offset;

    isPlaying = true;
    playPauseBtn.innerHTML = '<span class="btn-icon-label">⏸</span> Pausar';

    sourceNode.onended = () => {
      if (isPlaying && (audioCtx.currentTime - startTime) >= audioBuffer.duration) {
        stopAudio();
      }
    };

    updateBinauralOscillator();
    startChannelB(channelBSelect.value);
    drawVisualizer();
  }

  function pauseAudio() {
    if (!isPlaying) return;

    if (sourceNode) {
      sourceNode.stop();
      sourceNode.disconnect();
      sourceNode = null;
    }

    pauseOffset = audioCtx.currentTime - startTime;
    isPlaying = false;
    playPauseBtn.innerHTML = '<span class="btn-icon-label">▶</span> Tocar';

    updateBinauralOscillator();
    if (channelBSource) {
      try { channelBSource.stop(); } catch(e){}
      channelBSource = null;
    }

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
  }

  function stopAudio() {
    pauseAudio();
    pauseOffset = 0;
    seekBar.value = 0;
    currentTimeDisplay.textContent = '00:00';
    liveFreqDisplay.textContent = '-- Hz';
  }

  // --- Visualizer Rendering ---
  function drawVisualizer() {
    if (!isPlaying || !analyser) return;

    animationFrameId = requestAnimationFrame(drawVisualizer);

    const width = canvas.width;
    const height = canvas.height;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Calculate dominant frequency
    analyser.getByteFrequencyData(dataArray);
    let maxVal = 0;
    let maxIdx = 0;
    for (let i = 0; i < bufferLength; i++) {
      if (dataArray[i] > maxVal) {
        maxVal = dataArray[i];
        maxIdx = i;
      }
    }
    const nyquist = audioCtx.sampleRate / 2;
    const dominantFreq = Math.round((maxIdx * nyquist) / bufferLength);
    if (maxVal > 20) {
      liveFreqDisplay.textContent = `${dominantFreq} Hz`;
    } else {
      liveFreqDisplay.textContent = `-- Hz`;
    }

    // Clear Canvas
    canvasCtx.clearRect(0, 0, width, height);

    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--hz-color-primary').trim() || '#8b5cf6';
    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--hz-color-secondary').trim() || '#c084fc';

    if (visualizationMode === 'bars') {
      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;

        const gradient = canvasCtx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, primaryColor);
        gradient.addColorStop(1, secondaryColor);

        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
        if (x > width) break;
      }
    } else if (visualizationMode === 'wave') {
      const timeData = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(timeData);

      canvasCtx.lineWidth = 3;
      canvasCtx.strokeStyle = primaryColor;
      canvasCtx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = timeData[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(width, height / 2);
      canvasCtx.stroke();
    } else if (visualizationMode === 'circle') {
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(centerX, centerY) - 40;

      canvasCtx.beginPath();
      canvasCtx.arc(centerX, centerY, Math.max(10, radius * 0.4), 0, 2 * Math.PI);
      canvasCtx.strokeStyle = primaryColor;
      canvasCtx.lineWidth = 2;
      canvasCtx.stroke();

      const barsCount = 64;
      const step = (Math.PI * 2) / barsCount;

      for (let i = 0; i < barsCount; i++) {
        const value = dataArray[i * 2] || 0;
        const barLen = (value / 255) * (radius * 0.6);
        const angle = i * step;

        const x1 = centerX + Math.cos(angle) * (radius * 0.4);
        const y1 = centerY + Math.sin(angle) * (radius * 0.4);
        const x2 = centerX + Math.cos(angle) * (radius * 0.4 + barLen);
        const y2 = centerY + Math.sin(angle) * (radius * 0.4 + barLen);

        canvasCtx.strokeStyle = secondaryColor;
        canvasCtx.lineWidth = 3;
        canvasCtx.beginPath();
        canvasCtx.moveTo(x1, y1);
        canvasCtx.lineTo(x2, y2);
        canvasCtx.stroke();
      }
    }

    // Update Progress Seekbar
    if (isPlaying) {
      const currentPos = audioCtx.currentTime - startTime;
      seekBar.value = currentPos;
      currentTimeDisplay.textContent = formatTime(currentPos);
    }
  }

  // --- Export Audio to WAV (.wav) using OfflineAudioContext ---
  async function exportAudioWithFrequency() {
    if (!audioBuffer) return;

    exportStatus.textContent = 'Gerando arquivo .WAV com nova frequência...';
    exportWavBtn.disabled = true;

    try {
      const targetHz = currentTargetHz;
      const isPitch = pitchShiftToggle.checked;
      const playbackRate = isPitch ? (targetHz / 440) : 1.0;

      const duration = audioBuffer.duration / playbackRate;
      const sampleRate = audioBuffer.sampleRate;
      const offlineCtx = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        Math.ceil(duration * sampleRate),
        sampleRate
      );

      const offlineSource = offlineCtx.createBufferSource();
      offlineSource.buffer = audioBuffer;
      offlineSource.playbackRate.value = playbackRate;

      offlineSource.connect(offlineCtx.destination);

      // Add Binaural Tone if checked
      if (binauralToggle.checked) {
        const offlineOsc = offlineCtx.createOscillator();
        const offlineOscGain = offlineCtx.createGain();
        offlineOsc.type = 'sine';
        offlineOsc.frequency.value = targetHz;
        offlineOscGain.gain.value = 0.08;

        offlineOsc.connect(offlineOscGain);
        offlineOscGain.connect(offlineCtx.destination);

        offlineOsc.start(0);
        offlineOsc.stop(duration);
      }

      offlineSource.start(0);

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = audioBufferToWavBlob(renderedBuffer);

      const downloadUrl = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const nameWithoutExt = currentFileName.replace(/\.[^/.]+$/, "") || "musica";
      a.download = `${nameWithoutExt}_${targetHz}Hz.wav`;
      a.click();

      exportStatus.textContent = '✅ Download concluído!';
    } catch (err) {
      console.error(err);
      exportStatus.textContent = '❌ Erro ao exportar áudio: ' + err.message;
    } finally {
      exportWavBtn.disabled = false;
    }
  }

  // Convert AudioBuffer to WAV File Blob
  function audioBufferToWavBlob(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const outBuffer = new ArrayBuffer(length);
    const view = new DataView(outBuffer);
    const channels = [];
    let sample = 0;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"
    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);  // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit
    setUint32(0x61746164);                         // "data" chunk
    setUint32(length - pos - 4);                   // chunk length

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([outBuffer], { type: 'audio/wav' });

    function setUint16(data) {
      view.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data) {
      view.setUint32(pos, data, true);
      pos += 4;
    }
  }

  // Format seconds into MM:SS
  function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // --- Event Listeners ---

  // File Upload
  audioFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      loadAudioFile(e.target.files[0]);
    }
  });

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      loadAudioFile(e.dataTransfer.files[0]);
    }
  });

  // Player controls
  playPauseBtn.addEventListener('click', playAudio);
  stopBtn.addEventListener('click', stopAudio);

  seekBar.addEventListener('input', (e) => {
    if (audioBuffer) {
      pauseOffset = parseFloat(e.target.value);
      currentTimeDisplay.textContent = formatTime(pauseOffset);
      if (isPlaying) {
        pauseAudio();
        playAudio();
      }
    }
  });

  volumeControl.addEventListener('input', (e) => {
    if (masterGainNode) {
      masterGainNode.gain.setValueAtTime(parseFloat(e.target.value), audioCtx.currentTime);
    }
  });

  // Visualizer mode buttons
  visualizerModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      visualizerModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      visualizationMode = btn.dataset.mode;
    });
  });

  // Frequency therapy chips
  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const hz = parseInt(chip.dataset.hz, 10);
      updateHzTheme(hz);
    });
  });

  pitchShiftToggle.addEventListener('change', () => {
    if (isPlaying) applyPitchShift();
  });

  binauralToggle.addEventListener('change', () => {
    updateBinauralOscillator();
  });

  exportWavBtn.addEventListener('click', exportAudioWithFrequency);

  // Emotion selection
  emotionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      emotionBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const emotion = btn.dataset.emotion;
      const synthBuffer = createSyntheticAudioTrack(emotion);

      if (emotion === 'relaxed') updateHzTheme(432);
      if (emotion === 'focused') updateHzTheme(528);
      if (emotion === 'energetic') updateHzTheme(639);
      if (emotion === 'calm') updateHzTheme(741);

      stopAudio();
      audioBuffer = synthBuffer;
      currentFileName = `Trilha_${btn.querySelector('.name').textContent}.wav`;
      currentTrackTitle.textContent = currentFileName;
      durationDisplay.textContent = formatTime(audioBuffer.duration);
      seekBar.max = audioBuffer.duration;
      seekBar.disabled = false;
      playPauseBtn.disabled = false;
      stopBtn.disabled = false;
      exportWavBtn.disabled = false;
      canvasOverlay.classList.add('hidden');

      playAudio();
    });
  });

  // Remix & Crossfader Controls
  volChannelA.addEventListener('input', updateMixerGains);
  volChannelB.addEventListener('input', updateMixerGains);
  crossfader.addEventListener('input', updateMixerGains);

  channelBSelect.addEventListener('change', (e) => {
    startChannelB(e.target.value);
  });
});
