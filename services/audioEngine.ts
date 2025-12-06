export class AudioEngine {
  private context: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private isPlaying = false;

  constructor() {
    try {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.error("Web Audio API not supported");
    }
  }

  public start() {
    if (!this.context) return;
    if (this.isPlaying) return;

    this.osc1 = this.context.createOscillator();
    this.osc2 = this.context.createOscillator();
    this.gainNode = this.context.createGain();
    this.filterNode = this.context.createBiquadFilter();

    // Setup signal chain: Oscillators -> Filter -> Gain -> Destination
    
    // Osc 1: Base drone
    this.osc1.type = 'sine';
    this.osc1.frequency.value = 60; // Deep base (C2 approx)

    // Osc 2: Harmony (Perfect Fifth) + Detune for liquid phasing effect
    this.osc2.type = 'sine';
    this.osc2.frequency.value = 90; // G2 approx
    this.osc2.detune.value = 5; // Slight detune for shimmer

    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 200;
    this.filterNode.Q.value = 2;

    this.gainNode.gain.value = 0;

    this.osc1.connect(this.filterNode);
    this.osc2.connect(this.filterNode);
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(this.context.destination);

    this.osc1.start();
    this.osc2.start();
    this.isPlaying = true;
  }

  public update(depth: number, isPinching: boolean) {
    if (!this.context || !this.gainNode || !this.filterNode || !this.osc1 || !this.osc2) return;

    // Depth: 0 (Far) -> 1 (Close/Touch)
    
    // Volume Control: Smooth fade in/out
    // Finger moving forward (depth increasing) -> Louder
    const targetGain = Math.max(0, Math.min(0.8, depth)); 
    this.gainNode.gain.setTargetAtTime(targetGain, this.context.currentTime, 0.2);

    // Filter Cutoff (The "Underwater" to "Surface" clarity effect)
    // Deeper/Closer = brighter sound (breaking surface)
    const baseFreq = 150;
    const maxFreq = 2000;
    const targetFreq = baseFreq + (maxFreq - baseFreq) * (depth * depth);
    this.filterNode.frequency.setTargetAtTime(targetFreq, this.context.currentTime, 0.1);

    // Pitch/Modulation based on pinch (Tension)
    // When pinching, pitch glides up slightly
    const basePitch = 60;
    const tensionPitch = 65; 
    const targetBasePitch = isPinching ? tensionPitch : basePitch;
    
    this.osc1.frequency.setTargetAtTime(targetBasePitch, this.context.currentTime, 0.2);
    this.osc2.frequency.setTargetAtTime(targetBasePitch * 1.5, this.context.currentTime, 0.2);
  }

  public stop() {
    if (this.osc1) {
      this.osc1.stop();
      this.osc1.disconnect();
    }
    if (this.osc2) {
      this.osc2.stop();
      this.osc2.disconnect();
    }
    this.isPlaying = false;
  }

  public resume() {
    if (this.context && this.context.state === 'suspended') {
      this.context.resume();
    }
  }
}