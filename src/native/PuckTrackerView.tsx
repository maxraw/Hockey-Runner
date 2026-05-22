import React from 'react';
import { NativeSyntheticEvent, requireNativeComponent, StyleSheet, ViewStyle } from 'react-native';

export type NativePuckTrackingState = 'idle' | 'calibrating' | 'locked' | 'weak' | 'lost' | 'error';

export type NativePuckTrackingEvent = {
  x: number | null;
  y: number | null;
  confidence: number;
  bbox?: { x: number; y: number; width: number; height: number };
  state: NativePuckTrackingState;
  reason?: string;
  ts: number;
};

type Props = {
  style?: ViewStyle;
  confidenceThreshold?: number;
  iouThreshold?: number;
  runEveryNthFrame?: number;
  onPuck?: (event: NativePuckTrackingEvent) => void;
};

type NativeEvent = NativeSyntheticEvent<NativePuckTrackingEvent>;

const NativePuckTrackerView = requireNativeComponent<Props & { onPuck?: (event: NativeEvent) => void }>('PuckTrackerView');

export function PuckTrackerView(props: Props) {
  return (
    <NativePuckTrackerView
      style={[styles.view, props.style]}
      confidenceThreshold={props.confidenceThreshold ?? 0.35}
      iouThreshold={props.iouThreshold ?? 0.7}
      runEveryNthFrame={props.runEveryNthFrame ?? 2}
      onPuck={(event: NativeEvent) => props.onPuck?.(event.nativeEvent)}
    />
  );
}

const styles = StyleSheet.create({
  view: {
    flex: 1,
    backgroundColor: '#020617',
  },
});
