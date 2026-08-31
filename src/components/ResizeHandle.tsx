import { useEffect, useRef, type CSSProperties } from 'react';

interface ResizeHandleProps {
  /** `x` = a vertical bar dragged left/right; `y` = a horizontal bar dragged up/down. */
  axis: 'x' | 'y';
  /** Called on every pointer move with the pixels moved since the last event. */
  onDelta: (delta: number) => void;
  onDone?: () => void;
  /** Double-click on the handle, e.g. to restore the default size. */
  onReset?: () => void;
  label: string;
  style?: CSSProperties;
}

export function ResizeHandle({ axis, onDelta, onDone, onReset, label, style }: ResizeHandleProps) {
  // Keep the latest callbacks in refs so the listeners attached on pointerdown
  // always see current values without being re-bound mid-drag.
  const onDeltaRef = useRef(onDelta);
  const onDoneRef = useRef(onDone);
  onDeltaRef.current = onDelta;
  onDoneRef.current = onDone;

  const dragging = useRef(false);
  const last = useRef(0);

  useEffect(() => {
    function move(event: PointerEvent) {
      if (!dragging.current) return;
      const pos = axis === 'x' ? event.clientX : event.clientY;
      onDeltaRef.current(pos - last.current);
      last.current = pos;
    }
    function up() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onDoneRef.current?.();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [axis]);

  function onPointerDown(event: React.PointerEvent) {
    event.preventDefault();
    dragging.current = true;
    last.current = axis === 'x' ? event.clientX : event.clientY;
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }

  return (
    <div
      className={`resize-handle resize-handle--${axis}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      style={style}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
    />
  );
}
