interface TiktokenEncoder {
  encode(text: string): number[];
}

let tiktokenEncoder: TiktokenEncoder | null = null;

export async function getTokenCounter(modelName: string): Promise<((text: string) => number) | null> {
  if (modelName.includes('text-embedding') || modelName.includes('ada-002')) {
    if (!tiktokenEncoder) {
      try {
        const tiktoken = await import('tiktoken');
        const encoder = tiktoken.encoding_for_model('text-embedding-3-large');
        // Wrap the encoder to convert Uint32Array to number[]
        tiktokenEncoder = {
          encode: (text: string) => Array.from(encoder.encode(text))
        };
      } catch {
        console.warn('tiktoken not available, falling back to character estimation');
        return null;
      }
    }
    const encoder = tiktokenEncoder;
    if (!encoder) {
      return null;
    }
    return (text: string) => encoder.encode(text).length;
  }

  return (text: string) => Math.ceil(text.length / 4);
}
