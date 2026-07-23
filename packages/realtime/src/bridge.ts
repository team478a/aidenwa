import type { RealtimeConnection, NormalizedRealtimeEvent } from './index.js';

export interface TwilioOutboundTransport {
  readonly bufferedAmount: number;
  send(value: string): void;
  close(code?: number, reason?: string): void;
}

export type BridgeLimits = {
  maxPendingAudioBytes: number;
  maxMessagesPerSecond: number;
  maxTwilioBufferedBytes: number;
};

type PendingMark = { generationId: string; audioEndMs: number; cleared: boolean };

export class PcmuRealtimeBridge {
  private streamSid: string | undefined;
  private lastSequence = -1;
  private pendingAudioBytes = 0;
  private currentSecond = -1;
  private messagesThisSecond = 0;
  private generation = 0;
  private activeGenerationId: string | undefined;
  private activeItemId: string | undefined;
  private generationAudioMs = 0;
  private ending = false;
  private readonly marks = new Map<string, PendingMark>();
  private readonly interruptedGenerations = new Set<string>();
  private readonly playedMs = new Map<string, number>();

  constructor(
    private readonly realtime: RealtimeConnection,
    private readonly twilio: TwilioOutboundTransport,
    private readonly limits: BridgeLimits,
    private readonly now: () => number = Date.now,
  ) {}

  setStream(streamSid: string) {
    if (!streamSid) throw new Error('STREAM_SID_REQUIRED');
    if (this.streamSid && this.streamSid !== streamSid) throw new Error('STREAM_SID_MISMATCH');
    this.streamSid = streamSid;
  }

  async receiveTwilioMedia(input: {
    streamSid: string;
    sequence: number;
    track: string;
    audio: Buffer;
  }) {
    this.checkMessageRate();
    this.setStream(input.streamSid);
    if (input.track !== 'inbound') throw new Error('INVALID_MEDIA_TRACK');
    if (input.sequence <= this.lastSequence) throw new Error('NON_MONOTONIC_STREAM_SEQUENCE');
    this.lastSequence = input.sequence;
    this.pendingAudioBytes += input.audio.length;
    if (this.pendingAudioBytes > this.limits.maxPendingAudioBytes)
      throw new Error('AUDIO_BUFFER_OVERFLOW');
    try {
      await this.realtime.appendCallerAudio(input.audio, input.sequence);
    } finally {
      this.pendingAudioBytes -= input.audio.length;
      input.audio.fill(0);
    }
  }

  async receiveRealtime(event: NormalizedRealtimeEvent) {
    if (this.ending) return;
    if (event.type === 'assistant.audio_delta') {
      if (this.interruptedGenerations.has(event.generationId)) return;
      if (this.activeGenerationId && event.generationId !== this.activeGenerationId) return;
      if (!this.activeGenerationId) {
        this.activeGenerationId = event.generationId;
        this.generation += 1;
      }
      this.sendAudio(event.audio, event.generationId);
      event.audio.fill(0);
      return;
    }
    if (event.type === 'assistant.response_done') return;
    if (event.type === 'assistant.item_started') {
      this.activeItemId = event.itemId;
      return;
    }
    if (event.type === 'caller.speech_started') await this.interrupt();
  }

  acknowledgeMark(streamSid: string, markName: string) {
    this.setStream(streamSid);
    const mark = this.marks.get(markName);
    if (!mark) return;
    this.marks.delete(markName);
    if (mark.cleared) return;
    this.playedMs.set(
      mark.generationId,
      Math.max(this.playedMs.get(mark.generationId) ?? 0, mark.audioEndMs),
    );
    return mark.audioEndMs;
  }

  async interrupt() {
    const generationId = this.activeGenerationId;
    if (!generationId || !this.streamSid) return;
    await this.realtime.cancelAssistantResponse('barge_in');
    this.interruptedGenerations.add(generationId);
    this.twilio.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
    for (const mark of this.marks.values())
      if (mark.generationId === generationId) mark.cleared = true;
    const playedMs = this.playedMs.get(generationId) ?? 0;
    if (this.activeItemId) await this.realtime.truncateAssistantAudio(this.activeItemId, playedMs);
    this.activeGenerationId = undefined;
    this.activeItemId = undefined;
    this.generationAudioMs = 0;
  }

  async close(reason: string) {
    if (this.ending) return;
    this.ending = true;
    await this.realtime.cancelAssistantResponse(reason).catch(() => undefined);
    this.marks.clear();
    await this.realtime.close(reason).catch(() => undefined);
    this.twilio.close(1000, reason.slice(0, 100));
  }

  private sendAudio(audio: Buffer, generationId: string) {
    if (!this.streamSid) throw new Error('STREAM_NOT_STARTED');
    if (this.twilio.bufferedAmount + audio.length > this.limits.maxTwilioBufferedBytes)
      throw new Error('TWILIO_BACKPRESSURE');
    this.generationAudioMs += Math.ceil(audio.length / 8);
    const markName = `g${this.generation}-m${this.generationAudioMs}`;
    this.twilio.send(
      JSON.stringify({
        event: 'media',
        streamSid: this.streamSid,
        media: { payload: audio.toString('base64') },
      }),
    );
    this.twilio.send(
      JSON.stringify({ event: 'mark', streamSid: this.streamSid, mark: { name: markName } }),
    );
    this.marks.set(markName, { generationId, audioEndMs: this.generationAudioMs, cleared: false });
  }

  private checkMessageRate() {
    const second = Math.floor(this.now() / 1000);
    if (second !== this.currentSecond) {
      this.currentSecond = second;
      this.messagesThisSecond = 0;
    }
    this.messagesThisSecond += 1;
    if (this.messagesThisSecond > this.limits.maxMessagesPerSecond)
      throw new Error('MESSAGE_RATE_EXCEEDED');
  }
}
