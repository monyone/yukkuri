export default class RingBuffer<T> {
  private ring: (T | null)[] = [];
  private head: number = 0;
  private tail: number = 0;
  private length: number;

  private baseSequenceNumber: number | null = null;
  private continuitySequenceNumber: number | null = null;
  private sequenceNumberRange: number;

  public constructor(length: number, range: number) {
    this.length = Math.max(length, 2);
    for (let i = 0; i < this.length; i++){ this.ring.push(null); }
    this.sequenceNumberRange = range;
  }

  public after(sequence_number: number): boolean {
    if (this.baseSequenceNumber == null) { return false; }
    return (this.sequenceNumberRange / 2) > ((sequence_number - this.baseSequenceNumber + this.sequenceNumberRange) % (this.sequenceNumberRange))
  }

  public has(sequence_number: number): boolean {
    if (this.baseSequenceNumber == null) { return false; }
    if (!this.after(sequence_number)) { return false; }
    const size = (this.tail - this.head + this.length) % this.length;
    const index = (sequence_number - this.baseSequenceNumber + this.sequenceNumberRange) % (this.sequenceNumberRange);

    return index < size;
  }

  public get(sequence_number: number): T | null {
    if (this.baseSequenceNumber == null) { return null; }
    if (!this.has(sequence_number)) { return null; }

    const index = (sequence_number - this.baseSequenceNumber + this.sequenceNumberRange) % (this.sequenceNumberRange);
    return this.ring[(this.head + index) % this.length];
  }

  public exseed(sequence_number: number): number {
    if (this.baseSequenceNumber == null) { return 0; }
    if (!this.after(sequence_number)) { return 0; }

    const size = (this.tail - this.head + this.length) % this.length;
    const topSequenceNumber = (this.baseSequenceNumber + ((size - 1 + this.length) % this.length)) % this.sequenceNumberRange;
    const diff = (sequence_number - topSequenceNumber + this.sequenceNumberRange) % this.sequenceNumberRange;
    return ((this.sequenceNumberRange / 2) > diff) ? diff : 0;
  }

  public push(payload: T, sequence_number: number): (T | null)[] {
    if (this.baseSequenceNumber == null) {
      this.baseSequenceNumber = this.continuitySequenceNumber = sequence_number;
    }
    if (!this.after(sequence_number)) { return []; }
    const slide: (T | null)[] = [];
    
    let size = ((this.tail - this.head + this.length) % this.length);
    let index = ((sequence_number - this.baseSequenceNumber) + this.sequenceNumberRange) % (this.sequenceNumberRange);
    while (index >= (this.length - 1)) {
      slide.push(this.ring[this.head]);
      this.ring[this.head] = null;
      this.head = (this.head + 1) % this.length;
      this.baseSequenceNumber = (this.baseSequenceNumber + 1) % (this.sequenceNumberRange);
      size = (((this.tail - this.head) + this.length) % this.length);
      index = ((sequence_number - this.baseSequenceNumber) + this.sequenceNumberRange) % (this.sequenceNumberRange);
    }

    this.ring[(this.head + index) % this.length] = payload;
    this.tail = (this.head + Math.max(index + 1, size)) % this.length;
    size = (((this.tail - this.head) + this.length) % this.length);

    if (this.continuitySequenceNumber == null) { return slide; }

    if (!this.after(this.continuitySequenceNumber) && this.ring[this.head] != null) {
      this.continuitySequenceNumber = this.baseSequenceNumber;
    }
    if (this.after(this.continuitySequenceNumber)) {
      const offset = (this.continuitySequenceNumber - this.baseSequenceNumber + this.sequenceNumberRange) % this.sequenceNumberRange;
      for (let i = offset + 1; i < size; i++) {
        if (this.ring[(this.head + i) % this.length] == null) { break; }
        this.continuitySequenceNumber = (this.continuitySequenceNumber + 1) % this.sequenceNumberRange;
      }
    }

    return slide;
  }

  public topSequence(): number | null {
    if (this.baseSequenceNumber == null) { return null; }
    const size = (this.tail - this.head + this.length) % this.length;
    const topSequenceNumber = (this.baseSequenceNumber + ((size - 1 + this.length) % this.length)) % this.sequenceNumberRange;
    return topSequenceNumber;
  }

  public continuitySequence(): number | null {
    return this.continuitySequenceNumber;
  }

  public gapSequences(): [number, number][] {
    const gaps: [number, number][] = [];
    if (this.baseSequenceNumber == null) { return gaps; }

    const size = (this.tail - this.head + this.length) % this.length;
    for (let i = 0; i < size; i++) {
      if (this.ring[(this.head + i) % this.length] != null) { continue; }

      let j = i;
      for (; j < size; j++) {
        if (this.ring[(this.head + j) % this.length] == null) { continue; }
        break;
      }

      const from = (this.baseSequenceNumber + i) % this.sequenceNumberRange;
      const to = (this.baseSequenceNumber + (j - 1)) % this.sequenceNumberRange;

      gaps.push([from, to]);
      i = j;
    }

    return gaps;
  }
}