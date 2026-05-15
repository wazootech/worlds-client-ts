import { toFileUrl } from "@std/path";
import "@tensorflow/tfjs-backend-wasm";
import * as tf from "@tensorflow/tfjs";
import * as use from "@tensorflow-models/universal-sentence-encoder";
import type { EmbeddingService } from "#/client/search-index/embedding-service/embedding-service.ts";

/** UniversalSentenceEncoderEmbeddingServiceOptions defines the configuration for local or remote model resources. */
export interface UniversalSentenceEncoderEmbeddingServiceOptions {
  /** modelUrl is the custom URL or local file path to the model.json file. */
  modelUrl?: string;

  /** vocabUrl is the custom URL or local file path to the vocab.json file. */
  vocabUrl?: string;
}

/** UniversalSentenceEncoderEmbeddingService provides 512-dimensional text embeddings using TensorFlow.js. */
export class UniversalSentenceEncoderEmbeddingService
  implements EmbeddingService {
  private readonly options: UniversalSentenceEncoderEmbeddingServiceOptions;
  private modelPromise: Promise<use.UniversalSentenceEncoder> | null = null;

  public constructor(
    options: UniversalSentenceEncoderEmbeddingServiceOptions = {},
  ) {
    this.options = options;
    // Initialize backend immediately
    tf.setBackend("wasm").catch(console.error);
  }

  private async getModel(): Promise<use.UniversalSentenceEncoder> {
    if (!this.modelPromise) {
      console.log("Loading TensorFlow USE model...");
      const config: { modelUrl?: string; vocabUrl?: string } = {};

      if (this.options.modelUrl) {
        config.modelUrl = this.resolveToUrlString(this.options.modelUrl);
      }
      if (this.options.vocabUrl) {
        config.vocabUrl = this.resolveToUrlString(this.options.vocabUrl);
      }

      console.log(`[UniversalSentenceEncoderEmbeddingService] config=`, config);
      this.modelPromise = use.load(config);
      const model = await this.modelPromise;
      console.log("Model loaded.");
      return model;
    }
    return this.modelPromise;
  }

  private resolveToUrlString(pathOrUrl: string): string {
    if (
      pathOrUrl.startsWith("http://") ||
      pathOrUrl.startsWith("https://") ||
      pathOrUrl.startsWith("file://")
    ) {
      return pathOrUrl;
    }
    try {
      // Assuming local system path if it isn't an explicit protocol.
      const absolutePath = Deno.realPathSync(pathOrUrl);
      return toFileUrl(absolutePath).toString();
    } catch (_error) {
      // Fallback if file does not exist or error occurs (treat as URL or string anyway)
      return pathOrUrl;
    }
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
