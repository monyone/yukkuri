export default class RingBuffer<T extends { timestamp: number }> {
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

  public not_before(sequence_number: number): boolean {
    if (this.baseSequenceNumber == null) { return false; }
    return (this.sequenceNumberRange / 2) > ((sequence_number - this.baseSequenceNumber + this.sequenceNumberRange) % (this.sequenceNumberRange))
  }

  public size(): number {
    return (this.tail - this.head + this.length) % this.length;
  }

  public avails() {
    return (this.length - 1) - (this.size());
  }

  public is_empty(): boolean {
    return this.size() === 0;
  }

  public values(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.size(); i++) {
      const value = this.ring[(this.head + i) % this.length];
      if (value == null) { continue; }
      result.push(value);
    }
    return result;
  }

  public has(sequence_number: number): boolean {
    if (this.baseSequenceNumber == null) { return false; }
    if (!this.not_before(sequence_number)) { return false; }

    const index = (sequence_number - this.baseSequenceNumber + this.sequenceNumberRange) % (this.sequenceNumberRange);
    return index < this.size();
  }

  public get(sequence_number: number): T | null {
    if (this.baseSequenceNumber == null) { return null; }
    if (!this.has(sequence_number)) { return null; }

    const index = (sequence_number - this.baseSequenceNumber + this.sequenceNumberRange) % (this.sequenceNumberRange);
    return this.ring[(this.head + index) % this.length];
  }

  public top(): number | null {
    if (this.baseSequenceNumber == null) { return null; }
    if (this.is_empty()) { return null; }

    return (this.baseSequenceNumber + ((this.size() - 1 + this.length) % this.length)) % this.sequenceNumberRange;
  }

  public pop(timestamp: number): (T | null)[] {
    if (this.is_empty()) { return []; }
    if (this.baseSequenceNumber == null) { return []; }

    const result: (T | null)[] = [];
    let dropping: (null)[] = [];
    while (!this.is_empty()) {
      const data = this.ring[(this.head + dropping.length) % this.length];
      if (data) {
        if (data.timestamp > timestamp) { break; }

        result.push(... dropping);
        result.push(data);

        for (let i = 0; i < dropping.length + 1; i++) {
          this.ring[this.head] = null;
          this.head = (this.head + 1) % this.length;
          this.baseSequenceNumber = (this.baseSequenceNumber + 1) % this.sequenceNumberRange;
        };
        dropping = [];
      } else {
        dropping.push(data);
      }
    }

    return result;
  }

  public exseed(sequence_number: number): number {
    if (this.baseSequenceNumber == null) { return 0; }
    if (this.is_empty()) { return 0; }
    if (!this.not_before(sequence_number)) { return 0; }

    const diff = (sequence_number - this.top()! + this.sequenceNumberRange) % this.sequenceNumberRange;
    return ((this.sequenceNumberRange / 2) > diff) ? diff : 0;
  }

  public push(payload: T, sequence_number: number): (T | null)[] {
    if (this.baseSequenceNumber == null) {
      this.baseSequenceNumber = this.continuitySequenceNumber = sequence_number;
    }
    if (!this.not_before(sequence_number)) { return []; }
    const slide: (T | null)[] = [];
    
    let index = ((sequence_number - this.baseSequenceNumber) + this.sequenceNumberRange) % (this.sequenceNumberRange);
    while (index >= (this.length - 1)) {
      slide.push(this.ring[this.head]);
      this.ring[this.head] = null;
      this.head = (this.head + 1) % this.length;
      this.baseSequenceNumber = (this.baseSequenceNumber + 1) % (this.sequenceNumberRange);
      index = ((sequence_number - this.baseSequenceNumber) + this.sequenceNumberRange) % (this.sequenceNumberRange);
    }

    this.ring[(this.head + index) % this.length] = payload;
    this.tail = (this.head + Math.max(index + 1, this.size())) % this.length;

    if (this.continuitySequenceNumber == null) { return slide; }

    if (!this.not_before(this.continuitySequenceNumber) && this.ring[this.head] != null) {
      this.continuitySequenceNumber = this.baseSequenceNumber;
    }
    if (this.not_before(this.continuitySequenceNumber)) {
      const offset = (this.continuitySequenceNumber - this.baseSequenceNumber + this.sequenceNumberRange) % this.sequenceNumberRange;
      for (let i = offset + 1; i < this.size(); i++) {
        if (this.ring[(this.head + i) % this.length] == null) { break; }
        this.continuitySequenceNumber = (this.continuitySequenceNumber + 1) % this.sequenceNumberRange;
      }
    }

    return slide;
  }

  public continuity(): number | null {
    return this.continuitySequenceNumber;
  }

  public gaps(): [number, number][] {
    const gaps: [number, number][] = [];
    if (this.baseSequenceNumber == null) { return gaps; }

    const size = this.size();
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