import React, { useImperativeHandle, forwardRef } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Image as EImage } from 'expo-image';

export type ZoomableImagePreviewV2Ref = {
  reset: () => void;
};

type Props = {
  uri: string;
  frameW: number;
  frameH: number;
  onLoad?: () => void;
  onError?: () => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;

export const ZoomableImagePreviewV2 = forwardRef<ZoomableImagePreviewV2Ref, Props>(function ZoomableImagePreviewV2(
  { uri, frameW, frameH, onLoad, onError },
  ref
) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const stx = useSharedValue(0);
  const sty = useSharedValue(0);

  const reset = () => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    tx.value = withSpring(0);
    ty.value = withSpring(0);
    stx.value = 0;
    sty.value = 0;
  };

  useImperativeHandle(ref, () => ({ reset }), []);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
      scale.value = next;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= MIN_SCALE + 0.02) {
        scale.value = 1;
        savedScale.value = 1;
        tx.value = 0;
        ty.value = 0;
        stx.value = 0;
        sty.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > MIN_SCALE + 0.02) {
        tx.value = stx.value + e.translationX;
        ty.value = sty.value + e.translationY;
      }
    })
    .onEnd(() => {
      stx.value = tx.value;
      sty.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(320)
    .onEnd(() => {
      scale.value = withSpring(1);
      savedScale.value = 1;
      tx.value = withSpring(0);
      ty.value = withSpring(0);
      stx.value = 0;
      sty.value = 0;
    });

  const composed = Gesture.Simultaneous(Gesture.Simultaneous(pinch, pan), doubleTap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <View style={{ width: frameW, height: frameH, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[{ width: frameW, height: frameH, justifyContent: 'center', alignItems: 'center' }, animStyle]}>
          <EImage
            source={{ uri }}
            style={{ width: frameW, height: frameH }}
            contentFit="contain"
            onLoad={onLoad}
            onError={onError}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
});
