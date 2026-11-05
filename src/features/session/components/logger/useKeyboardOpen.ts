import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** True while the software keyboard is open (the save bar steps aside so inputs stay visible). */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setOpen(true),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}
