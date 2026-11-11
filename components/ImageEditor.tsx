import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, Modal, View, TouchableOpacity, StyleSheet, Image, PanResponder, TextInput, Alert, ActivityIndicator, useWindowDimensions, ScrollView } from 'react-native';
import Text from '@/components/AppText';
import Svg, { Path } from 'react-native-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Full-screen picture editor: Crop (shape presets + rotate), Draw (freehand,
// six colours, two thicknesses, undo) and Text (drag to move, tap to edit).
// "Done" flattens the picture and everything on it into a single new image.
type Stroke = { d: string; color: string; width: number };
type Label = { id: string; text: string; color: string; x: number; y: number };

const COLORS = ['#FFFFFF', '#111111', '#EF4444', '#FACC15', '#22C55E', '#3B82F6'];

// Crop/rotate through expo-image-manipulator (new API, with the older one as fallback).
async function transform(uri: string, op: { crop?: { originX: number; originY: number; width: number; height: number }; rotate?: number }) {
  const mod: any = await import('expo-image-manipulator');
  if (mod.ImageManipulator?.manipulate) {
    const ctx = mod.ImageManipulator.manipulate(uri);
    if (op.crop) ctx.crop(op.crop);
    if (op.rotate) ctx.rotate(op.rotate);
    const rendered = await ctx.renderAsync();
    return rendered.saveAsync({ compress: 0.92, format: mod.SaveFormat?.JPEG ?? 'jpeg' });
  }
  const actions: any[] = [];
  if (op.crop) actions.push({ crop: op.crop });
  if (op.rotate) actions.push({ rotate: op.rotate });
  return mod.manipulateAsync(uri, actions, { compress: 0.92, format: mod.SaveFormat.JPEG });
}


// A crop box you can resize from any corner or edge and drag around, in
// canvas coordinates. The area outside the box is dimmed.
type Rect = { x: number; y: number; w: number; h: number };
const MIN = 40;

const PAD = 34; // free space around the picture so the edge/corner handles can always be grabbed

function CropBox({ cw, ch, rect, onChange }: { cw: number; ch: number; rect: Rect; onChange: (r: Rect) => void }) {
  const start = useRef<Rect>(rect);
  const latest = useRef<Rect>(rect);
  latest.current = rect;

  const make = (edges: { l?: boolean; r?: boolean; t?: boolean; b?: boolean; move?: boolean }) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start.current = { ...latest.current };
      },
      onPanResponderMove: (_, g) => {
        const s = start.current;
        let { x, y, w, h } = s;
        if (edges.move) {
          x = Math.min(Math.max(0, s.x + g.dx), cw - s.w);
          y = Math.min(Math.max(0, s.y + g.dy), ch - s.h);
        } else {
          if (edges.l) {
            const nx = Math.min(Math.max(0, s.x + g.dx), s.x + s.w - MIN);
            w = s.w + (s.x - nx);
            x = nx;
          }
          if (edges.r) w = Math.min(Math.max(MIN, s.w + g.dx), cw - s.x);
          if (edges.t) {
            const ny = Math.min(Math.max(0, s.y + g.dy), s.y + s.h - MIN);
            h = s.h + (s.y - ny);
            y = ny;
          }
          if (edges.b) h = Math.min(Math.max(MIN, s.h + g.dy), ch - s.y);
        }
        onChange({ x, y, w, h });
      },
    });

  const pans = useMemo(
    () => ({
      move: make({ move: true }),
      tl: make({ l: true, t: true }),
      tr: make({ r: true, t: true }),
      bl: make({ l: true, b: true }),
      br: make({ r: true, b: true }),
      t: make({ t: true }),
      b: make({ b: true }),
      l: make({ l: true }),
      r: make({ r: true }),
    }),
    []
  );

  const H = 40; // touch size of a handle
  const dot = (key: keyof typeof pans, left: number, top: number, corner: boolean) => (
    <View key={key} {...pans[key].panHandlers} style={{ position: 'absolute', left: left + PAD - H / 2, top: top + PAD - H / 2, width: H, height: H, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: corner ? 14 : 22, height: corner ? 14 : 6, borderRadius: corner ? 7 : 3, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.4)' }} />
    </View>
  );
  const { x, y, w, h } = rect;
  return (
    <View style={{ position: 'absolute', width: cw + PAD * 2, height: ch + PAD * 2 }} pointerEvents="box-none">
      {/* dim outside the box (only over the picture) */}
      <View pointerEvents="none" style={{ position: 'absolute', left: PAD, top: PAD, width: cw, height: y, backgroundColor: 'rgba(0,0,0,0.55)' }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: PAD, top: PAD + y + h, width: cw, height: ch - y - h, backgroundColor: 'rgba(0,0,0,0.55)' }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: PAD, top: PAD + y, width: x, height: h, backgroundColor: 'rgba(0,0,0,0.55)' }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: PAD + x + w, top: PAD + y, width: cw - x - w, height: h, backgroundColor: 'rgba(0,0,0,0.55)' }} />
      {/* the box: drag inside to move it */}
      <View {...pans.move.panHandlers} style={{ position: 'absolute', left: PAD + x, top: PAD + y, width: w, height: h, borderWidth: 1.5, borderColor: '#fff' }} />
      {dot('tl', x, y, true)}
      {dot('tr', x + w, y, true)}
      {dot('bl', x, y + h, true)}
      {dot('br', x + w, y + h, true)}
      {dot('t', x + w / 2, y, false)}
      {dot('b', x + w / 2, y + h, false)}
      {dot('l', x, y + h / 2, false)}
      {dot('r', x + w, y + h / 2, false)}
    </View>
  );
}

function DraggableLabel({ label, onMove, onEdit }: { label: Label; onMove: (id: string, x: number, y: number) => void; onEdit: (l: Label) => void }) {
  const start = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  const latest = useRef(label);
  latest.current = label;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start.current = { x: latest.current.x, y: latest.current.y };
          moved.current = false;
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) + Math.abs(g.dy) > 4) moved.current = true;
          onMove(latest.current.id, start.current.x + g.dx, start.current.y + g.dy);
        },
        onPanResponderRelease: () => {
          if (!moved.current) onEdit(latest.current);
        },
      }),
    []
  );
  return (
    <View {...pan.panHandlers} style={{ position: 'absolute', left: label.x, top: label.y }}>
      <Text style={{ color: label.color, fontSize: 28, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } }}>{label.text}</Text>
    </View>
  );
}

export default function ImageEditor({ visible, uri, onCancel, onDone, startMode }: { visible: boolean; uri: string | null; onCancel: () => void; onDone: (uri: string) => void; startMode?: 'crop' | 'draw' | 'text' }) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Inside a Modal the safe-area numbers can come back as 0, which put the
  // buttons under the clock. The status bar's real height is the fallback.
  const topPad = Math.max(insets.top, StatusBar.currentHeight || 0) + 6;
  const bottomPad = Math.max(insets.bottom, 12);
  const shotRef = useRef<any>(null);

  const [base, setBase] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [mode, setMode] = useState<'crop' | 'draw' | 'text'>('draw');
  const [color, setColor] = useState(COLORS[2]);
  const [thick, setThick] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [textModal, setTextModal] = useState<{ open: boolean; id?: string; value: string }>({ open: false, value: '' });
  const [busy, setBusy] = useState(false);
  const [cropRect, setCropRect] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 });

  // Live copies for the touch handler, which is created only once.
  const live = useRef({ mode, color, width: 5 });
  live.current = { mode, color, width: thick ? 11 : 5 };
  const pathRef = useRef('');

  useEffect(() => {
    if (!visible || !uri) return;
    setBase(uri);
    setStrokes([]);
    setLabels([]);
    setCurrent(null);
    setMode(startMode || 'draw');
    Image.getSize(uri, (w, h) => setSize({ w, h }), () => setSize({ w: 1, h: 1 }));
  }, [visible, uri]);

  // The picture is shown as large as fits, in its own shape.
  const availH = screenH - topPad - bottomPad - 56 - 150 - PAD * 2;
  const scale = Math.min((screenW - PAD * 2) / size.w, availH / size.h);
  const cw = Math.round(size.w * scale);
  const ch = Math.round(size.h * scale);

  // Copy the finished line BEFORE clearing it. Saving it from inside the
  // state update ran after pathRef had already been emptied, so every stroke
  // was saved blank — which is why drawings vanished the moment you let go.
  function finishStroke() {
    const d = pathRef.current;
    const stroke = { d, color: live.current.color, width: live.current.width };
    pathRef.current = '';
    setCurrent(null);
    if (d) setStrokes((prev) => [...prev, stroke]);
  }

  // Start the crop box over the whole picture whenever crop mode is opened or the picture changes.
  useEffect(() => {
    if (mode === 'crop') setCropRect({ x: 0, y: 0, w: cw, h: ch });
  }, [mode, cw, ch, base]);

  const drawPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => live.current.mode === 'draw',
        onMoveShouldSetPanResponder: () => live.current.mode === 'draw',
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          pathRef.current = `M${x.toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)}`;
          setCurrent(pathRef.current);
        },
        onPanResponderMove: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          pathRef.current += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
          setCurrent(pathRef.current);
        },
        onPanResponderRelease: finishStroke,
        onPanResponderTerminate: finishStroke,
      }),
    []
  );

  const confirmResetIfNeeded = (go: () => void) => {
    if (!strokes.length && !labels.length) return go();
    Alert.alert('Change the picture?', 'Cropping or rotating removes your drawings and text so they stay lined up.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () => {
          setStrokes([]);
          setLabels([]);
          go();
        },
      },
    ]);
  };

  // Cut the picture to the box, converting from on-screen units to real pixels.
  const applyCrop = () =>
    confirmResetIfNeeded(async () => {
      if (!base) return;
      setBusy(true);
      try {
        const k = size.w / cw;
        const originX = Math.max(0, Math.round(cropRect.x * k));
        const originY = Math.max(0, Math.round(cropRect.y * k));
        const width = Math.min(size.w - originX, Math.round(cropRect.w * k));
        const height = Math.min(size.h - originY, Math.round(cropRect.h * k));
        const out = await transform(base, { crop: { originX, originY, width, height } });
        setBase(out.uri);
        setSize({ w: out.width, h: out.height });
      } catch (err) {
        Alert.alert("Couldn't crop", 'Please try again.');
      }
      setBusy(false);
    });

  const rotate = () =>
    confirmResetIfNeeded(async () => {
      if (!base) return;
      setBusy(true);
      try {
        const out = await transform(base, { rotate: 90 });
        setBase(out.uri);
        setSize({ w: out.width, h: out.height });
      } catch {
        Alert.alert("Couldn't rotate", 'Please try again.');
      }
      setBusy(false);
    });

  const undo = () => {
    if (mode === 'text' && labels.length) setLabels((prev) => prev.slice(0, -1));
    else setStrokes((prev) => prev.slice(0, -1));
  };

  const saveText = () => {
    const value = textModal.value.trim();
    if (value) {
      if (textModal.id) setLabels((prev) => prev.map((l) => (l.id === textModal.id ? { ...l, text: value, color } : l)));
      else setLabels((prev) => [...prev, { id: String(Date.now()), text: value, color, x: Math.max(8, cw / 2 - 60), y: ch / 2 - 20 }]);
    }
    setTextModal({ open: false, value: '' });
  };

  const done = async () => {
    setBusy(true);
    try {
      const out = await captureRef(shotRef, { format: 'jpg', quality: 0.92, result: 'tmpfile' });
      onDone(out);
    } catch (err) {
      console.warn('[ImageEditor] capture failed:', err);
      Alert.alert("Couldn't save", 'Please try again.');
    }
    setBusy(false);
  };

  if (!visible || !uri) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000', paddingTop: topPad }}>
        <View style={styles.top}>
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.topText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={undo} disabled={!strokes.length && !labels.length}>
            <Ionicons name="arrow-undo" size={22} color={strokes.length || labels.length ? '#fff' : '#555'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={done} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={[styles.topText, { fontWeight: '800' }]}>Done</Text>}
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ViewShot ref={shotRef} options={{ format: 'jpg', quality: 0.92 }} style={{ width: cw, height: ch, backgroundColor: '#000' }}>
            {base && <Image source={{ uri: base }} style={{ width: cw, height: ch }} resizeMode="stretch" />}
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              {strokes.map((s, i) => (
                <Path key={i} d={s.d} stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ))}
              {current && <Path d={current} stroke={color} strokeWidth={thick ? 11 : 5} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
            </Svg>
            {labels.map((l) => (
              <DraggableLabel
                key={l.id}
                label={l}
                onMove={(id, x, y) => setLabels((prev) => prev.map((t) => (t.id === id ? { ...t, x, y } : t)))}
                onEdit={(t) => {
                  setMode('text');
                  setTextModal({ open: true, id: t.id, value: t.text });
                }}
              />
            ))}
          </ViewShot>
          {/* Drawing layer: only active in Draw mode, so Text and Crop never fight it for touches. */}
          {mode === 'draw' && <View {...drawPan.panHandlers} style={{ position: 'absolute', width: cw, height: ch }} />}
          {mode === 'crop' && <CropBox cw={cw} ch={ch} rect={cropRect} onChange={setCropRect} />}
        </View>

        <View style={[styles.bottom, { paddingBottom: bottomPad + 10 }]}>
          {mode === 'draw' && (
            <View style={styles.row}>
              {COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? '#fff' : '#444' }]} />
              ))}
              <TouchableOpacity onPress={() => setThick((t) => !t)} style={styles.thickBtn}>
                <View style={{ width: 22, height: thick ? 9 : 4, borderRadius: 5, backgroundColor: '#fff' }} />
              </TouchableOpacity>
            </View>
          )}
          {mode === 'text' && (
            <View style={styles.row}>
              {COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? '#fff' : '#444' }]} />
              ))}
              <TouchableOpacity onPress={() => setTextModal({ open: true, value: '' })} style={[styles.pill, { backgroundColor: '#3B82F6' }]}>
                <Text style={styles.pillText}>+ Add text</Text>
              </TouchableOpacity>
            </View>
          )}
          {mode === 'crop' && (
            <View style={styles.row}>
              <Text style={{ color: '#aaa', fontSize: 12, flex: 1 }}>Drag any corner or edge freely, or move the box.</Text>
              <TouchableOpacity onPress={rotate} style={styles.pill}>
                <Ionicons name="refresh" size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={applyCrop} style={[styles.pill, { backgroundColor: '#3B82F6' }]}>
                <Text style={styles.pillText}>Apply crop</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.tabs}>
            {([['crop', 'crop', 'Crop'], ['draw', 'brush', 'Draw'], ['text', 'text', 'Text']] as const).map(([m, icon, label]) => (
              <TouchableOpacity key={m} onPress={() => setMode(m)} style={styles.tab}>
                <Ionicons name={icon as any} size={22} color={mode === m ? '#3B82F6' : '#aaa'} />
                <Text style={{ color: mode === m ? '#3B82F6' : '#aaa', fontSize: 12, marginTop: 2 }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Modal visible={textModal.open} transparent animationType="fade" onRequestClose={() => setTextModal({ open: false, value: '' })}>
          <View style={styles.textBackdrop}>
            <View style={styles.textBox}>
              <TextInput
                value={textModal.value}
                onChangeText={(v) => setTextModal((t) => ({ ...t, value: v }))}
                placeholder="Type something…"
                placeholderTextColor="#777"
                autoFocus
                style={{ color: '#fff', fontSize: 20, paddingVertical: 8 }}
                maxLength={80}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                {textModal.id ? (
                  <TouchableOpacity
                    onPress={() => {
                      setLabels((prev) => prev.filter((l) => l.id !== textModal.id));
                      setTextModal({ open: false, value: '' });
                    }}
                  >
                    <Text style={{ color: '#EF4444', fontWeight: '700' }}>Delete</Text>
                  </TouchableOpacity>
                ) : (
                  <View />
                )}
                <View style={{ flexDirection: 'row', gap: 20 }}>
                  <TouchableOpacity onPress={() => setTextModal({ open: false, value: '' })}>
                    <Text style={{ color: '#aaa', fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveText}>
                    <Text style={{ color: '#3B82F6', fontWeight: '800' }}>OK</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  top: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  topText: { color: '#fff', fontSize: 16 },
  bottom: { paddingTop: 10, backgroundColor: '#0b0b0f' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10, minHeight: 56 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  thickBtn: { width: 44, height: 30, borderRadius: 15, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  pill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#222' },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 6 },
  tab: { alignItems: 'center', paddingHorizontal: 22, paddingVertical: 4 },
  textBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  textBox: { backgroundColor: '#1a1a22', borderRadius: 16, padding: 16 },
});
