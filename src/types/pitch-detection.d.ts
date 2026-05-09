declare module "pitch-detection" {
  export function chroma(
    data: Float32Array | Float64Array,
    params?: {
      fs?: number;
      method?: "pcp" | "nnls";
      minFreq?: number;
      maxFreq?: number;
      harmonics?: number;
      iterations?: number;
    },
  ): Float64Array;

  export function key(
    input:
      | Float64Array
      | Float32Array
      | number[]
      | Array<Float64Array | Float32Array | number[]>,
    params?: {
      profile?: { major: number[]; minor: number[] };
    },
  ): {
    tonic: number;
    mode: "major" | "minor";
    label: string;
    confidence: number;
    scores: { label: string; score: number }[];
  };
}
