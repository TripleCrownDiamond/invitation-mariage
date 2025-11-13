document.addEventListener('DOMContentLoaded', () => {
  const audio = document.getElementById('appAudio');
  const toggle = document.getElementById('audioToggle');
  const seek = document.getElementById('audioSeek');
  const volume = document.getElementById('audioVolume');
  const time = document.getElementById('audioTime');
  const closeBtn = document.getElementById('audioClose');
  const bar = document.querySelector('.audio-player');

  function fmt(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function setPlayingUI(playing) {
    toggle.textContent = playing ? '⏸' : '⏵';
  }

  function updateTime() {
    time.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
  }

  // Initial volume
  audio.volume = parseFloat(volume.value || '0.8');

  audio.addEventListener('loadedmetadata', updateTime);
  audio.addEventListener('timeupdate', () => {
    if (audio.duration && isFinite(audio.duration)) {
      seek.value = Math.floor((audio.currentTime / audio.duration) * 100);
    }
    updateTime();
  });

  seek.addEventListener('input', () => {
    if (audio.duration && isFinite(audio.duration)) {
      audio.currentTime = (seek.value / 100) * audio.duration;
    }
  });

  volume.addEventListener('input', () => {
    audio.volume = parseFloat(volume.value);
  });

  toggle.addEventListener('click', () => {
    if (audio.paused) {
      audio.play().then(() => setPlayingUI(true)).catch(() => setPlayingUI(false));
    } else {
      audio.pause();
      setPlayingUI(false);
    }
  });

  // Try autoplay; if blocked, wait for first user interaction
  function attemptAutoplay() {
    audio.play()
      .then(() => setPlayingUI(true))
      .catch(() => {
        // Autoplay blocked; show play icon until user interacts
        setPlayingUI(false);
        const kick = () => {
          audio.play().then(() => setPlayingUI(true)).catch(() => {});
          document.removeEventListener('click', kick);
        };
        document.addEventListener('click', kick, { once: true });
      });
  }
  attemptAutoplay();

  closeBtn.addEventListener('click', () => {
    audio.pause();
    setPlayingUI(false);
    bar.classList.add('hidden');
  });
});