export interface AnalysisRetryRequest {
  imageBase64: string;
  imageMimeType: string;
  imageUri: string;
  pair: string;
}

let retryRequest: AnalysisRetryRequest | null = null;

export function storeAnalysisRetryRequest(request: AnalysisRetryRequest) {
  retryRequest = request;
}

export function getAnalysisRetryRequest(): AnalysisRetryRequest | null {
  return retryRequest;
}

export function clearAnalysisRetryRequest() {
  retryRequest = null;
}
