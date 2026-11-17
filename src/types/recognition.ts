export interface RecognitionListItem {
  id: number;
  image_name: string;
  image_size: number;
  status: string;
  error_message: string;
  created_at: string;
  word_count: number;
}

export interface RecognitionListResponse {
  items: RecognitionListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RecognitionWord {
  word: string;
  inWordbook: boolean;
}

export interface RecognitionDetail {
  id: number;
  imageName: string;
  imageSize: number;
  status: string;
  errorMessage: string;
  createdAt: string;
  words: RecognitionWord[];
}
