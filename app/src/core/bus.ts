type Handler<T> = (payload: T) => void;

/** Minimal typed event bus; `on` returns its own unsubscribe for cleanupFuncs. */
export class Bus<Events extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) (handler as Handler<Events[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
