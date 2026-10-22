import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useContainPinchZoom } from '@/hooks/useContainPinchZoom';

function Stage() {
  const ref = useRef<HTMLDivElement>(null);
  useContainPinchZoom(ref);
  return (
    <div>
      <div ref={ref} data-testid="map">
        <span data-testid="inside" />
      </div>
      <span data-testid="outside" />
    </div>
  );
}

const wheel = (target: Element, init: WheelEventInit) => {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

describe('useContainPinchZoom', () => {
  afterEach(cleanup);

  it('cancels a trackpad pinch (ctrl + wheel) over the map, so the page does not zoom', () => {
    const { getByTestId } = render(<Stage />);
    expect(wheel(getByTestId('inside'), { ctrlKey: true, deltaY: -8 }).defaultPrevented).toBe(true);
  });

  it('leaves a plain scroll over the map alone', () => {
    const { getByTestId } = render(<Stage />);
    expect(wheel(getByTestId('inside'), { deltaY: 40 }).defaultPrevented).toBe(false);
  });

  it('does not touch pinch or browser zoom outside the map', () => {
    const { getByTestId } = render(<Stage />);
    expect(wheel(getByTestId('outside'), { ctrlKey: true, deltaY: -8 }).defaultPrevented).toBe(false);
  });
});
