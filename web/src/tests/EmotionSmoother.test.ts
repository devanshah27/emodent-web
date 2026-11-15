import { describe, it, expect, beforeEach } from 'vitest';
import { EmotionSmoother } from '../services/EmotionSmoother';

describe('EmotionSmoother Unit Tests', () => {
  let smoother: EmotionSmoother;

  beforeEach(() => {
    smoother = new EmotionSmoother(5); // 5-frame window for testing
  });

  it('initial state produces NO_RESULT', () => {
    expect(smoother.getMajority()).toBe('NO_RESULT');
  });

  it('correctly tracks single and rolling entries', () => {
    expect(smoother.add('happy')).toBe('happy');
    expect(smoother.add('happy')).toBe('happy');
    expect(smoother.add('sad')).toBe('happy'); // 2 happy vs 1 sad -> happy
  });

  it('switches majority when dominant emotion changes', () => {
    smoother.add('happy');
    smoother.add('happy');
    smoother.add('neutral');
    smoother.add('neutral');
    const result = smoother.add('neutral'); // 3 neutral vs 2 happy
    expect(result).toBe('neutral');
  });

  it('evicts old items beyond window size', () => {
    // Fill with 5 happy
    for (let i = 0; i < 5; i++) {
      smoother.add('happy');
    }
    expect(smoother.getMajority()).toBe('happy');

    // Add 5 angry frames
    for (let i = 0; i < 5; i++) {
      smoother.add('angry');
    }
    expect(smoother.getMajority()).toBe('angry');
    expect(smoother.getHistory()).toEqual(['angry', 'angry', 'angry', 'angry', 'angry']);
  });

  it('handles UNCERTAIN and NO_RESULT correctly', () => {
    smoother.add('UNCERTAIN');
    smoother.add('UNCERTAIN');
    smoother.add('happy');
    expect(smoother.getMajority()).toBe('UNCERTAIN');

    smoother.clear();
    expect(smoother.getHistory().length).toBe(0);
  });
});

