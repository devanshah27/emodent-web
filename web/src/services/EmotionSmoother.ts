import { EmotionClass } from '../types';

export type SmootherLabel = EmotionClass | 'UNCERTAIN' | 'NO_RESULT';

/**
 * EmotionSmoother
 * Implements a rolling majority vote over the last N frames to prevent
 * high-frequency label flickering in real-time browser video rendering.
 */
export class EmotionSmoother {
  private windowSize: number;
  private history: SmootherLabel[];

  constructor(windowSize: number = 15) {
    this.windowSize = Math.max(1, windowSize);
    this.history = [];
  }

  public setWindowSize(size: number): void {
    this.windowSize = Math.max(1, size);
    if (this.history.length > this.windowSize) {
      this.history = this.history.slice(this.history.length - this.windowSize);
    }
  }

  public add(label: SmootherLabel): SmootherLabel {
    this.history.push(label);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }
    return this.getMajority();
  }

  public getMajority(): SmootherLabel {
    if (this.history.length === 0) {
      return 'NO_RESULT';
    }

    const counts: Record<string, number> = {};
    for (const item of this.history) {
      counts[item] = (counts[item] || 0) + 1;
    }

    // Find the item with highest count
    // In case of a tie, the most recent label takes precedence
    let maxCount = -1;
    let majorityItem: SmootherLabel = this.history[this.history.length - 1];

    for (let i = this.history.length - 1; i >= 0; i--) {
      const item = this.history[i];
      const count = counts[item];
      if (count > maxCount) {
        maxCount = count;
        majorityItem = item;
      }
    }

    return majorityItem;
  }

  public getHistory(): SmootherLabel[] {
    return [...this.history];
  }

  public clear(): void {
    this.history = [];
  }
}
