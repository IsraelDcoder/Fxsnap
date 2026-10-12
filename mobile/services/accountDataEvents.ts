const accountDataListeners = new Set<() => void>();

export function notifyAccountDataChanged() {
  accountDataListeners.forEach((listener) => listener());
}

export function subscribeToAccountDataChanges(listener: () => void) {
  accountDataListeners.add(listener);
  return () => {
    accountDataListeners.delete(listener);
  };
}
