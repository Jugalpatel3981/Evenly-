// Choosing a photo, shrinking it, and uploading it to Supabase Storage.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

import { sb } from './supabase';

export type Photo = {uri: string; bytes: ArrayBuffer};

function decode(b64: string){
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// Pick a photo from the library (or take one with the camera), shrunk to at most `max` pixels on its longest side, as JPEG.
// Returns null if the person cancels.
export async function pickPhoto(max: number, source: 'library' | 'camera' = 'library'): Promise<Photo | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Allow Evenly to use the camera in your phone’s settings, then try again.');
  }
  const opts: ImagePicker.ImagePickerOptions = {mediaTypes: ['images'], quality: 1};
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const scale = Math.min(1, max / Math.max(a.width || max, a.height || max));
  const ctx = ImageManipulator.manipulate(a.uri);
  if (scale < 1) ctx.resize(a.width >= a.height ? {width: Math.round(a.width * scale)} : {height: Math.round(a.height * scale)});
  const img = await (await ctx.renderAsync()).saveAsync({format: SaveFormat.JPEG, compress: 0.85, base64: true});
  if (!img.base64) throw new Error('Could not read that image.');
  return {uri: img.uri, bytes: decode(img.base64)};
}

export async function upload(bucket: string, path: string, photo: Photo){
  const {error} = await sb.storage.from(bucket).upload(path, photo.bytes, {contentType: 'image/jpeg', upsert: true});
  if (error) throw error;
  return path;
}
export const publicUrl = (bucket: string, path: string) => sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;

// The camera only makes sense on phones; browsers just get the file picker.
export const hasCamera = Platform.OS !== 'web';

// Phones: ask whether to take a photo or choose one. Browsers: straight to the file picker.
export function choosePhoto(max: number, title: string): Promise<Photo | null> {
  if (!hasCamera) return pickPhoto(max, 'library');
  return new Promise((resolve, reject) => {
    const go = (s: 'library' | 'camera') => pickPhoto(max, s).then(resolve, reject);
    Alert.alert(title, undefined, [
      {text: 'Take photo', onPress: () => go('camera')},
      {text: 'Choose from library', onPress: () => go('library')},
      {text: 'Cancel', style: 'cancel', onPress: () => resolve(null)},
    ], {cancelable: true, onDismiss: () => resolve(null)});
  });
}

// "<prefix>-<time>.jpg": a new name for each upload, so phones don't show an old cached copy.
export const stampedPath = (prefix: string) => `${prefix}-${Date.now()}.jpg`;
