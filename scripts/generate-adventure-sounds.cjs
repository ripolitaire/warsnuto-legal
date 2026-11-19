const fs = require('node:fs');
const path = require('node:path');

const sampleRate = 22050;
const output = path.join(__dirname, '..', 'assets', 'adventure', 'audio');
fs.mkdirSync(output, { recursive: true });

function writeWave(name, seconds, sample) {
  const length = Math.floor(sampleRate * seconds);
  const data = Buffer.alloc(length * 2);
  for (let index = 0; index < length; index += 1) {
    const value = Math.max(-1, Math.min(1, sample(index / sampleRate, index / length)));
    data.writeInt16LE(Math.round(value * 32767), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(output, `${name}.wav`), Buffer.concat([header, data]));
}

const tone = (frequency, start, duration, volume = 0.35) => (time, progress) => {
  const local = time - start;
  if (local < 0 || local > duration) return 0;
  const envelope = Math.sin(Math.PI * Math.min(1, local / duration)) ** 1.4;
  return Math.sin(2 * Math.PI * frequency * local) * envelope * volume;
};
const combine = tones => (time, progress) => tones.reduce((sum, value) => sum + value(time, progress), 0);

writeWave('click', .09, combine([tone(660, 0, .08, .28), tone(990, .022, .06, .18)]));
writeWave('navigate', .12, combine([tone(420, 0, .11, .22), tone(560, .025, .08, .16)]));
writeWave('attack', .22, (time, progress) => Math.sin(2 * Math.PI * (130 + progress * 260) * time) * Math.exp(-progress * 6) * .38);
writeWave('reward', .42, combine([tone(523, 0, .18, .23), tone(659, .11, .2, .24), tone(784, .22, .2, .27)]));
writeWave('discovery', .5, combine([tone(392, 0, .22, .18), tone(587, .1, .24, .2), tone(783, .22, .25, .23)]));
writeWave('victory', .9, combine([tone(392, 0, .2, .18), tone(494, .16, .21, .2), tone(587, .32, .22, .22), tone(784, .49, .34, .26)]));
writeWave('defeat', .6, combine([tone(392, 0, .28, .22), tone(330, .17, .3, .2), tone(247, .34, .25, .2)]));
writeWave('error', .28, combine([tone(210, 0, .12, .25), tone(180, .13, .12, .2)]));
writeWave('impact', .18, (time, progress) => (Math.sin(2 * Math.PI * 79 * time) + Math.sin(2 * Math.PI * 173 * time) * .4) * Math.exp(-progress * 13) * .3);
writeWave('guard', .3, combine([tone(587, 0, .12, .19), tone(1174, .02, .25, .11)]));
writeWave('heal', .65, combine([tone(440, 0, .3, .16), tone(554, .15, .3, .15), tone(659, .3, .33, .17)]));

let seed = 72821;
const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; };
writeWave('sea', 12, (time, progress) => {
  const swell = .55 + .45 * Math.sin(time * Math.PI * .52);
  const foam = (noise() + noise() + noise()) / 3;
  const tide = Math.sin(time * Math.PI * .17) * .08;
  return (foam * .12 * swell) + tide;
});

// Original procedural loops. They deliberately use simple synthesized harmony,
// never audio from One Piece or another game.
function ambientLoop({ root, pace, brightness, pulse }) {
  const progression = [0, 5, 3, 7];
  const ratios = [1, 1.25, 1.5];
  return time => {
    const step = Math.floor(time / pace) % progression.length;
    const local = (time % pace) / pace;
    const frequency = root * (2 ** (progression[step] / 12));
    const envelope = .28 + (.72 * Math.sin(Math.PI * local));
    const pad = ratios.reduce((total, ratio, index) => total + Math.sin(2 * Math.PI * frequency * ratio * time + index) * (.045 / (index + 1)), 0);
    const rhythm = Math.max(0, Math.sin(2 * Math.PI * (1 / pace) * time * pulse)) ** 16;
    const shimmer = Math.sin(2 * Math.PI * frequency * brightness * time) * .018;
    return (pad * envelope) + (rhythm * .022) + shimmer;
  };
}

writeWave('theme', 10, ambientLoop({ root: 130.81, pace: 1.25, brightness: 4, pulse: 2 }));
writeWave('harbour', 10, ambientLoop({ root: 146.83, pace: 1.5, brightness: 3, pulse: 2 }));
writeWave('storm', 10, ambientLoop({ root: 98, pace: .9, brightness: 2, pulse: 3 }));
writeWave('battle', 10, ambientLoop({ root: 110, pace: .62, brightness: 5, pulse: 4 }));
writeWave('boss', 10, ambientLoop({ root: 82.41, pace: .72, brightness: 2.5, pulse: 3 }));
