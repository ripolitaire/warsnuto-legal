(() => {
  'use strict';

  const sounds = new Map();
  const sceneTracks = new Map();
  let preferences = { enabled: false, music: 35, effects: 35, ambience: 28, reducedMotion: false };
  let storageKey = 'warsnuto:adventure:audio:guest';
  let activeScene = '';
  let initialized = false;
  const $ = selector => document.querySelector(selector);
  const audioPath = name => `/assets/adventure/audio/${name}.wav`;

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
    document.documentElement.dataset.gameReducedMotion = String(preferences.reducedMotion);
  }

  function read() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      if (stored && typeof stored === 'object') preferences = { ...preferences, ...stored };
    } catch {}
    preferences.enabled = Boolean(preferences.enabled);
    for (const key of ['music', 'effects', 'ambience']) preferences[key] = Math.max(0, Math.min(100, Number(preferences[key]) || 0));
    preferences.reducedMotion = Boolean(preferences.reducedMotion);
    document.documentElement.dataset.gameReducedMotion = String(preferences.reducedMotion);
  }

  function create(name, loop = false) {
    const audio = new Audio(audioPath(name));
    audio.preload = loop ? 'metadata' : 'auto';
    audio.loop = loop;
    sounds.set(name, audio);
    return audio;
  }

  function preload() {
    if (initialized) return;
    initialized = true;
    for (const name of ['click', 'navigate', 'attack', 'reward', 'discovery', 'victory', 'defeat', 'error']) create(name);
    for (const [name, channel] of [['theme', 'music'], ['harbour', 'music'], ['storm', 'music'], ['battle', 'music'], ['boss', 'music'], ['sea', 'ambience']]) {
      sceneTracks.set(name, { audio: create(name, true), channel, timer: null });
    }
  }

  function play(name, channel = 'effects') {
    if (!preferences.enabled) return;
    const source = sounds.get(name);
    if (!source) return;
    const audio = source.cloneNode(true);
    audio.volume = preferences[channel] / 100;
    audio.play().catch(() => {});
  }

  function stopScenes() {
    for (const track of sceneTracks.values()) {
      if (track.timer) clearInterval(track.timer);
      track.timer = null;
      track.audio.pause();
      track.audio.currentTime = 0;
    }
  }

  function fade(track, target) {
    if (track.timer) clearInterval(track.timer);
    const audio = track.audio;
    const start = audio.volume;
    const startedAt = performance.now();
    track.timer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / 280);
      audio.volume = start + ((target - start) * progress);
      if (progress < 1) return;
      clearInterval(track.timer);
      track.timer = null;
      if (!target) { audio.pause(); audio.currentTime = 0; }
    }, 20);
  }

  function scene(name, force = false) {
    const scenes = {
      theme: ['theme'],
      sea: ['theme', 'sea'],
      harbour: ['harbour', 'sea'],
      storm: ['storm', 'sea'],
      battle: ['battle'],
      boss: ['boss']
    };
    const wanted = scenes[name] || scenes.theme;
    const unchanged = activeScene === name;
    activeScene = name;
    if (!preferences.enabled) return;
    if (!force && unchanged && wanted.some(key => !sceneTracks.get(key).audio.paused)) return;
    for (const [key, track] of sceneTracks) {
      const target = wanted.includes(key) ? preferences[track.channel] / 100 : 0;
      if (target && track.audio.paused) {
        track.audio.volume = 0;
        track.audio.play().catch(() => {});
      }
      fade(track, target);
    }
  }

  function effect(name) {
    const mapped = {
      equip: 'click',
      navigate: 'navigate',
      attack: 'attack',
      reward: 'reward',
      discovery: 'discovery',
      victory: 'victory',
      defeat: 'defeat',
      error: 'error'
    };
    play(mapped[name] || 'click');
  }

  function updateControls() {
    const enabled = $('#audio-enabled');
    if (!enabled) return;
    enabled.checked = preferences.enabled;
    $('#game-motion').checked = preferences.reducedMotion;
    for (const key of ['music', 'effects', 'ambience']) {
      const input = $(`#audio-${key}`);
      const output = $(`#audio-${key}-value`);
      input.value = String(preferences[key]);
      output.value = `${preferences[key]} %`;
      output.textContent = `${preferences[key]} %`;
    }
  }

  function bindControls() {
    const dialog = $('#audio-dialog');
    if (!dialog) return;
    dialog.addEventListener('close', () => {
      save();
      scene(activeScene, true);
    });
    $('#audio-enabled').addEventListener('change', event => {
      preferences.enabled = event.target.checked;
      if (preferences.enabled) {
        preload();
        effect('navigate');
        scene(activeScene, true);
      } else {
        stopScenes();
      }
      save();
    });
    $('#game-motion').addEventListener('change', event => {
      preferences.reducedMotion = event.target.checked;
      save();
    });
    for (const key of ['music', 'effects', 'ambience']) {
      const input = $(`#audio-${key}`);
      input.addEventListener('input', event => {
        preferences[key] = Number(event.target.value);
        $(`#audio-${key}-value`).textContent = `${preferences[key]} %`;
        if (key === 'ambience' || key === 'music') scene(activeScene, true);
      });
      input.addEventListener('change', save);
    }
  }

  window.WarsAdventureAudio = {
    init(userId) {
      storageKey = `warsnuto:adventure:audio:${userId}`;
      read();
      bindControls();
      updateControls();
      if (preferences.enabled) preload();
    },
    scene,
    effect,
    stop: stopScenes
  };
})();
