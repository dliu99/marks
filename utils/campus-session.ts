import 'react-native-get-random-values';
import * as SecureStore from 'expo-secure-store';
import { createMMKV } from 'react-native-mmkv';
import { campusSessionSchema, type CampusSession } from '../api/src/shared/campus-session';

let secureStorage: ReturnType<typeof createMMKV> | null = null;
let session: CampusSession | null = null;
let generation = 0;

export async function initializeCampusStorage() {
  if (secureStorage) return;
  let key = await SecureStore.getItemAsync('marks.private-key-v1');
  if (!key) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    key = Array.from(bytes, (byte) => alphabet[byte % 64]).join('');
    await SecureStore.setItemAsync('marks.private-key-v1', key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  secureStorage = createMMKV({
    id: 'marks-private-v1',
    encryptionKey: key,
    encryptionType: 'AES-256',
  });
  const raw = secureStorage.getString('session');
  if (raw) {
    try {
      session = campusSessionSchema.parse(JSON.parse(raw));
    } catch {
      secureStorage.remove('session');
    }
  }
  // 1.2.1–1.2.3 saved school data here and showed it when a refresh failed. Grades are
  // now only shown from a successful request, so delete what earlier versions saved.
  secureStorage.remove('school-cache-v1');
}

export const campusSessions = {
  get: () => session,
  generation: () => generation,
  save(value: CampusSession) {
    if (!secureStorage) throw new Error('Device storage is not ready.');
    const parsed = campusSessionSchema.parse(value);
    secureStorage.set('session', JSON.stringify(parsed));
    session = parsed;
  },
};

export function clearCampusSession() {
  generation += 1;
  session = null;
  secureStorage?.clearAll();
}

export function getPrivateStorage() {
  if (!secureStorage) throw new Error('Device storage is not ready.');
  return secureStorage;
}
