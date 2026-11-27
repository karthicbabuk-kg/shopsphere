import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerWakeBanner } from '../components/ServerWakeBanner';
import { SLOW_AFTER_MS, trackEnd, trackStart, useSlowApi } from './slowApi';

describe('slow API tracking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSlowApi.setState({ slow: 0 });
  });
  afterEach(() => vi.useRealTimers());

  it('stays quiet for fast requests', () => {
    const req = {};
    trackStart(req);
    vi.advanceTimersByTime(SLOW_AFTER_MS - 100);
    trackEnd(req);
    vi.advanceTimersByTime(SLOW_AFTER_MS);
    expect(useSlowApi.getState().slow).toBe(0);
  });

  it('shows the waking-up banner for a slow request and hides it when the request ends', () => {
    render(<ServerWakeBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    const req = {};
    trackStart(req);
    act(() => void vi.advanceTimersByTime(SLOW_AFTER_MS + 10));
    expect(screen.getByRole('status')).toHaveTextContent(/waking up/i);
    act(() => trackEnd(req));
    expect(screen.queryByRole('status')).toBeNull();
    expect(useSlowApi.getState().slow).toBe(0);
  });

  it('counts overlapping slow requests and never goes negative', () => {
    const a = {};
    const b = {};
    trackStart(a);
    trackStart(b);
    vi.advanceTimersByTime(SLOW_AFTER_MS + 10);
    expect(useSlowApi.getState().slow).toBe(2);
    trackEnd(a);
    expect(useSlowApi.getState().slow).toBe(1);
    trackEnd(a);
    trackEnd(b);
    expect(useSlowApi.getState().slow).toBe(0);
  });
});
