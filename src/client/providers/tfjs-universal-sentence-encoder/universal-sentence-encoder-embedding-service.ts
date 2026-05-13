import "@tensorflow/tfjs-backend-wasm";
import * as tf from "@tensorflow/tfjs";
import * as use from "@tensorflow-models/universal-sentence-encoder";
import type { EmbeddingService } from "#/client/search-index/embedding-service/embedding-service.ts";

/** UniversalSentenceEncoderEmbeddingService provides 512-dimensional text embeddings using TensorFlow.js. */
export class UniversalSentenceEncoderEmbeddingService
  implements EmbeddingService {
  private modelPromise: Promise<use.UniversalSentenceEncoder> | null = null;

  public constructor() {
    // Initialize backend immediately
    tf.setBackend("wasm").catch(console.error);
  }

  private async getModel(): Promise<use.UniversalSentenceEncoder> {
    if (!this.modelPromise) {
      console.log("Loading TensorFlow USE model...");
      this.modelPromise = use.load();
      const model = await this.modelPromise;
      console.log("Model loaded.");
      return model;
    }
    return this.modelPromise;
  }

  /** embed converts text segments into 512-dimensional vector arrays. */
  public async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const model = await this.getModel();
    const tensor = await model.embed(texts);
    const data = await tensor.data();
    tensor.dispose();

    // The data is a flattened Float32Array. We need to split it into chunks of 512.
    const dimensions = 512;
    const result: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const slice = data.slice(i * dimensions, (i + 1) * dimensions);
      result.push(Array.from(slice));
    }
    return result;
  }
}
