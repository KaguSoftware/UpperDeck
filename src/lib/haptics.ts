export function tap(): void {
  if (typeof navigator !== "undefined") navigator.vibrate?.(10);
}

export function buzz(): void {
  if (typeof navigator !== "undefined") navigator.vibrate?.([12, 40, 12]);
}
