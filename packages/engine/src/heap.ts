/**
 * Binary min-heap of (priority, key) pairs. Equal priorities pop in ascending key order, so the
 * search order never depends on insertion order or engine-specific sort stability.
 */
export class MinHeap {
  private pri: number[] = [];
  private key: number[] = [];

  get size(): number {
    return this.pri.length;
  }

  push(priority: number, key: number): void {
    this.pri.push(priority);
    this.key.push(key);
    this.up(this.pri.length - 1);
  }

  /** Returns the key with the smallest priority, or -1 when empty. */
  pop(): number {
    const n = this.pri.length;
    if (n === 0) return -1;
    const top = this.key[0]!;
    const lastP = this.pri.pop()!;
    const lastK = this.key.pop()!;
    if (n > 1) {
      this.pri[0] = lastP;
      this.key[0] = lastK;
      this.down(0);
    }
    return top;
  }

  peekPriority(): number {
    return this.pri.length ? this.pri[0]! : Infinity;
  }

  private less(i: number, j: number): boolean {
    const a = this.pri[i]!;
    const b = this.pri[j]!;
    return a < b || (a === b && this.key[i]! < this.key[j]!);
  }

  private swap(i: number, j: number): void {
    const p = this.pri[i]!;
    this.pri[i] = this.pri[j]!;
    this.pri[j] = p;
    const k = this.key[i]!;
    this.key[i] = this.key[j]!;
    this.key[j] = k;
  }

  private up(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private down(i: number): void {
    const n = this.pri.length;
    for (;;) {
      const l = 2 * i + 1;
      const rr = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (rr < n && this.less(rr, m)) m = rr;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
  }
}
