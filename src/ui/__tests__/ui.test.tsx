import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Button, ChipGroup, Text } from '@/ui';

initI18n('en');

describe('ui primitives', () => {
  it('renders text and a pressable button', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider>
        <Text>Hello</Text>
        <Button label="Save" onPress={onPress} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Hello')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('toggles chips in a group', async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider>
        <ChipGroup options={[{ value: 'a', label: 'Bubbles' }]} value={[]} onChange={onChange} />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(['a']);
  });
});
