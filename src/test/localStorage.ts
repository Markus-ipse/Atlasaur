// Test setup: make sure `localStorage` exists under jsdom.
//
// Node 20 needs nothing here — jsdom supplies a real `localStorage` and
// vitest copies it onto the global. Node 22 added an experimental
// `localStorage` GLOBAL of its own, unavailable unless the process is started
// with `--localstorage-file`. Vitest's jsdom environment does not overwrite a
// global that already exists, so from Node 22 on, jsdom's working
// implementation is shadowed by Node's non-working one and every test that
// touches a persisted store dies in its `beforeEach` with
// "Cannot read properties of undefined (reading 'clear')". CI pins Node 20,
// so this only ever broke local runs — which is how it went unnoticed.
//
// Rather than ask everyone to remember a Node flag, install a minimal
// in-memory Storage when there isn't a usable one. The app only needs
// getItem / setItem / removeItem / clear; `StorageEvent` is a separate jsdom
// global that the cross-tab tests construct by hand, so it is unaffected.

function createStorage(): Storage {
  let map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(String(k)) ?? null,
    setItem: (k: string, v: string) => void map.set(String(k), String(v)),
    removeItem: (k: string) => void map.delete(String(k)),
    clear: () => {
      map = new Map();
    },
  } as Storage;
}

function usable(storage: Storage | undefined): boolean {
  try {
    // Touching Node's experimental global throws without --localstorage-file,
    // so "exists" is not the same question as "works".
    return Boolean(storage) && typeof storage!.getItem === "function";
  } catch {
    return false;
  }
}

if (typeof globalThis !== "undefined") {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    let current: Storage | undefined;
    try {
      current = globalThis[name];
    } catch {
      current = undefined;
    }
    if (!usable(current)) {
      Object.defineProperty(globalThis, name, {
        value: createStorage(),
        configurable: true,
        writable: true,
      });
    }
  }
}
