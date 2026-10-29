export function createMix(context: BaseAudioContext) {
  const input = context.createGain();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.16;
  // Catch exceptional bursts after compression without hard digital clipping.
  const limiter = context.createWaveShaper();
  limiter.curve = Float32Array.from({ length: 2048 }, (_, i) => {
    const x = (i / 2047) * 2 - 1;
    const magnitude = Math.abs(x);
    return (
      Math.sign(x) *
      (magnitude <= 0.78 ? magnitude : 0.78 + 0.18 * Math.tanh((magnitude - 0.78) / 0.18))
    );
  });
  limiter.oversample = '2x';
  // A quiet, short room response gives physical weight without a long echo.
  const room = context.createConvolver();
  const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * 0.18), context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = impulse.getChannelData(channel);
    for (let i = 0; i < samples.length; i++)
      samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 3);
  }
  room.buffer = impulse;
  const wet = context.createGain();
  wet.gain.value = 0.075;
  input.connect(master);
  input.connect(room).connect(wet).connect(master);
  master.connect(compressor).connect(limiter).connect(context.destination);
  return { input, master };
}
