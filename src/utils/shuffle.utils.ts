/**
 * Deterministic string hash generating an unsigned 32-bit integer (FNV-1a 32-bit).
 */
export function hashStringToUint32(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

/**
 * Linear Congruential Generator (LCG) PRNG returning float in [0, 1).
 */
export function createPRNG(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/**
 * Deterministic Fisher-Yates shuffle using a deterministic seed string.
 * Example seed: `${examId}:${userId}:${generationVersion}`
 */
export function deterministicShuffle<T>(items: T[], seedString: string): T[] {
    const list = [...items];
    const seed = hashStringToUint32(seedString);
    const prng = createPRNG(seed);

    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        const temp = list[i]!;
        list[i] = list[j]!;
        list[j] = temp;
    }

    return list;
}
