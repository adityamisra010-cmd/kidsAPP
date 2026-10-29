/* Minimal react-native-reanimated mock for Jest (the official mock initialises native CSS handlers). */
const React = require('react');
const RN = require('react-native');

const anim = () => {
  const a = { duration: () => a, delay: () => a, springify: () => a, damping: () => a, easing: () => a };
  return a;
};
const createAnimatedComponent = (C) => {
  const Animated = React.forwardRef((props, ref) => React.createElement(C, { ...props, ref }));
  Animated.displayName = `Animated(${C.displayName || C.name || 'Component'})`;
  return Animated;
};

const Animated = {
  View: createAnimatedComponent(RN.View),
  Text: createAnimatedComponent(RN.Text),
  ScrollView: createAnimatedComponent(RN.ScrollView),
  Image: createAnimatedComponent(RN.Image),
  FlatList: createAnimatedComponent(RN.FlatList),
  createAnimatedComponent,
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  useSharedValue: (v) => ({ value: v }),
  useAnimatedStyle: (fn) => fn(),
  useDerivedValue: (fn) => ({ value: fn() }),
  useAnimatedProps: (fn) => fn(),
  withTiming: (v) => v,
  withSpring: (v) => v,
  withRepeat: (v) => v,
  withSequence: (...v) => v[v.length - 1],
  withDelay: (_d, v) => v,
  cancelAnimation: () => undefined,
  runOnJS: (fn) => fn,
  interpolate: (v) => v,
  Easing: { linear: (t) => t, ease: (t) => t, out: (f) => f, in: (f) => f, inOut: (f) => f, cubic: (t) => t },
  FadeIn: anim(),
  FadeOut: anim(),
  FadeInDown: anim(),
  FadeOutDown: anim(),
  FadeInUp: anim(),
  ZoomIn: anim(),
  Layout: anim(),
  LinearTransition: anim(),
  useReducedMotion: () => false,
};
