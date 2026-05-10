import type * as rdfjs from "@rdfjs/types";

export interface ImportRequest {
  // TODO: define ImportRequest
}

export interface ImportResponse {
  // TODO: define ImportResponse
}


export async function applyImport(store: rdfjs.Store, request: ImportRequest): Promise<ImportResponse> {
  return {
    success: false,
    message: "Not implemented",
  };
}