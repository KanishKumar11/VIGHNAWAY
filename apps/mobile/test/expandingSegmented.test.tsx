import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Bike, Car, Footprints } from '@/components/icons';
import { ExpandingSegmented } from '@/components/ExpandingSegmented';

type Way = 'car' | 'bike' | 'foot';
const options = [
  { value: 'car' as const, label: 'Car', icon: Car, testID: 'opt-car' },
  { value: 'bike' as const, label: 'Two-wheeler', icon: Bike, testID: 'opt-bike' },
  { value: 'foot' as const, label: 'On foot', icon: Footprints, testID: 'opt-foot' },
];

function Harness({ onChange }: { onChange?: (v: Way) => void }) {
  const [value, setValue] = useState<Way>('car');
  return (
    <ExpandingSegmented
      accessibilityLabel="Way"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      options={options}
    />
  );
}

describe('ExpandingSegmented', () => {
  it('shows the name of the chosen option only', async () => {
    await render(<Harness />);
    expect(screen.getByText('Car')).toBeTruthy();
    expect(screen.queryByText('Two-wheeler')).toBeNull();
    expect(screen.queryByText('On foot')).toBeNull();
  });

  it('moves the name to the option that is pressed, on that press', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('opt-bike'));
    expect(onChange).toHaveBeenCalledWith('bike');
    expect(screen.getByText('Two-wheeler')).toBeTruthy();
    expect(screen.queryByText('Car')).toBeNull();
  });

  it('keeps every option named for screen readers, selected or not', async () => {
    await render(<Harness />);
    expect(screen.getByLabelText('On foot')).toBeTruthy();
    expect(screen.getByLabelText('Two-wheeler')).toBeTruthy();
    expect(screen.getByLabelText('Car', { exact: true }).props.accessibilityState).toMatchObject({ selected: true });
  });
});
