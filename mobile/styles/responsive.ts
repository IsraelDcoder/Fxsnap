import { useWindowDimensions, Dimensions } from 'react-native';

// Lightweight wp/hp implementations to avoid adding an external dependency until
// the project installs it. These mirror react-native-responsive-screen behavior.
export function wp(percentage: string | number) {
  const perc = typeof percentage === 'string' ? parseFloat(percentage) : Number(percentage);
  const { width } = Dimensions.get('window');
  return (width * perc) / 100;
}

export function hp(percentage: string | number) {
  const perc = typeof percentage === 'string' ? parseFloat(percentage) : Number(percentage);
  const { height } = Dimensions.get('window');
  return (height * perc) / 100;
}

export function useBreakpoints() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isSmallPhone: width < 360,
    isPhone: width >= 360 && width < 768,
    isTablet: width >= 768,
  };
}
